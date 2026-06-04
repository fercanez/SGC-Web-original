from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import SessionLocal
from app.routers import (
    auth,
    cadastral,
    catalogs,
    config_router,
    geonode,
    health,
    import_data,
    parcels,
    parties,
    roles,
    expediente,
    fiscal,
    movimientos,
    source,
    users,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    #db = SessionLocal()
    #try:
     #   init_postgis(db)
    #finally:
     #   db.close()
    if settings.seed_on_startup:
        from app.auth.seed_auth import run_auth_seed
        from app.seed import run_seed

        run_auth_seed()
        run_seed()
    yield


app = FastAPI(
    title="SGC-Web API — Mexicali",
    description=(
        "API de Gestión Catastral Multifinalitario. "
        "Municipio de Mexicali, Baja California, México."
    ),
    version="0.3.0",
    lifespan=lifespan,
)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(roles.router, prefix="/api/v1")
app.include_router(config_router.router, prefix="/api/v1")
app.include_router(geonode.router, prefix="/api/v1")
app.include_router(source.router, prefix="/api/v1")
app.include_router(fiscal.router, prefix="/api/v1")
app.include_router(import_data.router, prefix="/api/v1")
app.include_router(cadastral.router, prefix="/api/v1")
app.include_router(catalogs.router, prefix="/api/v1")
app.include_router(parties.router, prefix="/api/v1")
app.include_router(parcels.router, prefix="/api/v1")
app.include_router(expediente.router, prefix="/api/v1")
app.include_router(movimientos.router, prefix="/api/v1")

@app.get("/")
def root():
    return {
        "name": "SGC-Web API",
        "docs": "/docs",
        "health": "/api/v1/health",
    }
