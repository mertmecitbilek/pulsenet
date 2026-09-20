"""
PulseNet Backend — Service Check Pydantic Schemas
"""

from datetime import datetime
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, model_validator

from app.schemas.validators import is_valid_host

CheckType = Literal["ping", "http", "tcp"]


def validate_check_config(
    type_: str,
    target: str | None,
    port: int | None,
    interval_seconds: int,
    timeout_seconds: int,
) -> None:
    """Raise ValueError if the combination of fields is not runnable."""
    if timeout_seconds > interval_seconds:
        raise ValueError("timeout_seconds cannot be greater than interval_seconds")

    if type_ == "http":
        parsed = urlparse(target or "")
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError("HTTP checks need a full URL starting with http:// or https://")
    else:
        # target is optional for ping/tcp (falls back to the host's IP)
        if target and not is_valid_host(target):
            raise ValueError("target must be a valid hostname or IP address")
        if type_ == "tcp" and port is None:
            raise ValueError("TCP checks require a port")


class CheckCreate(BaseModel):
    host_id: str
    name: str = Field(..., min_length=1, max_length=128, examples=["Web server HTTP"])
    type: CheckType
    target: str | None = Field(None, max_length=512)
    port: int | None = Field(None, ge=1, le=65535)
    interval_seconds: int = Field(30, ge=10, le=3600)
    timeout_seconds: int = Field(5, ge=1, le=30)
    fail_threshold: int = Field(3, ge=1, le=10)
    expected_status: int | None = Field(None, ge=100, le=599)
    enabled: bool = True

    @model_validator(mode="after")
    def _validate(self) -> "CheckCreate":
        self.target = (self.target or "").strip() or None
        validate_check_config(
            self.type, self.target, self.port, self.interval_seconds, self.timeout_seconds
        )
        return self


class CheckUpdate(BaseModel):
    """Partial update. The check type cannot be changed."""

    name: str | None = Field(None, min_length=1, max_length=128)
    target: str | None = Field(None, max_length=512)
    port: int | None = Field(None, ge=1, le=65535)
    interval_seconds: int | None = Field(None, ge=10, le=3600)
    timeout_seconds: int | None = Field(None, ge=1, le=30)
    fail_threshold: int | None = Field(None, ge=1, le=10)
    expected_status: int | None = Field(None, ge=100, le=599)
    enabled: bool | None = None


class CheckResponse(BaseModel):
    id: str
    host_id: str
    name: str
    type: str
    target: str | None
    port: int | None
    interval_seconds: int
    timeout_seconds: int
    fail_threshold: int
    expected_status: int | None
    enabled: bool
    state: str
    consecutive_failures: int
    last_checked_at: datetime | None
    last_success_at: datetime | None
    last_response_ms: float | None
    last_error: str | None
    created_at: datetime
    # Share of successful runs over the last 24h (None = no runs yet)
    uptime_24h: float | None = None

    model_config = {"from_attributes": True}


class CheckResultResponse(BaseModel):
    id: str
    timestamp: datetime
    success: bool
    response_ms: float | None
    error: str | None

    model_config = {"from_attributes": True}
