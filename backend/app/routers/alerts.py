"""
PulseNet Backend — Alerts Router

Routes:
  GET   /api/alerts                     → list recent alerts (all hosts)
  GET   /api/alerts/{host_id}           → list alerts for a specific host
  GET   /api/alerts/count/open          → count of currently open alerts
  PATCH /api/alerts/{alert_id}/acknowledge → acknowledge an alert
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.alert import AlertResponse, AcknowledgeRequest
from app.services.alert_service import AlertService
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("/", response_model=list[AlertResponse])
async def list_alerts(
    limit: int = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
) -> list[AlertResponse]:
    """Return the most recent alerts across all hosts."""
    svc = AlertService(db)
    return await svc.get_recent_alerts(limit=limit)


# NOTE: /count/open must be registered before /{host_id} to avoid
# 'count' being captured as a host_id path parameter.
@router.get("/count/open", response_model=dict)
async def open_alert_count(db: AsyncSession = Depends(get_db)) -> dict:
    """Return the number of currently open (unresolved) alerts."""
    svc = AlertService(db)
    count = await svc.get_open_alert_count()
    return {"open_alerts": count}


@router.get("/{host_id}", response_model=list[AlertResponse])
async def list_host_alerts(
    host_id: str,
    limit: int = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
) -> list[AlertResponse]:
    """Return recent alerts for a specific host."""
    svc = AlertService(db)
    return await svc.get_recent_alerts(host_id=host_id, limit=limit)


@router.patch("/{alert_id}/acknowledge", response_model=AlertResponse)
async def acknowledge_alert(
    alert_id: str,
    payload: AcknowledgeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AlertResponse:
    """Acknowledge an open alert.

    Records the acknowledging user's name, the timestamp, and an optional
    free-text note. Idempotent — re-acknowledging an already-acked alert
    returns it unchanged.
    """
    svc = AlertService(db)
    alert = await svc.acknowledge_alert(
        alert_id=alert_id,
        user_name=current_user.name,
        note=payload.note,
    )
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert

