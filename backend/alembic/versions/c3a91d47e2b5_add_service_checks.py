"""Add service checks (ping / HTTP / TCP)

Idempotent: creates the checks / check_results tables when missing and
links alerts to checks. On a fresh database the baseline migration has
already created everything, so this is then a no-op.

Revision ID: c3a91d47e2b5
Revises: 08572ef735f8
Create Date: 2026-09-20 12:00:00
"""

from typing import Sequence, Union
from alembic import op

from app.database import Base
from app.models import host, metric, alert, user, check  # noqa: F401

revision: str = 'c3a91d47e2b5'
down_revision: Union[str, None] = '08572ef735f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Creates only the missing tables (checks, check_results)
    Base.metadata.create_all(bind=op.get_bind())
    op.execute(
        "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS check_id VARCHAR(36) "
        "REFERENCES checks(id) ON DELETE SET NULL"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_alerts_check_id ON alerts (check_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_alerts_check_id")
    op.execute("ALTER TABLE alerts DROP COLUMN IF EXISTS check_id")
    op.execute("DROP TABLE IF EXISTS check_results")
    op.execute("DROP TABLE IF EXISTS checks")
