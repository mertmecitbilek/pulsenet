"""
PulseNet Backend — Hosts Router

CRUD operations for monitored hosts.
Routes:
  GET    /api/hosts          → list all hosts
  POST   /api/hosts          → register new host
  GET    /api/hosts/{id}     → get single host
  PATCH  /api/hosts/{id}     → update host fields
  DELETE /api/hosts/{id}     → remove host
"""

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.host import Host
from app.models.user import User
from app.schemas.host import HostCreate, HostUpdate, HostResponse
from app.services.auth_service import get_current_user, require_admin, verify_user_or_agent

router = APIRouter(prefix="/api/hosts", tags=["hosts"])


@router.get("/", response_model=list[HostResponse])
async def list_hosts(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user)
) -> list[HostResponse]:
    """Return all registered hosts ordered by name."""
    result = await db.execute(select(Host).order_by(Host.name))
    return list(result.scalars().all())


@router.post("/", response_model=HostResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(verify_user_or_agent)])
async def create_host(
    payload: HostCreate,
    db: AsyncSession = Depends(get_db),
    x_agent_key: str | None = Header(default=None),
) -> HostResponse:
    """Register a new monitored host (admin JWT or agent key).

    Agents are matched by name only: a container's IP changes on every
    recreation, so matching on IP would pile up duplicate host records.
    The stored IP is refreshed instead. Manual (JWT) registrations keep
    the stricter name + IP match.
    """
    is_agent = x_agent_key == settings.agent_api_key
    query = select(Host).where(Host.name == payload.name).order_by(Host.created_at)
    if not is_agent:
        query = query.where(Host.ip_address == payload.ip_address)
    host = (await db.execute(query)).scalars().first()
    if host:
        if is_agent and host.ip_address != payload.ip_address:
            host.ip_address = payload.ip_address
            await db.commit()
            await db.refresh(host)
        return host

    host = Host(
        name=payload.name,
        ip_address=payload.ip_address,
        description=payload.description,
        os=payload.os,
        alert_cpu_threshold=payload.alert_cpu_threshold,
        alert_memory_threshold=payload.alert_memory_threshold,
        alert_disk_threshold=payload.alert_disk_threshold,
    )
    db.add(host)
    await db.commit()
    await db.refresh(host)
    return host


@router.get("/{host_id}", response_model=HostResponse)
async def get_host(
    host_id: str, 
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user)
) -> HostResponse:
    """Retrieve a single host by ID."""
    host = await db.get(Host, host_id)
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")
    return host


@router.patch("/{host_id}", response_model=HostResponse)
async def update_host(
    host_id: str,
    payload: HostUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin)
) -> HostResponse:
    """Partially update host fields."""
    host = await db.get(Host, host_id)
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(host, field, value)

    await db.commit()
    await db.refresh(host)
    return host


@router.delete("/{host_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_host(
    host_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin)
) -> None:
    """Remove a host and all its associated metrics and alerts."""
    host = await db.get(Host, host_id)
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")
    await db.delete(host)
    await db.commit()
