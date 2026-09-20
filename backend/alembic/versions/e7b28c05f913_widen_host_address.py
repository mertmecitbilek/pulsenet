"""Allow hostnames in hosts.ip_address

A host can be a website (example.com), not only an IP, so 45 chars
(the IPv6 maximum) is no longer enough.

Revision ID: e7b28c05f913
Revises: c3a91d47e2b5
Create Date: 2026-09-20 13:00:00
"""

from typing import Sequence, Union
from alembic import op

revision: str = 'e7b28c05f913'
down_revision: Union[str, None] = 'c3a91d47e2b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE hosts ALTER COLUMN ip_address TYPE VARCHAR(255)")


def downgrade() -> None:
    op.execute("ALTER TABLE hosts ALTER COLUMN ip_address TYPE VARCHAR(45)")
