"""origen GeoNode — source_layer, source_fid, synced_at

Revision ID: 004
Revises: 003
Create Date: 2026-05-26

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("parcels", sa.Column("source_layer", sa.String(128), nullable=True))
    op.add_column("parcels", sa.Column("source_fid", sa.String(64), nullable=True))
    op.add_column(
        "parcels",
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_parcels_source_layer", "parcels", ["source_layer"])
    op.create_index("ix_parcels_source_fid", "parcels", ["source_fid"])
    op.create_index(
        "uq_parcels_source_layer_fid",
        "parcels",
        ["source_layer", "source_fid"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_parcels_source_layer_fid", table_name="parcels")
    op.drop_index("ix_parcels_source_fid", table_name="parcels")
    op.drop_index("ix_parcels_source_layer", table_name="parcels")
    op.drop_column("parcels", "synced_at")
    op.drop_column("parcels", "source_fid")
    op.drop_column("parcels", "source_layer")
