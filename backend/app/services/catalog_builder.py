"""Construye catálogos a partir de predios_alfanumerico (padron2026)."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from app.catalog_models import (
    CatCalle,
    CatColonia,
    CatDelegacion,
    CatRegimenPropiedad,
    CatTasa,
    CatTitular,
    CatUsoSuelo,
    CatZonaHomogenea,
    PredioValuacion,
)
from app.config import settings
from app.models import PredioAlfanumerico


def _norm_text(value: str | None) -> str | None:
    if not value:
        return None
    text = " ".join(value.strip().split())
    return text.upper() if text else None


def _get_or_create_delegacion(db: Session, nombre: str | None) -> CatDelegacion | None:
    key = _norm_text(nombre)
    if not key:
        return None
    row = db.query(CatDelegacion).filter(CatDelegacion.nombre == key).first()
    if row:
        return row
    row = CatDelegacion(nombre=key)
    db.add(row)
    db.flush()
    return row


def _get_or_create_colonia(
    db: Session, delegacion: CatDelegacion | None, nombre: str | None
) -> CatColonia | None:
    key = _norm_text(nombre)
    if not key:
        return None
    q = db.query(CatColonia).filter(CatColonia.nombre == key)
    if delegacion:
        q = q.filter(CatColonia.delegacion_id == delegacion.id)
    else:
        q = q.filter(CatColonia.delegacion_id.is_(None))
    row = q.first()
    if row:
        return row
    row = CatColonia(delegacion_id=delegacion.id if delegacion else None, nombre=key)
    db.add(row)
    db.flush()
    return row


def _get_or_create_calle(
    db: Session, colonia: CatColonia | None, nombre: str | None
) -> CatCalle | None:
    key = _norm_text(nombre)
    if not key:
        return None
    q = db.query(CatCalle).filter(CatCalle.nombre == key)
    if colonia:
        q = q.filter(CatCalle.colonia_id == colonia.id)
    else:
        q = q.filter(CatCalle.colonia_id.is_(None))
    row = q.first()
    if row:
        return row
    row = CatCalle(colonia_id=colonia.id if colonia else None, nombre=key)
    db.add(row)
    db.flush()
    return row


def _get_or_create_zona(db: Session, codigo: str | None) -> CatZonaHomogenea | None:
    key = _norm_text(codigo)
    if not key:
        return None
    row = db.query(CatZonaHomogenea).filter(CatZonaHomogenea.codigo == key).first()
    if row:
        return row
    row = CatZonaHomogenea(codigo=key)
    db.add(row)
    db.flush()
    return row


def _get_or_create_uso(db: Session, descripcion: str | None) -> CatUsoSuelo | None:
    key = _norm_text(descripcion)
    if not key:
        return None
    row = db.query(CatUsoSuelo).filter(CatUsoSuelo.descripcion == key).first()
    if row:
        return row
    row = CatUsoSuelo(descripcion=key)
    db.add(row)
    db.flush()
    return row


def _get_or_create_tasa(
    db: Session,
    id_tasa: Decimal | None,
    porcentaje: Decimal | None,
    uso: CatUsoSuelo | None,
) -> CatTasa | None:
    if id_tasa is None or porcentaje is None:
        return None
    id_mun = int(id_tasa)
    q = db.query(CatTasa).filter(
        CatTasa.id_tasa_municipal == id_mun,
        CatTasa.porcentaje == porcentaje,
    )
    if uso:
        q = q.filter(CatTasa.uso_suelo_id == uso.id)
    else:
        q = q.filter(CatTasa.uso_suelo_id.is_(None))
    row = q.first()
    if row:
        return row
    row = CatTasa(
        id_tasa_municipal=id_mun,
        porcentaje=porcentaje,
        uso_suelo_id=uso.id if uso else None,
    )
    db.add(row)
    db.flush()
    return row


def _get_or_create_regimen(db: Session, codigo: str | None) -> CatRegimenPropiedad | None:
    key = _norm_text(codigo)
    if not key:
        return None
    row = db.query(CatRegimenPropiedad).filter(CatRegimenPropiedad.codigo == key).first()
    if row:
        return row
    row = CatRegimenPropiedad(codigo=key)
    db.add(row)
    db.flush()
    return row


def _get_or_create_titular(db: Session, nombre: str | None) -> CatTitular | None:
    key = _norm_text(nombre)
    if not key:
        return None
    row = db.query(CatTitular).filter(CatTitular.nombre_completo == key).first()
    if row:
        return row
    row = CatTitular(nombre_completo=key)
    db.add(row)
    db.flush()
    return row


def upsert_valuacion_for_predio(db: Session, predio: PredioAlfanumerico) -> None:
    """Actualiza predio_valuaciones para el ejercicio configurado (p. ej. 2026)."""
    ejercicio = settings.padron_default_ejercicio
    valor = predio.valor2026 if ejercicio == 2026 else None
    adeudo = predio.adeudo_2026 if ejercicio == 2026 else None
    _upsert_valuacion(
        db,
        predio,
        ejercicio=ejercicio,
        valor=valor,
        adeudo_ejercicio=adeudo,
        adeudo_total=predio.adeudo_total,
    )


def _upsert_valuacion(
    db: Session,
    predio: PredioAlfanumerico,
    *,
    ejercicio: int,
    valor: Decimal | None,
    adeudo_ejercicio: Decimal | None,
    adeudo_total: Decimal | None,
) -> None:
    if valor is None and adeudo_ejercicio is None and adeudo_total is None:
        return
    row = (
        db.query(PredioValuacion)
        .filter(
            PredioValuacion.predio_alfanumerico_id == predio.id,
            PredioValuacion.ejercicio == ejercicio,
        )
        .first()
    )
    if row is None:
        row = PredioValuacion(
            predio_alfanumerico_id=predio.id,
            ejercicio=ejercicio,
        )
        db.add(row)
    row.valor_catastral = valor
    row.adeudo_ejercicio = adeudo_ejercicio
    row.adeudo_total = adeudo_total


def rebuild_catalogs_from_padron(db: Session) -> dict[str, int]:
    """
    Analiza predios_alfanumerico y genera catálogos + FK + valuaciones.
    Idempotente: puede ejecutarse tras cada importación.
    """
    stats = {
        "predios_procesados": 0,
        "delegaciones": 0,
        "colonias": 0,
        "calles": 0,
        "zonas_homogeneas": 0,
        "usos_suelo": 0,
        "tasas": 0,
        "regimenes": 0,
        "titulares": 0,
        "valuaciones": 0,
    }

    before = {
        "delegaciones": db.query(CatDelegacion).count(),
        "colonias": db.query(CatColonia).count(),
        "calles": db.query(CatCalle).count(),
        "zonas_homogeneas": db.query(CatZonaHomogenea).count(),
        "usos_suelo": db.query(CatUsoSuelo).count(),
        "tasas": db.query(CatTasa).count(),
        "regimenes": db.query(CatRegimenPropiedad).count(),
        "titulares": db.query(CatTitular).count(),
    }

    predios = db.query(PredioAlfanumerico).all()

    for predio in predios:
        stats["predios_procesados"] += 1

        delegacion = _get_or_create_delegacion(db, predio.delegacion)
        colonia = _get_or_create_colonia(db, delegacion, predio.colonia)
        calle = _get_or_create_calle(db, colonia, predio.calle)
        zona = _get_or_create_zona(db, predio.zonah)
        uso = _get_or_create_uso(db, predio.descripcion_uso)
        tasa = _get_or_create_tasa(db, predio.id_tasa, predio.porcentaje_tasa, uso)
        regimen = _get_or_create_regimen(db, predio.condominio)
        titular = _get_or_create_titular(db, predio.nombre_completo)

        predio.delegacion_id = delegacion.id if delegacion else None
        predio.colonia_id = colonia.id if colonia else None
        predio.calle_id = calle.id if calle else None
        predio.zona_homogenea_id = zona.id if zona else None
        predio.uso_suelo_id = uso.id if uso else None
        predio.tasa_id = tasa.id if tasa else None
        predio.regimen_propiedad_id = regimen.id if regimen else None
        predio.titular_id = titular.id if titular else None

        before_val = (
            predio.valor2026 is not None
            or predio.adeudo_2026 is not None
            or predio.adeudo_total is not None
        )
        upsert_valuacion_for_predio(db, predio)
        if before_val:
            stats["valuaciones"] += 1

    db.flush()

    stats["delegaciones"] = db.query(CatDelegacion).count() - before["delegaciones"]
    stats["colonias"] = db.query(CatColonia).count() - before["colonias"]
    stats["calles"] = db.query(CatCalle).count() - before["calles"]
    stats["zonas_homogeneas"] = (
        db.query(CatZonaHomogenea).count() - before["zonas_homogeneas"]
    )
    stats["usos_suelo"] = db.query(CatUsoSuelo).count() - before["usos_suelo"]
    stats["tasas"] = db.query(CatTasa).count() - before["tasas"]
    stats["regimenes"] = db.query(CatRegimenPropiedad).count() - before["regimenes"]
    stats["titulares"] = db.query(CatTitular).count() - before["titulares"]

    stats["totales"] = {
        "delegaciones": db.query(CatDelegacion).count(),
        "colonias": db.query(CatColonia).count(),
        "calles": db.query(CatCalle).count(),
        "zonas_homogeneas": db.query(CatZonaHomogenea).count(),
        "usos_suelo": db.query(CatUsoSuelo).count(),
        "tasas": db.query(CatTasa).count(),
        "regimenes": db.query(CatRegimenPropiedad).count(),
        "titulares": db.query(CatTitular).count(),
        "valuaciones": db.query(PredioValuacion).count(),
    }

    return stats


def catalog_summary(db: Session) -> dict[str, int | float]:
    total_padron = db.query(PredioAlfanumerico).count()
    linked = (
        db.query(PredioAlfanumerico)
        .filter(PredioAlfanumerico.parcel_id.isnot(None))
        .count()
    )
    coverage = round(100.0 * linked / total_padron, 1) if total_padron else 0.0
    return {
        "delegaciones": db.query(CatDelegacion).count(),
        "colonias": db.query(CatColonia).count(),
        "calles": db.query(CatCalle).count(),
        "zonas_homogeneas": db.query(CatZonaHomogenea).count(),
        "usos_suelo": db.query(CatUsoSuelo).count(),
        "tasas": db.query(CatTasa).count(),
        "regimenes_propiedad": db.query(CatRegimenPropiedad).count(),
        "titulares": db.query(CatTitular).count(),
        "valuaciones": db.query(PredioValuacion).count(),
        "predios_alfanumerico": total_padron,
        "predios_linked": linked,
        "coverage_percent": coverage,
    }
