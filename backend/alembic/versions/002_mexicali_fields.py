"""campos Mexicali — cuenta predial, colonia, CP

Revision ID: 002
Revises: 001
Create Date: 2026-05-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("parcels", sa.Column("predial_account", sa.String(64), nullable=True))
    op.add_column("parcels", sa.Column("colony", sa.String(128), nullable=True))
    op.add_column("parcels", sa.Column("postal_code", sa.String(10), nullable=True))
    op.create_index("ix_parcels_predial_account", "parcels", ["predial_account"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_parcels_predial_account", table_name="parcels")
    op.drop_column("parcels", "postal_code")
    op.drop_column("parcels", "colony")
    op.drop_column("parcels", "predial_account")
