# SGC-Web — Gestión Catastral · Mexicali, B.C.

Plataforma web **open source** (AGPL-3.0) para el **Municipio de Mexicali, Baja California, México**: predios, mapa catastral, propietarios, avalúos en MXN e integración con **GeoNode** para cartografía base.

## Características

- Clave catastral **`clavecatas`** en capa `prediosmxli` (ej. `ST002001`: homoclave + manzana + lote).
- Cálculo de áreas en **EPSG:32611** (WGS 84 / UTM 11N, origen cartográfico Mexicali).
- Visor **MapLibre** con capas **WMS desde GeoNode** (proxy seguro en la API).
- **Origen oficial** de geometría y atributos de predios: capa `geonode:prediosmxli` (*Predios Mexicali*, WFS → PostGIS).
- Predios operativos en **PostGIS**; titularidad y avalúos gestionados en SGC-Web.
- API REST documentada en `/docs`.

## Requisitos

- [Docker](https://www.docker.com/) y Docker Compose v2  
- Servidor **GeoNode** con capas WMS publicadas (opcional pero recomendado)

## Escenario objetivo actual

Despliegue local completo en **una máquina virtual** con GeoNode como servidor principal:

- **IP VM:** `192.168.116.132`
- **GeoNode/GeoServer:** instalados en esa misma VM
- **SGC-Web (API + Web + PostGIS):** contenedores Docker en esa misma VM
- **Acceso operador:** por LAN usando `http://192.168.116.132:5173`

## Configuración GeoNode

1. Copie el archivo de ejemplo:

```powershell
copy .env.example .env
```

2. Edite `.env` con la URL de su GeoNode y los nombres de capa WMS:

```env
GEONODE_URL=http://192.168.116.132
GEOSERVER_PATH=/geoserver
GEONODE_WMS_LAYERS=geonode:limite_municipal_mexicali,geonode:colonias,geonode:prediosmxli
GEONODE_WMS_LAYER_TITLES=Límite municipal,Colonias,Predios Mexicali

# Origen vectorial oficial (sincronización WFS)
GEONODE_SOURCE_LAYER=geonode:prediosmxli
```

Catálogo de capas: [geoserver-capas-vm.md](docs/geoserver-capas-vm.md) · Clave catastral: [clave-catastral-mexicali.md](docs/clave-catastral-mexicali.md)

Guías: [GeoNode](docs/mexicali-geonode.md) · [Origen prediosmxli](docs/geonode-predios-origen.md) · [Autenticación](docs/geomexicali-autenticacion.md)

## Inicio rápido

```powershell
cd "e:\SISTEMA DE GESTION CATASTRAL"
copy .env.example .env
docker compose up --build
```

| Servicio   | URL                          |
|-----------|------------------------------|
| Frontend (VM)  | http://localhost:5173        |
| Login (LAN)    | http://192.168.116.132:5173/login |
| Frontend (LAN) | http://192.168.116.132:5173  |
| API (VM)       | http://localhost:8000        |
| API (LAN)      | http://192.168.116.132:8000  |
| API Docs       | http://192.168.116.132:8000/docs |
| Config         | http://192.168.116.132:8000/api/v1/config |

Sin GeoNode configurado, el mapa usa OpenStreetMap como respaldo.

## Despliegue VM + GeoNode local

Pasos detallados: [deploy VM](docs/deploy-vm-local.md) · [Login y roles](docs/autenticacion-usuarios.md)

## Estructura

```
├── backend/          # FastAPI + PostGIS
├── frontend/         # React + MapLibre + capas GeoNode
├── docs/
│   ├── arquitectura.md
│   └── mexicali-geonode.md
├── .env.example
└── docker-compose.yml
```

## Desarrollo local

Ver secciones en `.env.example`. Migraciones:

```powershell
cd backend
alembic upgrade head
python -m app.seed
```

## Licencia

[AGPL-3.0](LICENSE)
