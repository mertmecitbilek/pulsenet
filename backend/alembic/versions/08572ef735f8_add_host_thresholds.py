"""Baseline schema + host thresholds

Idempotent on purpose: on an empty database it creates every table, on a
database that already has the tables (created by init_db() or patched by
hand) it only adds whatever columns are missing.

Revision ID: 08572ef735f8
Revises:
Create Date: 2026-09-15 12:47:52.085923
"""

from typing import Sequence, Union
from alembic import op

# Importing the models registers every table on Base.metadata.
from app.database import Base
from app.models import host, metric, alert, user, check  # noqa: F401

revision: str = '08572ef735f8'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = [
    ("hosts",   "alert_cpu_threshold",    "DOUBLE PRECISION NOT NULL DEFAULT 90.0"),
    ("hosts",   "alert_memory_threshold", "DOUBLE PRECISION NOT NULL DEFAULT 90.0"),
    ("hosts",   "alert_disk_threshold",   "DOUBLE PRECISION NOT NULL DEFAULT 90.0"),
    ("metrics", "net_bytes_sent",         "DOUBLE PRECISION"),
    ("metrics", "net_bytes_recv",         "DOUBLE PRECISION"),
    ("alerts",  "acknowledged",           "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("alerts",  "ack_note",               "VARCHAR(512)"),
    ("alerts",  "acknowledged_by",        "VARCHAR(128)"),
    ("alerts",  "acknowledged_at",        "TIMESTAMP WITH TIME ZONE"),
]


def upgrade() -> None:
    # No-op for tables that already exist (checkfirst=True by default).
    Base.metadata.create_all(bind=op.get_bind())
    for table, column, ddl in _COLUMNS:
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {ddl}")


def downgrade() -> None:
    for column in ("alert_cpu_threshold", "alert_memory_threshold", "alert_disk_threshold"):
        op.execute(f"ALTER TABLE hosts DROP COLUMN IF EXISTS {column}")
