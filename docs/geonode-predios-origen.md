# Origen cartográfico y vectorial: Predios Mexicali (`prediosmxli`)

SGC-Web separa **cartografía** (GeoNode) y **base alfanumérica** (Excel → PostgreSQL). Ver [importacion-excel.md](importacion-excel.md).

La capa GeoNode/GeoServer **`geonode:prediosmxli`** aporta:

1. **Cartografía de referencia** (WMS en el visor)
2. **Geometría y clave de enlace** (`clavecatas`) vía WFS → sync a PostGIS

Los atributos operativos (domicilio, avalúo, propietarios, etc.) se cargan desde **Excel/CSV** con `POST /api/v1/import/excel`.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  GeoNode / GeoServer — capa geonode:prediosmxli   │
│  (origen municipal de cartografía y vectorial de predios)   │
└───────────────┬─────────────────────────────┬─────────────────┘
                │ WMS (contexto mapa)       │ WFS GetFeature
                ▼                           ▼
        ┌───────────────┐           ┌──────────────────┐
        │  SGC-Web UI   │           │  API /source/sync │
        │  (React mapa) │           │  (supervisor+)    │
        └───────┬───────┘           └─────────┬─────────┘
                │ REST GeoJSON              │ upsert
                ▼                           ▼
        ┌──────────────────────────────────────────────┐
        │  PostGIS (catastro_lab) — tabla parcels      │
        │  + titularidad, avalúos, trámites (SGC-Web)  │
        └──────────────────────────────────────────────┘
```

- **GeoNode** es la fuente de **geometría** y clave catastral publicada en mapas.
- **Excel municipal** es la fuente de **datos alfanuméricos** (enlazados por `clavecatas`).
- **PostGIS (SGC-Web)** integra ambas en `parcels`, `parties`, `ownerships`.

## Configuración

En `.env` del servidor:

```env
GEONODE_URL=https://192.168.116.132
GEONODE_USER=sgc_web
GEONODE_PASSWORD=********
GEONODE_SSL_VERIFY=false

# Capa WMS (incluir predios como referencia en el mapa)
GEONODE_WMS_LAYERS=geonode:limite_municipal_mexicali,geonode:colonias,geonode:prediosmxli

# Origen vectorial oficial
GEONODE_SOURCE_LAYER=geonode:prediosmxli
GEONODE_SOURCE_TITLE=Predios Mexicali (origen oficial)
GEONODE_SOURCE_SRID=4326
SKIP_DEMO_WHEN_SOURCE_LAYER=true
```

### Mapeo de campos

Campo principal en `prediosmxli`:

```env
GEONODE_FIELD_CADASTRAL=clavecatas
GEONODE_FIELD_PREDIAL=clavecatas
```

Otros atributos (ajuste según su capa):

```env
GEONODE_FIELD_COLONY=colonia,nom_colonia
GEONODE_FIELD_ADDRESS=domicilio,direccion
GEONODE_FIELD_LAND_USE=uso_suelo,uso
GEONODE_FIELD_AREA=area,superficie
```

Clave catastral: [clave-catastral-mexicali.md](clave-catastral-mexicali.md).

Para ver qué atributos devuelve la capa:

```bash
curl -s -u "USUARIO:CLAVE" \
  "https://192.168.116.132/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=geonode:prediosmxli&count=1&outputFormat=application/json" \
  -k | jq '.features[0].properties'
```

## Sincronización

### Verificar acceso WFS

```bash
curl -s -H "Authorization: Bearer TOKEN" \
  http://192.168.116.132:8000/api/v1/source/status
```

### Importar predios (supervisor o admin)

```bash
curl -X POST -H "Authorization: Bearer TOKEN" \
  "http://192.168.116.132:8000/api/v1/source/sync"
```

Simulación sin escribir:

```bash
curl -X POST -H "Authorization: Bearer TOKEN" \
  "http://192.168.116.132:8000/api/v1/source/sync?dry_run=true&max_features=100"
```

Respuesta típica:

```json
{
  "source_layer": "geonode:prediosmxli",
  "created": 1200,
  "updated": 0,
  "skipped": 3,
  "fetched": 1203,
  "synced_total": 1200,
  "dry_run": false
}
```

Cada predio sincronizado guarda `source_layer`, `source_fid` y `synced_at` para trazabilidad y re-sincronización idempotente.

## Permisos

| Rol | Sincronizar |
|-----|-------------|
| consulta | No |
| operador | No |
| supervisor | Sí (`parcels.sync`) |
| admin | Sí |

## Migración de base de datos

Tras desplegar, ejecute Alembic en el contenedor API:

```bash
docker-compose exec api alembic upgrade head
```

## Datos de demostración

Con `SKIP_DEMO_WHEN_SOURCE_LAYER=true` (predeterminado), **no se cargan predios demo** al arrancar si hay capa de origen configurada. Use la sincronización WFS para poblar PostGIS.

## Próximos pasos

1. Afinar mapeo de colonia, domicilio y uso de suelo según atributos reales de `prediosmxli`.
2. Sincronización programada (cron) o incremental por fecha de actualización.
3. Publicar desde SGC-Web una capa derivada en GeoNode (solo lectura) para consulta ciudadana.
