"""
PulseNet Backend — Service Check Engine

Runs agentless probes (ping / HTTP / TCP) and turns the results into
check state, "check_down" alerts and — for hosts without an agent — the
host's online/offline status.

State machine per check:
  - success                       → state "up", failure counter reset,
                                    open check alert resolved.
  - failure                       → counter +1; once it reaches
                                    `fail_threshold` the state becomes "down"
                                    and ONE critical alert is opened.
  A single blip therefore never raises an alert (default threshold: 3).
"""

import asyncio
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.alert import Alert
from app.models.check import Check, CheckResult
from app.models.host import Host

CHECK_DOWN = "check_down"
MAX_CONCURRENT_PROBES = 20
SCHEDULER_TICK_S = 5

_PING_TIME_RE = re.compile(r"time[=<]\s*([\d.]+)\s*ms")


@dataclass
class ProbeResult:
    success: bool
    response_ms: float | None = None
    error: str | None = None


def _fail(msg: str) -> ProbeResult:
    return ProbeResult(False, None, msg[:500])


# ---------------------------------------------------------------------------
# Probes
# ---------------------------------------------------------------------------

async def probe_ping(target: str, timeout: int) -> ProbeResult:
    started = time.perf_counter()
    try:
        proc = await asyncio.create_subprocess_exec(
            "ping", "-c", "1", "-W", str(timeout), target,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        return _fail("ping binary is not installed in the backend container")

    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout + 2)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()  # reap the child so it cannot pile up as a zombie
        return _fail("Ping timed out")

    if proc.returncode == 0:
        match = _PING_TIME_RE.search(out.decode(errors="replace"))
        elapsed = (time.perf_counter() - started) * 1000
        return ProbeResult(True, float(match.group(1)) if match else round(elapsed, 2))

    detail = (err or out).decode(errors="replace").strip().splitlines()
    if proc.returncode == 1:
        return _fail("No reply (host unreachable)")
    return _fail(detail[-1] if detail else f"ping exited with code {proc.returncode}")


async def probe_tcp(target: str, port: int, timeout: int) -> ProbeResult:
    started = time.perf_counter()
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(target, port), timeout=timeout
        )
    except asyncio.TimeoutError:
        return _fail(f"Connection to port {port} timed out")
    except OSError as exc:
        return _fail(f"Port {port}: {exc.strerror or exc.__class__.__name__}")

    elapsed = (time.perf_counter() - started) * 1000
    writer.close()
    try:
        await writer.wait_closed()
    except OSError:
        pass
    return ProbeResult(True, round(elapsed, 2))


async def probe_http(url: str, timeout: int, expected_status: int | None) -> ProbeResult:
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            # stream() returns as soon as headers arrive — we never download the body
            async with client.stream("GET", url) as response:
                status = response.status_code
    except httpx.TimeoutException:
        return _fail("Request timed out")
    except httpx.HTTPError as exc:
        return _fail(f"{exc.__class__.__name__}: {exc}" if str(exc) else exc.__class__.__name__)
    except Exception as exc:  # invalid URL etc.
        return _fail(f"{exc.__class__.__name__}: {exc}")

    elapsed = round((time.perf_counter() - started) * 1000, 2)
    ok = status == expected_status if expected_status else 200 <= status < 400
    if ok:
        return ProbeResult(True, elapsed)
    if expected_status:
        return ProbeResult(False, elapsed, f"HTTP {status} (expected {expected_status})")
    return ProbeResult(False, elapsed, f"HTTP {status}")


async def run_probe(
    check_type: str, target: str, port: int | None, timeout: int, expected_status: int | None
) -> ProbeResult:
    if check_type == "ping":
        return await probe_ping(target, timeout)
    if check_type == "tcp":
        return await probe_tcp(target, port or 0, timeout)
    if check_type == "http":
        return await probe_http(target, timeout, expected_status)
    return _fail(f"Unknown check type '{check_type}'")


def effective_target(check: Check, host: Host) -> str:
    """ping/tcp fall back to the host's IP when no explicit target is set."""
    return check.target or host.ip_address


# ---------------------------------------------------------------------------
# Applying results
# ---------------------------------------------------------------------------

async def resolve_open_alerts(db: AsyncSession, check_id: str) -> None:
    """Resolve every open alert belonging to a check. Does not commit."""
    result = await db.execute(
        select(Alert).where(Alert.check_id == check_id).where(Alert.status == "open")
    )
    now = datetime.now(timezone.utc)
    for alert in result.scalars().all():
        alert.status = "resolved"
        alert.resolved_at = now


