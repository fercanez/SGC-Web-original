# Despliegue local en VM (GeoNode principal)

Guia para instalar SGC-Web en una VM donde ya existe GeoNode/GeoServer.

**Guía paso a paso por SSH (servidor `geoservidor`):** [deploy-ssh-geoservidor.md](deploy-ssh-geoservidor.md)

## Topologia

- **Servidor unico (VM):** `192.168.116.132`
- GeoNode + GeoServer ya instalados
- SGC-Web (API, Web y PostGIS) en Docker
- Operadores acceden por LAN

## 1) Preparar variables

Desde la raiz del proyecto:

```powershell
copy .env.example .env
```

Revise y ajuste al menos:

```env
GEONODE_URL=http://192.168.116.132
GEOSERVER_PATH=/geoserver
GEONODE_WMS_LAYERS=geonode:limite_municipal_mexicali,geonode:colonias,geonode:prediosmxli
GEONODE_USER=sgc_web
GEONODE_PASSWORD=su_password
GEONODE_SOURCE_LAYER=geonode:prediosmxli
GEONODE_FIELD_CADASTRAL=clavecatas
GEONODE_FIELD_PREDIAL=clavecatas
CADASTRAL_CODE_PATTERN=^[A-Za-z0-9]{2,3}[0-9]{6}$
VITE_API_URL=http://192.168.116.132:8000
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://192.168.116.132:5173
```

Si su GeoNode usa HTTPS valido, cambie `GEONODE_URL` a `https://192.168.116.132` o al DNS interno.

## 2) Levantar stack

```powershell
docker compose up --build -d
```

Verifique servicios:

```powershell
docker compose ps
```

## 3) Validar integracion con GeoNode

1. Estado de API:
   - `http://192.168.116.132:8000/api/v1/health`
2. Estado de proxy GeoNode:
   - `http://192.168.116.132:8000/api/v1/geonode/status`
3. Config publica:
   - `http://192.168.116.132:8000/api/v1/config`
4. Login:
   - `http://192.168.116.132:5173/login` (usuario `admin`, ver `BOOTSTRAP_ADMIN_PASSWORD` en `.env`)
5. Mapa (tras login):
   - `http://192.168.116.132:5173`

Si `geonode/status` regresa 401/403, revise permisos del usuario `sgc_web` en GeoNode.

6. Origen vectorial y sincronización de predios:
   - `http://192.168.116.132:8000/api/v1/source/status`
   - Tras login como supervisor/admin: botón **Sincronizar predios** en el panel, o `POST /api/v1/source/sync`
   - Guía: [geonode-predios-origen.md](geonode-predios-origen.md) · [geoserver-capas-vm.md](geoserver-capas-vm.md) · [clave-catastral-mexicali.md](clave-catastral-mexicali.md)

Tras actualizar el código, aplique migraciones:

```bash
docker-compose exec api alembic upgrade head
docker-compose up -d --build
```

### Error `KeyError: 'ContainerConfig'` (docker-compose 1.29.2)

Bug conocido al recrear contenedores. Suele quedar un contenedor huérfano como `1bd12912aa9d_sgc-web_api_1` en **Exit 137**.

**Opción A — script incluido en el proyecto:**

```bash
cd /opt/sgc-web
chmod +x scripts/fix-sgc-containers.sh
sh scripts/fix-sgc-containers.sh
```

**Opción B — manual:**

```bash
cd /opt/sgc-web
docker-compose down --remove-orphans 2>/dev/null || true
docker rm -f sgc-web_api_1 sgc-web_web_1 2>/dev/null
docker ps -aq --filter name=sgc-web | xargs -r docker rm -f
docker ps -aq --filter name=_sgc-web | xargs -r docker rm -f
docker-compose build --no-cache api web
docker-compose up -d --force-recreate --remove-orphans
docker-compose ps
curl -s http://127.0.0.1:8000/api/v1/health
```

**Opción C — Docker Compose v2 (recomendado a largo plazo):**

```bash
apt-get update && apt-get install -y docker-compose-plugin
cd /opt/sgc-web
docker compose down --remove-orphans
docker compose up -d --build
```

Si `api` sale **Exit 137** (memoria insuficiente), ejecute migración aparte y reinicie:

```bash
docker-compose run --rm api alembic upgrade head
docker-compose up -d api
docker-compose logs --tail=30 api
```

### Capas WMS no se ven / badge «Sin GeoNode»

GeoNode puede responder en el servidor (`curl .../geonode/status` → `"ok":true`) y aun así el
mapa no carga capas si **el navegador no alcanza la API** (puerto 8000 bloqueado o URL incorrecta).

**Solución recomendada (proxy Vite, solo puerto 5173):**

El `docker-compose.yml` incluye `VITE_USE_API_PROXY=true`: el frontend llama a
`http://192.168.116.132:5173/api/...` y Vite reenvía al contenedor `api`.

```bash
cd /opt/sgc-web
docker-compose build --no-cache web
docker-compose up -d web
```

Entrar siempre por **`http://192.168.116.132:5173`** (no `localhost`).

Probar desde su PC en el navegador (debe verse JSON con `"status":"ok"`):

```
http://192.168.116.132:5173/api/v1/health
```

Probar WMS vía proxy (PNG):

```
http://192.168.116.132:5173/api/v1/geonode/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=geonode:colonias&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX=-13000000,3800000,-12900000,3900000&WIDTH=256&HEIGHT=256
```

Si prefiere acceso directo al puerto 8000, abra el firewall:

```bash
ufw allow 8000/tcp
```

### Login «Failed to fetch» / `ERR_CONNECTION_REFUSED`

1. **API caída** — si `docker-compose ps` no muestra `api` en **Up**, arregle primero el error `ContainerConfig` (arriba).
2. **URL incorrecta en el navegador** — use la IP de la VM, no `localhost`:
   - Correcto: `http://192.168.116.132:5173/login`
   - Incorrecto desde su PC: `http://localhost:5173` (el frontend intentará `localhost:8000` y fallará)
3. En `.env` del servidor: `VITE_API_URL=http://192.168.116.132:8000` y reconstruya web: `docker-compose build --no-cache web && docker-compose up -d web`

## 4) Red y firewall

Abra en la VM:

- `5173/tcp` (frontend)
- `8000/tcp` (API)
- `5432/tcp` solo si administrara PostGIS externamente

Si el acceso sera solo interno, limite origenes por subnet municipal.

## 5) Recomendaciones operativas

- **`geonode:prediosmxli`** (*Predios Mexicali*) es el origen oficial de geometría y atributos base (WFS → PostGIS).
- GeoNode aporta también contexto cartográfico (límite, colonias) vía WMS.
- Mantener SGC-Web PostGIS como fuente operativa (titularidad, avalúos, trámites).
- Usar snapshots de VM y backup diario de base de datos.
- No publicar `.env` en repositorios.
