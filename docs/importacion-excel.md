# Importación Excel — base alfanumérica Mexicali

SGC-Web mantiene **dos capas de datos** en PostgreSQL (`catastro_lab`):

| Capa | Tabla | Origen | Contenido |
|------|-------|--------|-----------|
| **Cartográfica** | `parcels` | GeoNode `prediosmxli` (WFS) | Geometría + `cadastral_code` (= `clavecatas`) |
| **Alfanumérica** | `predios_alfanumerico` | **padron2026** (Excel/CSV) | Titular, domicilio, avalúo, adeudos, tasas, etc. |

Enlace oficial confirmado:

```
padron2026.clave_catastral  =  prediosmxli.clavecatas  =  parcels.cadastral_code
```

(`prediosmxli` = capa *Predios Mexicali* en GeoServer; título alternativo *predios_mexicali*.)

Si no trae columna `clave_catastral_norm`, se copia desde `clave_catastral` (mismo valor que `clavecatas`).

### Ejemplo real (delegación Algodones)

| clave_catastral | nombre_completo | delegacion | valor2026 | descripcion_uso |
|-----------------|-----------------|------------|-----------|-----------------|
| A1003001 | MORENO LOPEZ JONATHAN | ALGODONES | 160 | PREDIOS RESERVA URBANA… |
| A1004003 | GOMEZ SALAZAR JUAN PABLO | ALGODONES | 1,890.00 | HABITACIONAL (USO PROPIETARIO) |

El importador interpreta:

- Celdas `NULL` o vacías → sin valor en PostgreSQL
- Números con coma miles: `183,514.32`, `1,890.00`
- `numof` / `numint` / `letra` = `0` → sin número en domicilio

## Columnas oficiales (su base de datos)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `clave_catastral` | text | **Obligatorio.** Igual a `clavecatas` en GeoNode |
| `clave_catastral_norm` | text | Opcional; si falta, = `clave_catastral` |
| `nombre_completo` | text | Titular / propietario |
| `delegacion` | text | Delegación catastral |
| `colonia` | text | Colonia |
| `calle` | text | Vialidad |
| `numof` | text | Número exterior |
| `numint` | text | Número interior |
| `letra` | text | Letra |
| `zonah` | text | Zona homogénea |
| `valor2026` | numeric | Valor catastral |
| `sup_documental` | numeric | Superficie documental (m²) |
| `sup_fisica` | numeric | Superficie física (m²) |
| `condominio` | text | Condominio / régimen |
| `adeudo_2026` | numeric | Adeudo ejercicio |
| `adeudo_total` | numeric | Adeudo total |
| `sup_const` | numeric | Superficie construida (m²) |
| `id_tasa` | numeric | Identificador de tasa |
| `descripcion_uso` | text | Uso de suelo |
| `porcentaje_tasa` | numeric | Porcentaje de tasa |

Plantilla: [plantilla-importacion-predios.csv](plantilla-importacion-predios.csv)

## Flujo recomendado

```
1. Importar Excel  →  predios_alfanumerico
   POST /api/v1/import/excel

2. Sincronizar geometría GeoNode  →  parcels
   POST /api/v1/source/sync
   (al final re-enlaza automáticamente)

   — o al revés: sync primero, Excel después —

3. Si hace falta re-enlazar manualmente:
   POST /api/v1/cadastral/link
```

## Importar en el servidor

```bash
# Subir archivo: /opt/sgc-web/data/padron.xlsx

TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"SU_CLAVE"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Simular
curl -s -X POST "http://127.0.0.1:8000/api/v1/import/excel?dry_run=true" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/opt/sgc-web/data/padron.xlsx"

# Importar real
curl -s -X POST http://127.0.0.1:8000/api/v1/import/excel \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/opt/sgc-web/data/padron.xlsx"
```

## Migración de tabla en PostgreSQL

Tras reconstruir la API, aplique migraciones:

```bash
docker exec sgc-web_api_1 alembic upgrade head
```

O al arrancar con `SEED_ON_STARTUP=true` puede ejecutarse manualmente la primera vez.

## Consultar datos alfanuméricos

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/v1/cadastral/ST002001

curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/v1/cadastral/by-parcel/{parcel_id}

curl -s http://127.0.0.1:8000/api/v1/cadastral/fields
```

## Cargar directo en PostgreSQL (alternativa)

Si ya creó la tabla en pgAdmin con los mismos nombres de columna, puede:

1. Importar con **COPY** o herramienta ETL a `predios_alfanumerico`
2. Ejecutar **`POST /api/v1/cadastral/link`** para vincular con predios cartográficos

La tabla debe incluir columna `id` (UUID) o dejar que SGC-Web la genere vía import Excel.

## Configuración (.env)

```env
GEONODE_SYNC_GEOMETRY_ONLY=true
GEONODE_FIELD_CADASTRAL=clavecatas
```

La sync cartográfica **no sobrescribe** domicilio, avalúo ni adeudos del Excel.

## Catálogos normalizados

Tras importar el padrón, SGC-Web **analiza** `predios_alfanumerico` y genera catálogos (delegaciones, colonias, calles, zonas H, usos, tasas, titulares, valuaciones 2026).

Documento de análisis: [analisis-catalogos-padron.md](analisis-catalogos-padron.md)

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/v1/catalogs/summary
curl -s -X POST -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/v1/catalogs/rebuild
```
