# Mexicali + integración GeoNode

Guía para conectar **SGC-Web** con su servidor **GeoNode** existente y operar bajo el contexto del **Municipio de Mexicali, Baja California, México**.

## Contexto territorial

| Elemento | Valor |
|----------|--------|
| Entidad federativa (INEGI) | `02` — Baja California |
| Municipio (INEGI) | `002` — Mexicali |
| Proyección métrica de origen (Mexicali) | **EPSG:32611** (WGS 84 / UTM zona 11N) |
| Almacenamiento web/API | **EPSG:4326** (WGS84, GeoJSON) |
| Centro de mapa por defecto | `-115.468278`, `32.624639` |

## Clave catastral

En la capa **`geonode:prediosmxli`**, la clave única está en el campo **`clavecatas`**.

Formato (ejemplo **`ST002001`**):

```
ST002001
││ └──┴── lote o departamento (3 dígitos) → 001
│└────── manzana (3 dígitos) → 002
└─────── homoclave (2-3 alfanum.) → ST
```

| Segmento | Ejemplo | Descripción |
|----------|---------|-------------|
| Homoclave | `ST` | 2 o 3 caracteres alfanuméricos |
| Manzana | `002` | 3 dígitos |
| Lote / depto. | `001` | 3 dígitos |

En `.env`:

```env
CADASTRAL_CODE_PATTERN=^[A-Za-z0-9]{2,3}[0-9]{6}$
GEONODE_FIELD_CADASTRAL=clavecatas
GEONODE_FIELD_PREDIAL=clavecatas
```

Guía completa: [clave-catastral-mexicali.md](clave-catastral-mexicali.md).

## Configurar GeoNode

### 1. Identificar capas en GeoServer

En GeoNode:

1. **Datos** → **Capas** → seleccione la capa (ej. cartografía base, colonias, límite municipal).
2. Anote el nombre WMS: `workspace:nombre_capa` (ej. `geonode:cartografia_base`).
3. Verifique que la capa esté **publicada** y con permisos de lectura para el rol que usará SGC-Web.

### 2. Probar WMS en el navegador

Sustituya su dominio y capa:

```
https://SU-GEONODE/geoserver/wms?
  service=WMS&version=1.1.1&request=GetMap
  &layers=geonode:cartografia_base
  &bbox=-115.6,32.5,-115.3,32.7
  &width=800&height=600&srs=EPSG:4326&format=image/png
```

Si responde una imagen, la capa está lista.

### 3. Variables de entorno (VM local `192.168.116.132`)

Copie `.env.example` a `.env`. Para una instalacion local en VM con GeoNode en `192.168.116.132`:

```env
GEONODE_URL=http://192.168.116.132
GEOSERVER_PATH=/geoserver
GEONODE_WMS_LAYERS=geonode:limite_municipal_mexicali,geonode:colonias,geonode:prediosmxli
GEONODE_WMS_LAYER_TITLES=Límite municipal,Colonias,Predios Mexicali
GEONODE_SOURCE_LAYER=geonode:prediosmxli
```

Catálogo de capas de su VM: [geoserver-capas-vm.md](geoserver-capas-vm.md). Portal público geomexicali.info: [geomexicali-capas-wms.md](geomexicali-capas-wms.md).

**Las capas en GeoMexicali requieren permisos.** Configure un usuario de servicio; guía completa: [geomexicali-autenticacion.md](geomexicali-autenticacion.md).

```env
GEONODE_USER=sgc_web
GEONODE_PASSWORD=********
```

Las credenciales **no** van al navegador: el proxy `/api/v1/geonode/wms` las usa en el servidor. Verifique con `GET /api/v1/geonode/status`.

### 4. CORS y HTTPS

- En producción use **HTTPS** en GeoNode y SGC-Web.
- Si en desarrollo el mapa no carga capas, use siempre el **proxy WMS** de la API (activado por defecto cuando `GEONODE_URL` está definido).

### 5. Capas sugeridas desde su GeoNode

| Uso | Ejemplos de capas |
|-----|-------------------|
| Marco municipal | `geonode:limite_municipal_mexicali` |
| Contexto urbano | `geonode:colonias` |
| **Origen vectorial oficial** | **`geonode:prediosmxli`** (*Predios Mexicali*) |

Los **predios operativos** del sistema se **sincronizan** desde `prediosmxli` vía WFS hacia PostGIS. Ver [geonode-predios-origen.md](geonode-predios-origen.md).

## Flujo de arquitectura

```
┌──────────────────┐  WMS proxy   ┌──────────────┐
│  SGC-Web (React) │ ───────────► │   GeoNode    │
└────────┬─────────┘              │  GeoServer   │
         │ REST / GeoJSON         └──────┬───────┘
         │                               │ WFS GetFeature
         │                               │ prediosmxli
         ▼                               ▼
┌─────────────────────────────────────────────────┐
│  PostGIS — predios sincronizados + titularidad │
│  (fuente operativa SGC-Web)                    │
└─────────────────────────────────────────────────┘
```

## Próximos pasos recomendados

1. **Sincronizar predios** desde `prediosmxli` (`POST /api/v1/source/sync`). Guía: [geonode-predios-origen.md](geonode-predios-origen.md).
2. **Afinar mapeo de campos** según el esquema real de la capa en GeoNode.
3. **Sincronizar** claves catastrales con el padrón tributario municipal.
4. Publicar en GeoNode una capa de **solo lectura** generada desde SGC-Web (opcional, para consulta pública).
5. Autenticación institucional (LDAP / Llave MX) en fase 2.

## Soporte

Si comparte la URL de su GeoNode (interna) y los nombres exactos de capas WMS, el archivo `.env` puede dejarse preconfigurado para su entorno.