async def apply_result(
    db: AsyncSession, check: Check, host: Host, result: ProbeResult
) -> None:
    """Record one probe result and advance the check's state machine.

    Does not commit — the caller owns the transaction.
    """
    now = datetime.now(timezone.utc)
    check.last_checked_at = now
    check.last_response_ms = result.response_ms
    check.last_error = result.error

    db.add(CheckResult(
        check_id=check.id,
        timestamp=now,
        success=result.success,
        response_ms=result.response_ms,
        error=result.error,
    ))

    if result.success:
        check.consecutive_failures = 0
        check.state = "up"
        check.last_success_at = now
        await resolve_open_alerts(db, check.id)
    else:
        check.consecutive_failures += 1
        if check.consecutive_failures >= check.fail_threshold and check.state != "down":
            check.state = "down"
            existing = await db.execute(
                select(Alert.id)
                .where(Alert.check_id == check.id)
                .where(Alert.status == "open")
                .limit(1)
            )
            if existing.first() is None:
                message = (
                    f"Check '{check.name}' ({check.type}) is down: "
                    f"{result.error or 'no response'} "
                    f"[{check.consecutive_failures} failed runs in a row]"
                )
                db.add(Alert(
                    host_id=host.id,
                    check_id=check.id,
                    metric_type=CHECK_DOWN,
                    severity="critical",
                    value=float(check.consecutive_failures),
                    threshold=float(check.fail_threshold),
                    message=message[:512],
                ))

    await db.flush()
    await refresh_agentless_host_status(db, host)


async def refresh_agentless_host_status(db: AsyncSession, host: Host) -> None:
    """Derive online/offline from checks for hosts that never had an agent.

    Hosts that report through an agent (last_seen_at set) are owned by the
    agent status watcher and are left alone.
    """
    if host.last_seen_at is not None:
        return
    states = set(
        (await db.execute(
            select(Check.state).where(Check.host_id == host.id).where(Check.enabled.is_(True))
        )).scalars().all()
    )
    if "up" in states:
        host.status = "online"
    elif "down" in states:
        host.status = "offline"


# ---------------------------------------------------------------------------
# Scheduler
# ---------------------------------------------------------------------------

async def run_check_now(db: AsyncSession, check: Check) -> Check:
    """Run a single check immediately (manual "Run now" button)."""
    host = await db.get(Host, check.host_id)
    if host is None:
        return check
    result = await run_probe(
        check.type, effective_target(check, host), check.port,
        check.timeout_seconds, check.expected_status,
    )
    await apply_result(db, check, host, result)
    await db.commit()
    await db.refresh(check)
    return check


async def run_due_checks() -> int:
    """Run every enabled check whose interval has elapsed. Returns how many ran."""
    now = datetime.now(timezone.utc)

    # 1) Read what is due, then close the session — probes can take seconds
    #    and must not hold a transaction open.
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(Check, Host).join(Host, Host.id == Check.host_id).where(Check.enabled.is_(True))
        )).all()
        due = [
            (c.id, c.type, effective_target(c, h), c.port, c.timeout_seconds, c.expected_status)
            for c, h in rows
            if c.last_checked_at is None
            or (now - c.last_checked_at).total_seconds() >= c.interval_seconds
        ]
    if not due:
        return 0

    # 2) Probe concurrently
    sem = asyncio.Semaphore(MAX_CONCURRENT_PROBES)

    async def _probe(item):
        async with sem:
            _, ctype, target, port, timeout, expected = item
            return await run_probe(ctype, target, port, timeout, expected)

    results = await asyncio.gather(*(_probe(item) for item in due))

    # 3) Persist
    async with AsyncSessionLocal() as db:
        for item, result in zip(due, results):
            check = await db.get(Check, item[0])
            if check is None:  # deleted while probing
                continue
            host = await db.get(Host, check.host_id)
            if host is None:
                continue
            await apply_result(db, check, host, result)
        await db.commit()
    return len(due)


async def check_scheduler() -> None:
    """Background task: run due checks every SCHEDULER_TICK_S seconds."""
    while True:
        try:
            await run_due_checks()
        except Exception as exc:
            print(f"[checks] scheduler error: {exc}")
        await asyncio.sleep(SCHEDULER_TICK_S)
