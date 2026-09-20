"""
PulseNet Backend — Metrics Router

Routes:
  POST /api/metrics               → agent submits metric (X-Agent-Key auth)
  GET  /api/metrics/summary       → latest metric per host (JWT auth)
  GET  /api/metrics/{host_id}     → history for a host (JWT auth)
  GET  /api/metrics/{host_id}/latest → most recent reading (JWT auth)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.host import Host
from app.models.user import User
from app.schemas.metric import MetricCreate, MetricResponse
from app.services.metric_service import MetricService
from app.services.alert_service import AlertService
from app.services.auth_service import get_current_user, verify_agent_key

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


@router.post("/", response_model=MetricResponse, status_code=201,
             dependencies=[Depends(verify_agent_key)])
async def ingest_metric(
    payload: MetricCreate, db: AsyncSession = Depends(get_db)
) -> MetricResponse:
    """Receive and persist a metric snapshot from an agent.

    Secured by X-Agent-Key header (not JWT — agents don't log in as users).
    Also runs the alert evaluation pipeline for immediate threshold checks.
    """
    host = await db.get(Host, payload.host_id)
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")

    metric_svc = MetricService(db)
    alert_svc  = AlertService(db)

    metric = await metric_svc.save(payload)
    await alert_svc.evaluate_and_save(metric, host)
    return metric


# NOTE: /summary MUST be defined before /{host_id} to avoid path capture.
@router.get("/summary", response_model=list[MetricResponse])
async def metrics_summary(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[MetricResponse]:
    """Return the latest metric snapshot for every host (dashboard overview)."""
    svc = MetricService(db)
    return await svc.get_summary_for_all_hosts()


@router.get("/{host_id}/latest", response_model=MetricResponse | None)
async def get_latest_metric(
    host_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> MetricResponse | None:
    """Return only the most recent metric for a host."""
    svc = MetricService(db)
    return await svc.get_latest(host_id)


@router.get("/{host_id}", response_model=list[MetricResponse])
async def get_metric_history(
    host_id: str,
    limit: int = Query(default=100, ge=1, le=2000),
    since_hours: int | None = Query(default=None, ge=1, le=168, description="Return data from the last N hours"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[MetricResponse]:
    """Return metric history for a host.

    Use `since_hours` for time-range queries (e.g. last 1h, 6h, 24h, 7d);
    windows above 1h are returned averaged into time buckets.
    Use `limit` for fixed-count queries.
    """
    svc = MetricService(db)
    return await svc.get_history(host_id, limit=limit, since_hours=since_hours)
