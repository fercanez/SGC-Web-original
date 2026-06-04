# Importar padron_2026 completo y validar

Guía paso a paso en el servidor **geoservidor** (`/opt/sgc-web`).

## Antes de empezar

1. Subir por **FileZilla** el código actualizado a `/opt/sgc-web`
2. Subir el CSV: **`/opt/sgc-web/data/padron_2026.csv`**
3. Reconstruir API (incluye migración 006 catálogos):

```bash
cd /opt/sgc-web
docker build -t sgc-web_api ./backend
docker restart sgc-web_api_1
sleep 15
curl -s http://127.0.0.1:8000/api/v1/health
```

Verifique migración:

```bash
docker exec sgc-web_api_1 alembic current
# Debe mostrar 006 (head)
```

## Paso 1 — Simular (recomendado)

```bash
cd /opt/sgc-web
PADRON_FILE=/opt/sgc-web/data/padron_2026.csv DRY_RUN=1 \
  sh scripts/import-padron-completo.sh
```

Revise: `rows_read`, pocos `skipped`, sin errores masivos.

## Paso 2 — Importar padrón completo

```bash
PADRON_FILE=/opt/sgc-web/data/padron_2026.csv \
  sh scripts/import-padron-completo.sh
```

El script:

1. Importa a `predios_alfanumerico`
2. Genera catálogos (`cat_*`, `predio_valuaciones`)
3. Sincroniza geometría GeoNode
4. Re-enlaza por `clave_catastral` = `clavecatas`

Solo import (sin geometría aún):

```bash
SKIP_SYNC=1 PADRON_FILE=/opt/sgc-web/data/padron_2026.csv \
  sh scripts/import-padron-completo.sh
```

### Paso 2b — Catálogos vía SQL (recomendado con ~439k filas)

Si `predios_alfanumerico` ya tiene datos pero los catálogos están en 0, **no reimporte el CSV**.
`POST /api/v1/catalogs/rebuild` puede tardar horas; use el script SQL masivo:

1. Cancele cualquier `curl` de rebuild en curso (Ctrl+C).
2. En **DBeaver** (o `psql`), conecte a `catastro_lab` y ejecute:

   [`scripts/rebuild-catalogos.sql`](../scripts/rebuild-catalogos.sql)

   También desde el servidor:

   ```bash
   psql -h 127.0.0.1 -U canez -d catastro_lab -f /opt/sgc-web/scripts/rebuild-catalogos.sql
   ```

3. Reinicie la API (libera conexiones bloqueadas):

   ```bash
   sudo docker restart sgc-web_api_1
   ```

4. Siga con sync GeoNode y enlace (Paso 3 / script completo):

   ```bash
   TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"geoserver"}' \
     | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

   curl -s -X POST -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:8000/api/v1/source/sync -o /tmp/sync.json

   curl -s -X POST -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:8000/api/v1/cadastral/link | python3 -m json.tool
   ```

**No use DBeaver para volver a subir `padron_2026.csv`** si ya hay filas en
`predios_alfanumerico`: duplicaría trabajo y chocaría con `clave_catastral` UNIQUE.

> **Nota:** el script SQL **no debe usar `TRUNCATE ... CASCADE`** en tablas `cat_*`.
> PostgreSQL también trunca `predios_alfanumerico` (tiene FK hacia los catálogos).
> Use la versión actual de `rebuild-catalogos.sql` (TRUNCATE sin CASCADE, en orden).

## Paso 3 — Validar

### Conteos

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"geoserver"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/v1/catalogs/summary | python3 -m json.tool
```

Esperado (orden de magnitud según su padrón):

| Métrica | Qué indica |
|---------|------------|
| `predios_alfanumerico` | Filas importadas del CSV |
| `delegaciones` | Valores únicos de `delegacion` |
| `colonias`, `calles` | Ubicación normalizada |
| `titulares` | Personas únicas (`nombre_completo`) |
| `tasas`, `usos_suelo` | Combinaciones del padrón |
| `valuaciones` | Registros ejercicio 2026 |

### Enlace cartografía

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/v1/cadastral/link | python3 -m json.tool
```

