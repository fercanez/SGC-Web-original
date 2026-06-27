from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.movimiento_models import MovimientoSGC
from app.movimiento_schemas import MovimientoResponse, MovimientoCreate, MovimientoEstadoUpdate
from datetime import datetime
from sqlalchemy import text

router = APIRouter(
    prefix="/movimientos",
    tags=["movimientos"]
)


@router.get(
    "/{clave_catastral}",
    response_model=list[MovimientoResponse]
)
def obtener_movimientos(
    clave_catastral: str,
    db: Session = Depends(get_db)
):

    return (
        db.query(MovimientoSGC)
        .filter(
            MovimientoSGC.clave_catastral == clave_catastral
        )
        .order_by(
            MovimientoSGC.fecha_captura.desc()
        )
        .all()
    )
@router.post("", response_model=MovimientoResponse)
def crear_movimiento(
    payload: MovimientoCreate,
    db: Session = Depends(get_db),
):
    clave = payload.clave_catastral.strip().upper()
    year = datetime.now().year

    next_id = db.execute(
        text("SELECT nextval('catastro.movimientos_sgc_id_seq')")
    ).scalar_one()

    folio = f"MOV-{year}-{next_id:06d}"

    row = db.execute(
        text("""
            INSERT INTO catastro.movimientos_sgc (
                id,
                folio,
                clave_catastral,
                tipo_movimiento,
                estado,
                descripcion,
                datos,
                usuario_captura,
                fecha_captura
            )
            VALUES (
                :id,
                :folio,
                :clave,
                :tipo,
                'CAPTURADO',
                :descripcion,
                '{}'::jsonb,
                :usuario,
                NOW()
            )
            RETURNING
                id,
                folio,
                clave_catastral,
                tipo_movimiento,
                estado,
                descripcion,
                usuario_captura,
                fecha_captura
        """),
        {
            "id": next_id,
            "folio": folio,
            "clave": clave,
            "tipo": payload.tipo_movimiento,
            "descripcion": payload.descripcion,
            "usuario": payload.usuario_captura or "admin",
        },
    ).mappings().first()

    expediente = db.execute(
        text("""
            SELECT id
            FROM catastro.expediente
            WHERE clave_catastral = :clave
            LIMIT 1
        """),
        {"clave": clave},
    ).mappings().first()

    if expediente:
        db.execute(
            text("""
                INSERT INTO catastro.expediente_historial (
                    expediente_id,
                    clave_catastral,
                    tipo_evento,
                    descripcion,
                    usuario,
                    fecha_evento
                )
                VALUES (
                    :expediente_id,
                    :clave,
                    'MOVIMIENTO_CAPTURADO',
                    :descripcion,
                    :usuario,
                    NOW()
                )
            """),
            {
                "expediente_id": expediente["id"],
                "clave": clave,
                "descripcion": f"Movimiento capturado: {folio} - {payload.tipo_movimiento}",
                "usuario": payload.usuario_captura or "admin",
            },
        )

    db.commit()
    return dict(row)
@router.post("/{movimiento_id}/estado", response_model=MovimientoResponse)
def cambiar_estado_movimiento(
    movimiento_id: int,
    payload: MovimientoEstadoUpdate,
    db: Session = Depends(get_db),
):
    estado = payload.estado.strip().upper()
    usuario = payload.usuario or "admin"

    permitidos = {"CAPTURADO", "EN_REVISION", "AUTORIZADO", "APLICADO", "RECHAZADO"}

    if estado not in permitidos:
        raise ValueError("Estado no permitido")

    row_actual = db.execute(
        text("""
            SELECT id, folio, clave_catastral, tipo_movimiento
            FROM catastro.movimientos_sgc
            WHERE id = :id
        """),
        {"id": movimiento_id},
    ).mappings().first()

    if not row_actual:
        raise ValueError("Movimiento no encontrado")

    row = db.execute(
        text("""
            UPDATE catastro.movimientos_sgc
            SET
                estado = CAST(:estado AS varchar),
                usuario_autoriza = CASE
                    WHEN CAST(:estado AS varchar)
                         IN ('AUTORIZADO', 'APLICADO', 'RECHAZADO')
                    THEN :usuario
                    ELSE usuario_autoriza
                END,
                fecha_autorizacion = CASE
                    WHEN CAST(:estado AS varchar)
                         IN ('AUTORIZADO','APLICADO','RECHAZADO')
                    THEN NOW()
                    ELSE fecha_autorizacion
                END,
                fecha_actualizacion = NOW()
            WHERE id = :id
            RETURNING
                id,
                folio,
                clave_catastral,
                tipo_movimiento,
                estado,
                descripcion,
                usuario_captura,
                fecha_captura
        """),
        {
            "id": movimiento_id,
            "estado": estado,
            "usuario": usuario,
        },
    ).mappings().first()

    expediente = db.execute(
        text("""
            SELECT id
            FROM catastro.expediente
            WHERE clave_catastral = :clave
            LIMIT 1
        """),
        {"clave": row_actual["clave_catastral"]},
    ).mappings().first()

    if expediente:
        db.execute(
            text("""
                INSERT INTO catastro.expediente_historial (
                    expediente_id,
                    clave_catastral,
                    tipo_evento,
                    descripcion,
                    usuario,
                    fecha_evento
                )
                VALUES (
                    :expediente_id,
                    :clave,
                    :tipo_evento,
                    :descripcion,
                    :usuario,
                    NOW()
                )
            """),
            {
                "expediente_id": expediente["id"],
                "clave": row_actual["clave_catastral"],
                "tipo_evento": f"MOVIMIENTO_{estado}",
                "descripcion": payload.observaciones
                    or f"Movimiento {row_actual['folio']} cambiado a estado {estado}",
                "usuario": usuario,
            },
        )

    db.commit()
    return dict(row)
