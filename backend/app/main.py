"""
PulseNet Backend — FastAPI Application Entry Point

Registers:
  - CORS middleware
  - Application lifespan (DB table creation + background watcher)
  - All API routers (auth is public; all others require Bearer token)
  - WebSocket router
  - Health check endpoint
"""

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, delete as sa_delete

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db, AsyncSessionLocal
# Models must be imported before init_db() so Base.metadata sees all tables.
from app.models import host, metric, alert, user, check  # noqa: F401
from app.routers import hosts, metrics, alerts, auth, checks
from app.websockets import live_metrics
from app.services.auth_service import get_current_user
from app.services.metric_service import MetricService
from app.services.alert_service import AlertService
from app.services.check_service import check_scheduler


HOST_OFFLINE_AFTER_S = 30


async def host_status_watcher():
    """Background task: mark hosts offline (and raise a host_down alert)
    if no data was received for HOST_OFFLINE_AFTER_S seconds."""
    while True:
        try:
            async with AsyncSessionLocal() as db:
                cutoff = datetime.now(timezone.utc) - timedelta(seconds=HOST_OFFLINE_AFTER_S)
                # FOR UPDATE: a metric ingested at the same moment either lands
                # first (row no longer matches) or waits until we commit.
                stale_hosts = (
                    await db.execute(
                        select(host.Host)
                        .where(host.Host.last_seen_at < cutoff)
                        .where(host.Host.status == "online")
                        .with_for_update()
                    )
                ).scalars().all()

                alert_svc = AlertService(db)
                for stale in stale_hosts:
                    stale.status = "offline"
                    await alert_svc.handle_host_down(stale, HOST_OFFLINE_AFTER_S)
                if stale_hosts:
                    await db.commit()
        except Exception as e:
            print(f"Error in host_status_watcher: {e}")

        await asyncio.sleep(10)


async def data_pruner():
    """Background task: hourly deletion of old metrics and resolved alerts."""
    while True:
        await _prune_once()
        await asyncio.sleep(3600)


async def _prune_once() -> None:
    if settings.data_retention_days <= 0:
        return
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=settings.data_retention_days)
        async with AsyncSessionLocal() as db:
            deleted = await MetricService(db).prune_old_metrics(settings.data_retention_days)
            if deleted:
                print(f"[pruner] Deleted {deleted} metric rows older than {settings.data_retention_days}d")

            purged = await db.execute(
                sa_delete(check.CheckResult).where(check.CheckResult.timestamp < cutoff)
            )
            if purged.rowcount:
                print(f"[pruner] Deleted {purged.rowcount} check result rows")

            res = await db.execute(
                sa_delete(alert.Alert)
                .where(alert.Alert.status == "resolved")
                .where(alert.Alert.resolved_at < cutoff)
            )
            await db.commit()
            if res.rowcount:
                print(f"[pruner] Deleted {res.rowcount} resolved alert rows")
    except Exception as e:
        print(f"[pruner] Error: {e}")


DEFAULT_SECRETS = {
    "secret_key": "changeme-set-a-strong-random-key-in-production",
    "agent_api_key": "pulsenet-agent-secret-key",
}


def _verify_secrets() -> None:
    """Refuse to run in production with the shipped placeholder secrets.

    A known SECRET_KEY lets anyone forge an admin JWT, and a known agent key
    lets anyone submit metrics, so this must never reach a real deployment.
    """
    weak = [
        name for name, placeholder in DEFAULT_SECRETS.items()
        if getattr(settings, name).strip() in (placeholder, "", "changeme")
        or getattr(settings, name).startswith("changeme")
    ]
    if not weak:
        return

    listed = ", ".join(sorted(n.upper() for n in weak))
    if settings.is_development:
        print(f"[security] WARNING: {listed} still set to the default value. "
              f"Generate strong values before exposing this instance.")
    else:
        raise RuntimeError(
            f"Refusing to start: {listed} still set to the default value. "
            f"Set strong values in the environment (e.g. `openssl rand -base64 36`)."
        )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Run startup/shutdown hooks."""
    _verify_secrets()
    await init_db()
    watcher_task = asyncio.create_task(host_status_watcher())
    pruner_task  = asyncio.create_task(data_pruner())
    checks_task  = asyncio.create_task(check_scheduler())
    yield
    watcher_task.cancel()
    pruner_task.cancel()
    checks_task.cancel()


app = FastAPI(
    title="PulseNet API",
    description="Open-source system monitoring platform",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# Auth router is public (no token needed for login/register).
# All other routers require a valid Bearer token via the dependency.
# ---------------------------------------------------------------------------
app.include_router(auth.router)                                                  # public
app.include_router(hosts.router)                                                 # mixed (own auth per route)
app.include_router(metrics.router)                                               # mixed (own auth per route)
app.include_router(alerts.router,  dependencies=[Depends(get_current_user)])     # JWT
app.include_router(checks.router)                                                # mixed (own auth per route)
app.include_router(live_metrics.router)                                          # WS


# ---------------------------------------------------------------------------
# Health check — open (no auth required)
# ---------------------------------------------------------------------------
@app.get("/health", tags=["health"])
async def health_check() -> dict:
    return {"status": "ok", "environment": settings.environment}
