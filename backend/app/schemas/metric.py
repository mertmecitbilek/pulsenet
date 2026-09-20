"""
PulseNet Backend — Metric Pydantic Schemas
"""

from datetime import datetime
from pydantic import BaseModel, Field


class MetricCreate(BaseModel):
    """Payload sent by the agent when submitting a metric snapshot."""

    host_id: str = Field(..., description="UUID of the reporting host")
    cpu_percent: float = Field(..., ge=0, le=100)
    memory_percent: float = Field(..., ge=0, le=100)
    memory_used_mb: float | None = None
    memory_total_mb: float | None = None
    disk_percent: float = Field(..., ge=0, le=100)
    disk_used_gb: float | None = None
    disk_total_gb: float | None = None
    uptime_seconds: float | None = None
    # Network I/O — bytes per interval (computed by agent as delta)
    net_bytes_sent: float | None = None
    net_bytes_recv: float | None = None


class MetricResponse(BaseModel):
    """Metric snapshot returned to the client."""

    id: str
    host_id: str
    timestamp: datetime
    cpu_percent: float
    memory_percent: float
    memory_used_mb: float | None
    memory_total_mb: float | None
    disk_percent: float
    disk_used_gb: float | None
    disk_total_gb: float | None
    uptime_seconds: float | None
    net_bytes_sent: float | None
    net_bytes_recv: float | None

    model_config = {"from_attributes": True}

