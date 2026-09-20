"""
PulseNet Backend — User ORM Model
"""

import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class User(Base):
    """An authenticated user of the PulseNet dashboard."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    # bcrypt hash — never store plain-text passwords
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # "admin" | "viewer"
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="viewer")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email} role={self.role}>"
