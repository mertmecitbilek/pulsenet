"""
PulseNet Backend — Service Checks Router

Routes:
  GET    /api/checks                 → list checks (optionally ?host_id=)      [JWT]
  POST   /api/checks                 → create a check                          [admin]
  PATCH  /api/checks/{id}            → update a check                          [admin]
  DELETE /api/checks/{id}            → delete a check (resolves its alerts)    [admin]
  POST   /api/checks/{id}/run        → run it right now                        [admin]
  GET    /api/checks/{id}/results    → recent results, oldest first            [JWT]
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.check import Check, CheckResult
from app.models.host import Host
from app.models.user import User
from app.schemas.check import (
    CheckCreate,
    CheckResponse,
    CheckResultResponse,
    CheckUpdate,
    validate_check_config,
)
from app.services.auth_service import get_current_user, require_admin
from app.services.check_service import (
    refresh_agentless_host_status,
    resolve_open_alerts,
    run_check_now,
)

router = APIRouter(prefix="/api/checks", tags=["checks"])


async def _uptime_24h(db: AsyncSession, check_ids: list[str]) -> dict[str, float]:
    if not check_ids:
        return {}
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    rows = await db.execute(
        select(
            CheckResult.check_id,
            func.avg(case((CheckResult.success.is_(True), 1.0), else_=0.0)),
        )
        .where(CheckResult.check_id.in_(check_ids), CheckResult.timestamp >= since)
        .group_by(CheckResult.check_id)
    )
    return {cid: round(float(avg) * 100, 2) for cid, avg in rows.all()}


async def _respond(db: AsyncSession, checks: list[Check]) -> list[CheckResponse]:
    uptimes = await _uptime_24h(db, [c.id for c in checks])
    out = []
    for c in checks:
        item = CheckResponse.model_validate(c)
        item.uptime_24h = uptimes.get(c.id)
        out.append(item)
    return out


async def _get_or_404(db: AsyncSession, check_id: str) -> Check:
    check = await db.get(Check, check_id)
    if not check:
        raise HTTPException(status_code=404, detail="Check not found")
    return check


@router.get("/", response_model=list[CheckResponse])
async def list_checks(
    host_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[CheckResponse]:
    query = select(Check).order_by(Check.created_at)
    if host_id:
        query = query.where(Check.host_id == host_id)
    checks = list((await db.execute(query)).scalars().all())
    return await _respond(db, checks)


@router.post("/", response_model=CheckResponse, status_code=status.HTTP_201_CREATED)
async def create_check(
    payload: CheckCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> CheckResponse:
    if not await db.get(Host, payload.host_id):
        raise HTTPException(status_code=404, detail="Host not found")

    check = Check(**payload.model_dump())
    db.add(check)
    await db.commit()
    await db.refresh(check)
    return (await _respond(db, [check]))[0]


@router.patch("/{check_id}", response_model=CheckResponse)
async def update_check(
    check_id: str,
    payload: CheckUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> CheckResponse:
    check = await _get_or_404(db, check_id)
    changes = payload.model_dump(exclude_unset=True)
    if "target" in changes:
        changes["target"] = (changes["target"] or "").strip() or None

    merged = {
        "target": check.target, "port": check.port,
        "interval_seconds": check.interval_seconds,
        "timeout_seconds": check.timeout_seconds,
        **{k: v for k, v in changes.items() if k in ("target", "port", "interval_seconds", "timeout_seconds")},
    }
    try:
        validate_check_config(check.type, **merged)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    for field, value in changes.items():
        setattr(check, field, value)

    if changes.get("enabled") is False:
        # A disabled check must not leave a stale alert or "down" state behind
        await resolve_open_alerts(db, check.id)
        check.state = "unknown"
        check.consecutive_failures = 0

    if "enabled" in changes:
        # The host's derived status depends on which checks are active
        host = await db.get(Host, check.host_id)
        if host is not None:
            await db.flush()
            await refresh_agentless_host_status(db, host)

    await db.commit()
    await db.refresh(check)
    return (await _respond(db, [check]))[0]


@router.delete("/{check_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_check(
    check_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> None:
    check = await _get_or_404(db, check_id)
    await resolve_open_alerts(db, check.id)
    await db.delete(check)
    await db.commit()


@router.post("/{check_id}/run", response_model=CheckResponse)
async def run_check(
    check_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> CheckResponse:
    check = await _get_or_404(db, check_id)
    check = await run_check_now(db, check)
    return (await _respond(db, [check]))[0]


@router.get("/{check_id}/results", response_model=list[CheckResultResponse])
async def check_results(
    check_id: str,
    limit: int = Query(default=100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[CheckResult]:
    await _get_or_404(db, check_id)
    rows = await db.execute(
        select(CheckResult)
        .where(CheckResult.check_id == check_id)
        .order_by(CheckResult.timestamp.desc())
        .limit(limit)
    )
    return list(reversed(rows.scalars().all()))
