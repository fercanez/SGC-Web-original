"""Revision 005 — tabla predios_alfanumerico (base Excel municipal)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "predios_alfanumerico",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column(
            "parcel_id",
            sa.UUID(as_uuid=False),
            sa.ForeignKey("parcels.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("clave_catastral", sa.String(64), nullable=False),
        sa.Column("clave_catastral_norm", sa.String(64), nullable=True),
        sa.Column("nombre_completo", sa.String(255), nullable=True),
        sa.Column("delegacion", sa.String(128), nullable=True),
        sa.Column("colonia", sa.String(128), nullable=True),
        sa.Column("calle", sa.String(255), nullable=True),
        sa.Column("numof", sa.String(32), nullable=True),
        sa.Column("numint", sa.String(32), nullable=True),
        sa.Column("letra", sa.String(16), nullable=True),
        sa.Column("zonah", sa.String(64), nullable=True),
        sa.Column("valor2026", sa.Numeric(16, 2), nullable=True),
        sa.Column("sup_documental", sa.Numeric(14, 2), nullable=True),
        sa.Column("sup_fisica", sa.Numeric(14, 2), nullable=True),
        sa.Column("condominio", sa.String(128), nullable=True),
        sa.Column("adeudo_2026", sa.Numeric(16, 2), nullable=True),
        sa.Column("adeudo_total", sa.Numeric(16, 2), nullable=True),
        sa.Column("sup_const", sa.Numeric(14, 2), nullable=True),
        sa.Column("id_tasa", sa.Numeric(10, 0), nullable=True),
        sa.Column("descripcion_uso", sa.String(255), nullable=True),
        sa.Column("porcentaje_tasa", sa.Numeric(8, 4), nullable=True),
        sa.Column(
            "imported_at",
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
    )
    op.create_index(
        "ix_predios_alfanumerico_clave_catastral",
        "predios_alfanumerico",
        ["clave_catastral"],
        unique=True,
    )
    op.create_index(
        "ix_predios_alfanumerico_clave_norm",
        "predios_alfanumerico",
        ["clave_catastral_norm"],
    )
    op.create_index(
        "ix_predios_alfanumerico_parcel_id",
        "predios_alfanumerico",
        ["parcel_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_predios_alfanumerico_parcel_id", table_name="predios_alfanumerico")
    op.drop_index("ix_predios_alfanumerico_clave_norm", table_name="predios_alfanumerico")
    op.drop_index(
        "ix_predios_alfanumerico_clave_catastral", table_name="predios_alfanumerico"
    )
    op.drop_table("predios_alfanumerico")
