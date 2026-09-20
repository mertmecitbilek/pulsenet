"""
PulseNet Backend — Metric ORM Model

Stores time-series snapshots of system resource usage.
Each row represents a single collection cycle from the agent.
"""

import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Float, ForeignKey, func, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Metric(Base):
    """A single system metric snapshot collected by the agent."""

    __tablename__ = "metrics"

    # Composite index on (host_id, timestamp DESC) for fast time-range queries
    __table_args__ = (
        Index("ix_metrics_host_timestamp", "host_id", "timestamp"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    host_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("hosts.id", ondelete="CASCADE"), nullable=False
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    # CPU — overall usage percentage across all cores
    cpu_percent: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Memory — percentage of used RAM
    memory_percent: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    memory_used_mb: Mapped[float] = mapped_column(Float, nullable=True)
    memory_total_mb: Mapped[float] = mapped_column(Float, nullable=True)

    # Disk — percentage used on the root partition
    disk_percent: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    disk_used_gb: Mapped[float] = mapped_column(Float, nullable=True)
    disk_total_gb: Mapped[float] = mapped_column(Float, nullable=True)

    # System uptime in seconds since last boot
    uptime_seconds: Mapped[float] = mapped_column(Float, nullable=True)

    # Network I/O — cumulative bytes since boot (agent sends delta per cycle)
    net_bytes_sent: Mapped[float] = mapped_column(Float, nullable=True)
    net_bytes_recv: Mapped[float] = mapped_column(Float, nullable=True)

    host: Mapped["Host"] = relationship("Host", back_populates="metrics")  # noqa: F821

    def __repr__(self) -> str:
        return (
            f"<Metric host={self.host_id} "
            f"cpu={self.cpu_percent:.1f}% "
            f"mem={self.memory_percent:.1f}% "
            f"ts={self.timestamp}>"
        )