`linked` debe acercarse al número de predios con geometría en GeoNode.

### Consulta de prueba

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/v1/cadastral/A1003001 | python3 -m json.tool
```

### En PostgreSQL (opcional)

```bash
docker exec -it sgc-web_api_1 psql "$DATABASE_URL" -c \
  "SELECT COUNT(*) FROM predios_alfanumerico;"
docker exec -it sgc-web_api_1 psql "$DATABASE_URL" -c \
  "SELECT COUNT(*) FROM cat_delegaciones;"
```

(Ajuste conexión psql según su `.env`.)

## Paso 4 — Ver en la aplicación

1. Abrir `http://192.168.116.132:5173`
2. Ctrl+F5
3. Lista de predios y mapa (tras sync geometría)

Tras actualizar el frontend (rebuild contenedor `web`):

```bash
cd /opt/sgc-web
# Suba antes frontend/ por FileZilla (DashboardPage, CadastralMap, index.css)
docker build -t sgc-web_web ./frontend
docker rm -f sgc-web_web_1
docker network inspect sgc-web_default >/dev/null 2>&1 || docker network create sgc-web_default
docker run -d \
  --name sgc-web_web_1 \
  --network sgc-web_default \
  --env-file .env \
  -e VITE_API_PROXY_TARGET=http://api:8000 \
  -p 5173:5173 \
  --restart unless-stopped \
  sgc-web_web
curl -sf http://127.0.0.1:5173/api/v1/health && echo " OK web"
```

(No use `...` en el comando; eso fue solo un ejemplo.)

- El mapa usa **capas WMS GeoNode** (no descarga 381k polígonos al navegador).
- La lista lateral muestra los **primeros 100** predios cartográficos (`parcels`), no todo el padrón.
- Use el cuadro **«Buscar en padrón (clave catastral)»** (ej. `A1003001`) para ver datos del Excel y centrar el mapa si hay enlace.
- El **resaltado** usa geometría **WFS en vivo** de GeoServer (misma fuente que el mapa WMS). La copia en PostgreSQL (`/source/sync`) puede quedar desactualizada; vuelva a sincronizar si cambió GeoNode.
- La pestaña **Propietarios** muestra la tabla `parties` (demo); los titulares del padrón están en `cat_titulares` / API cadastral.
- Si ve una **franja verde enorme**, era un bug de layout; corregido en `app-top` + flex.

## Si algo falla

| Síntoma | Acción |
|---------|--------|
| `skipped` alto | Revise encabezados CSV = nombres del padrón |
| `parcels_linked` bajo | Ejecute sync GeoNode + `/cadastral/link` |
| Colores fiscales / «Sin dato fiscal» | Importe padrón con `adeudo_2026`/`adeudo_total` o `POST /api/v1/fiscal/sync` |
| Timeout / pool DB | `docker restart sgc-web_api_1`; catálogos: SQL (abajo) |
| Catálogos vacíos / rebuild lento | `scripts/rebuild-catalogos.sql` en DBeaver/psql (5–15 min) |
| Rebuild API colgado | Ctrl+C en curl + SQL anterior + `docker restart sgc-web_api_1` |
| `predios_alfanumerico` en 0 tras SQL | Script viejo con CASCADE borró el padrón; reimporte CSV (Paso 2) |
| `set: Illegal option -` al ejecutar `.sh` | Fin de línea Windows (CRLF). En la VM: `sed -i 's/\r$//' scripts/*.sh` |
| `.env: California` / `not found` en bypass | CRLF en script o `STATE_NAME=Baja California` sin comillas; use script actualizado |

## Documentación relacionada

- [analisis-catalogos-padron.md](analisis-catalogos-padron.md)
- [importacion-excel.md](importacion-excel.md)
