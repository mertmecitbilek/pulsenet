"""
PulseNet Backend — Alert Pydantic Schemas
"""

from datetime import datetime
from pydantic import BaseModel, Field


class AcknowledgeRequest(BaseModel):
    """Payload for acknowledging an alert."""
    note: str | None = Field(default=None, max_length=512, description="Optional note from the user")


class AlertResponse(BaseModel):
    """Alert event returned to the client."""

    id: str
    host_id: str
    host_name: str | None = None
    check_id: str | None = None
    metric_type: str
    severity: str
    value: float
    threshold: float
    message: str
    status: str
    triggered_at: datetime
    resolved_at: datetime | None
    # Acknowledge fields
    acknowledged: bool
    ack_note: str | None
    acknowledged_by: str | None
    acknowledged_at: datetime | None

    model_config = {"from_attributes": True}

