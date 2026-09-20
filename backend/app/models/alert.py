"""
PulseNet Backend — Alert ORM Model

An alert is created when a metric reading exceeds a configured threshold.
"""

import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Float, ForeignKey, Boolean, func, select
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship

from app.database import Base
from app.models.host import Host


class Alert(Base):
    """Threshold-breach event for a monitored host."""

    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    host_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("hosts.id", ondelete="CASCADE"), nullable=False
    )
    # Set for "check_down" alerts; kept (as NULL) if the check is later deleted
    check_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("checks.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # "cpu" | "memory" | "disk" | "host_down" | "check_down"
    metric_type: Mapped[str] = mapped_column(String(32), nullable=False)
    # "warning" | "critical"
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="warning")
    # Measured value that triggered the alert
    value: Mapped[float] = mapped_column(Float, nullable=False)
    # Configured threshold at the time of the alert
    threshold: Mapped[float] = mapped_column(Float, nullable=False)
    message: Mapped[str] = mapped_column(String(512), nullable=False)
    # "open" | "resolved"
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open")
    triggered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Acknowledge fields — set when a user manually acknowledges the alert
    acknowledged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ack_note: Mapped[str | None] = mapped_column(String(512), nullable=True)
    acknowledged_by: Mapped[str | None] = mapped_column(String(128), nullable=True)  # user name
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    host: Mapped["Host"] = relationship("Host", back_populates="alerts")  # noqa: F821

    def __repr__(self) -> str:
        return (
            f"<Alert host={self.host_id} type={self.metric_type} "
            f"value={self.value} threshold={self.threshold} status={self.status}>"
        )


# Resolved as a scalar subquery so every Alert query carries the host name
# without the caller having to remember to eager-load the relationship.
Alert.host_name = column_property(
    select(Host.name).where(Host.id == Alert.host_id).scalar_subquery()
)
