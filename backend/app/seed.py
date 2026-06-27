"""Datos de demostración — zona centro, Mexicali, B.C."""

from decimal import Decimal

from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.geo import geojson_to_wkt
from app.models import Ownership, Parcel, ParcelStatus, Party, PartyType, RightType

# Polígonos de referencia cerca del Centro Cívico / Zona Centro (WGS84)
DEMO_PARCELS = [
    {
        "cadastral_code": "ST002001",
        "predial_account": "ST002001",
        "address": "Calz. Benito Juárez 100, Zona Centro",
        "colony": "Centro",
        "postal_code": "21000",
        "land_use": "habitacional",
        "cadastral_value": Decimal("850000.00"),
        "geometry": {
            "type": "MultiPolygon",
            "coordinates": [
                [
                    [
                        [-115.4698, 32.6642],
                        [-115.4692, 32.6642],
                        [-115.4692, 32.6647],
                        [-115.4698, 32.6647],
                        [-115.4698, 32.6642],
                    ]
                ]
            ],
        },
    },
    {
        "cadastral_code": "ST002002",
        "predial_account": "ST002002",
        "address": "Av. Reforma 250, Zona Centro",
        "colony": "Centro",
        "postal_code": "21000",
        "land_use": "comercial",
        "cadastral_value": Decimal("2100000.00"),
        "geometry": {
            "type": "MultiPolygon",
            "coordinates": [
                [
                    [
                        [-115.4691, 32.6642],
                        [-115.4685, 32.6642],
                        [-115.4685, 32.6647],
                        [-115.4691, 32.6647],
                        [-115.4691, 32.6642],
                    ]
                ]
            ],
        },
    },
    {
        "cadastral_code": "ST003001",
        "predial_account": "ST003001",
        "address": "Blvd. López Mateos 500",
        "colony": "Segunda Sección",
        "postal_code": "21100",
        "land_use": "mixto",
        "cadastral_value": Decimal("1450000.00"),
        "geometry": {
            "type": "MultiPolygon",
            "coordinates": [
                [
                    [
                        [-115.4698, 32.6648],
                        [-115.4685, 32.6648],
                        [-115.4685, 32.6653],
                        [-115.4698, 32.6653],
                        [-115.4698, 32.6648],
                    ]
                ]
            ],
        },
    },
]


def run_seed(db: Session | None = None) -> None:
    if settings.skip_demo_when_source_layer and settings.geonode_source_layer.strip():
        return

    close = False
    if db is None:
        db = SessionLocal()
        close = True
    try:
        if db.query(Parcel).count() > 0:
            return

        party1 = Party(
            party_type=PartyType.NATURAL,
            document_id="GAMA850101HDFRXN09",
            full_name="Juan Carlos Gómez Arredondo",
            email="juan.gomez@example.com",
        )
        party2 = Party(
            party_type=PartyType.JURIDICA,
            document_id="IME120101ABC",
            full_name="Inmobiliaria Mexicali SA de CV",
        )
        db.add_all([party1, party2])
        db.flush()

        for item in DEMO_PARCELS:
            data = dict(item)
            geom = data.pop("geometry")
            parcel = Parcel(
                **data, status=ParcelStatus.ACTIVO, geom=geojson_to_wkt(geom)
            )
            db.add(parcel)
        db.flush()

        parcels = db.query(Parcel).all()
        db.add(
            Ownership(
                parcel_id=parcels[0].id,
                party_id=party1.id,
                right_type=RightType.PROPIEDAD,
                share_percent=Decimal("100"),
            )
        )
        db.add(
            Ownership(
                parcel_id=parcels[1].id,
                party_id=party2.id,
                right_type=RightType.PROPIEDAD,
                share_percent=Decimal("100"),
            )
        )
        db.commit()
    finally:
        if close:
            db.close()


if __name__ == "__main__":
    run_seed()
    print("Seed Mexicali completado.")
