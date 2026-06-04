"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-05-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
import geoalchemy2

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "parties",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column(
            "party_type",
            sa.Enum("natural", "juridica", name="partytype"),
            nullable=False,
        ),
        sa.Column("document_id", sa.String(length=32), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_id"),
    )
    op.create_index("ix_parties_document_id", "parties", ["document_id"])

    op.create_table(
        "parcels",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("cadastral_code", sa.String(length=64), nullable=False),
        sa.Column("address", sa.String(length=512), nullable=True),
        sa.Column("area_m2", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("land_use", sa.String(length=64), nullable=True),
        sa.Column(
            "status",
            sa.Enum("activo", "inactivo", "en_tramite", name="parcelstatus"),
            nullable=False,
        ),
        sa.Column("cadastral_value", sa.Numeric(precision=16, scale=2), nullable=True),
        sa.Column("valuation_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "geom",
            geoalchemy2.Geometry(
                geometry_type="MULTIPOLYGON",
                srid=4326,
                from_text="ST_GeomFromEWKT",
                name="geometry",
            ),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cadastral_code"),
    )
    op.create_index("ix_parcels_cadastral_code", "parcels", ["cadastral_code"])
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_parcels_geom ON parcels USING GIST (geom)"
    )

    op.create_table(
        "ownerships",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("parcel_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("party_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column(
            "right_type",
            sa.Enum(
                "propiedad",
                "posesion",
                "usufructo",
                "arrendamiento",
                name="righttype",
            ),
            nullable=False,
        ),
        sa.Column("share_percent", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(["parcel_id"], ["parcels.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["party_id"], ["parties.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("ownerships")
    op.drop_table("parcels")
    op.drop_table("parties")
    op.execute("DROP TYPE IF EXISTS righttype")
    op.execute("DROP TYPE IF EXISTS parcelstatus")
    op.execute("DROP TYPE IF EXISTS partytype")
