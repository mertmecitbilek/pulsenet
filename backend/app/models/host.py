"""
PulseNet Backend — Host ORM Model

Represents a monitored server / network device.
"""

import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, func, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config import settings
from app.database import Base


class Host(Base):
    """A monitored host (server, VM, or network device)."""

    __tablename__ = "hosts"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    # IP address or hostname (e.g. "203.0.113.10" or "example.com")
    ip_address: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    os: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # "online" | "offline" | "unknown"
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    
    # Alert thresholds
    alert_cpu_threshold: Mapped[float] = mapped_column(
        Float, nullable=False, default=lambda: settings.alert_cpu_threshold
    )
    alert_memory_threshold: Mapped[float] = mapped_column(
        Float, nullable=False, default=lambda: settings.alert_memory_threshold
    )
    alert_disk_threshold: Mapped[float] = mapped_column(
        Float, nullable=False, default=lambda: settings.alert_disk_threshold
    )

    # Relationship to metrics (lazy="dynamic" avoids loading all at once)
    metrics: Mapped[list["Metric"]] = relationship(  # noqa: F821
        "Metric", back_populates="host", cascade="all, delete-orphan"
    )
    alerts: Mapped[list["Alert"]] = relationship(  # noqa: F821
        "Alert", back_populates="host", cascade="all, delete-orphan"
    )
    checks: Mapped[list["Check"]] = relationship(  # noqa: F821
        "Check", back_populates="host", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Host id={self.id} name={self.name} status={self.status}>"
