"""
PulseNet Backend — Service Check ORM Models

A Check is an agentless probe (ping / HTTP / TCP port) that the backend
runs against a host on a schedule. Every run is stored as a CheckResult.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Check(Base):
    """A scheduled availability probe attached to a host."""

    __tablename__ = "checks"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    host_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("hosts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    # "ping" | "http" | "tcp"
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    # ping/tcp: hostname or IP (defaults to the host's IP); http: full URL
    target: Mapped[str | None] = mapped_column(String(512), nullable=True)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    interval_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    timeout_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    # Consecutive failures required before the check is considered down
    fail_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    # http only: exact status code that counts as success (default: any 2xx/3xx)
    expected_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # "unknown" | "up" | "down"
    state: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown")
    consecutive_failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_response_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(512), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    host: Mapped["Host"] = relationship("Host", back_populates="checks")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Check {self.type} '{self.name}' host={self.host_id} state={self.state}>"


class CheckResult(Base):
    """One execution of a Check."""

    __tablename__ = "check_results"
    __table_args__ = (Index("ix_check_results_check_timestamp", "check_id", "timestamp"),)

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    check_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("checks.id", ondelete="CASCADE"), nullable=False
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    response_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    error: Mapped[str | None] = mapped_column(String(512), nullable=True)
