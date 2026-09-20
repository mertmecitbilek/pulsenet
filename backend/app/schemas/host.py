"""
PulseNet Backend — Host Pydantic Schemas
"""

from datetime import datetime
from pydantic import BaseModel, Field, field_validator

from app.config import settings
from app.schemas.validators import is_valid_host


def _check_address(value: str | None) -> str | None:
    """Reject addresses that could never be probed."""
    if value is None:
        return None
    value = value.strip()
    if not is_valid_host(value):
        raise ValueError("ip_address must be a valid IP address or hostname")
    return value


class HostCreate(BaseModel):
    """Payload for registering a new host."""

    name: str = Field(..., min_length=1, max_length=128, examples=["web-server-01"])
    ip_address: str = Field(..., max_length=255, examples=["203.0.113.10", "example.com"],
                            description="IP address or hostname")
    description: str | None = Field(None, max_length=512)
    os: str | None = Field(None, max_length=128, examples=["Ubuntu 22.04"])
    alert_cpu_threshold: float = Field(default_factory=lambda: settings.alert_cpu_threshold, ge=1.0, le=100.0)
    alert_memory_threshold: float = Field(default_factory=lambda: settings.alert_memory_threshold, ge=1.0, le=100.0)
    alert_disk_threshold: float = Field(default_factory=lambda: settings.alert_disk_threshold, ge=1.0, le=100.0)


    @field_validator("ip_address")
    @classmethod
    def _validate_address(cls, v: str) -> str:
        return _check_address(v)


class HostUpdate(BaseModel):
    """Partial update for an existing host.

    NOTE: `status` is intentionally excluded — it is managed exclusively
    by the `host_status_watcher` background task based on `last_seen_at`.
    """

    name: str | None = Field(None, min_length=1, max_length=128)
    ip_address: str | None = Field(None, max_length=255)
    description: str | None = None
    os: str | None = None
    alert_cpu_threshold: float | None = Field(None, ge=1.0, le=100.0)
    alert_memory_threshold: float | None = Field(None, ge=1.0, le=100.0)
    alert_disk_threshold: float | None = Field(None, ge=1.0, le=100.0)


    @field_validator("ip_address")
    @classmethod
    def _validate_address(cls, v: str | None) -> str | None:
        return _check_address(v)


class HostResponse(BaseModel):
    """Full host representation returned to the client."""

    id: str
    name: str
    ip_address: str
    description: str | None
    os: str | None
    status: str
    created_at: datetime
    last_seen_at: datetime | None
    alert_cpu_threshold: float
    alert_memory_threshold: float
    alert_disk_threshold: float

    model_config = {"from_attributes": True}
