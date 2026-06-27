"""Catálogos + FK en predios_alfanumerico + predio_valuaciones."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cat_delegaciones",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("nombre", sa.String(128), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_cat_delegaciones_nombre", "cat_delegaciones", ["nombre"], unique=True)

    op.create_table(
        "cat_colonias",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("delegacion_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("nombre", sa.String(128), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["delegacion_id"], ["cat_delegaciones.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("delegacion_id", "nombre", name="uq_colonia_delegacion_nombre"),
    )

    op.create_table(
        "cat_calles",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("colonia_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("nombre", sa.String(255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["colonia_id"], ["cat_colonias.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("colonia_id", "nombre", name="uq_calle_colonia_nombre"),
    )

    op.create_table(
        "cat_zonas_homogeneas",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("codigo", sa.String(64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_cat_zonas_homogeneas_codigo", "cat_zonas_homogeneas", ["codigo"], unique=True
    )

    op.create_table(
        "cat_usos_suelo",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("descripcion", sa.String(255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_cat_usos_suelo_descripcion", "cat_usos_suelo", ["descripcion"], unique=True
    )

    op.create_table(
        "cat_tasas",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("id_tasa_municipal", sa.Integer(), nullable=False),
        sa.Column("porcentaje", sa.Numeric(8, 4), nullable=False),
        sa.Column("uso_suelo_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["uso_suelo_id"], ["cat_usos_suelo.id"], ondelete="SET NULL"),
        sa.UniqueConstraint(
            "id_tasa_municipal",
            "porcentaje",
            "uso_suelo_id",
            name="uq_tasa_municipal_pct_uso",
        ),
    )

    op.create_table(
        "cat_regimenes_propiedad",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("codigo", sa.String(32), nullable=False),
        sa.Column("descripcion", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_cat_regimenes_propiedad_codigo",
        "cat_regimenes_propiedad",
        ["codigo"],
        unique=True,
    )

    op.create_table(
        "cat_titulares",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("nombre_completo", sa.String(255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_cat_titulares_nombre", "cat_titulares", ["nombre_completo"], unique=True
    )

    op.create_table(
        "predio_valuaciones",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("predio_alfanumerico_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("ejercicio", sa.Integer(), nullable=False),
        sa.Column("valor_catastral", sa.Numeric(16, 2), nullable=True),
        sa.Column("adeudo_ejercicio", sa.Numeric(16, 2), nullable=True),
        sa.Column("adeudo_total", sa.Numeric(16, 2), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["predio_alfanumerico_id"], ["predios_alfanumerico.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint(
            "predio_alfanumerico_id", "ejercicio", name="uq_valuacion_predio_ejercicio"
        ),
    )

    for col, ref in (
        ("delegacion_id", "cat_delegaciones"),
        ("colonia_id", "cat_colonias"),
        ("calle_id", "cat_calles"),
        ("zona_homogenea_id", "cat_zonas_homogeneas"),
        ("uso_suelo_id", "cat_usos_suelo"),
        ("tasa_id", "cat_tasas"),
        ("regimen_propiedad_id", "cat_regimenes_propiedad"),
        ("titular_id", "cat_titulares"),
    ):
        op.add_column("predios_alfanumerico", sa.Column(col, sa.UUID(as_uuid=False), nullable=True))
        op.create_foreign_key(
            f"fk_predios_alfanumerico_{col}",
            "predios_alfanumerico",
            ref,
            [col],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    for col in (
        "titular_id",
        "regimen_propiedad_id",
        "tasa_id",
        "uso_suelo_id",
        "zona_homogenea_id",
        "calle_id",
        "colonia_id",
        "delegacion_id",
    ):
        op.drop_constraint(
            f"fk_predios_alfanumerico_{col}", "predios_alfanumerico", type_="foreignkey"
        )
        op.drop_column("predios_alfanumerico", col)

    op.drop_table("predio_valuaciones")
    op.drop_table("cat_titulares")
    op.drop_table("cat_regimenes_propiedad")
    op.drop_table("cat_tasas")
    op.drop_table("cat_usos_suelo")
    op.drop_table("cat_zonas_homogeneas")
    op.drop_table("cat_calles")
    op.drop_table("cat_colonias")
    op.drop_table("cat_delegaciones")
