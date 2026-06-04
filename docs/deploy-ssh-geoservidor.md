# Despliegue por SSH — servidor `geoservidor` (GeoNode ya instalado)

Usted ya está en:

```text
root@geoservidor:/opt/geonode-instance/geonode_local#
```

**No modifique GeoNode en el primer paso.** SGC-Web se instala en otra carpeta (`/opt/sgc-web`).

---

## Paso 0 — Comprobar el servidor (2 minutos)

En SSH ejecute:

```bash
hostname -I
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/geoserver/wms?service=WMS&request=GetCapabilities
docker --version
docker compose version
```

- Anote la IP (debe ser `192.168.116.132` o similar).
- Si WMS responde `200`, GeoServer está bien.
- Si no tiene Docker, instálelo (Paso 1b).

---

## Paso 1 — Instalar Docker (solo si falta)

```bash
apt-get update
apt-get install -y docker.io docker-compose-plugin git
systemctl enable docker
systemctl start docker
```

---

## Paso 2 — Copiar el proyecto a la VM

**Desde su PC Windows** (PowerShell), con el código en `E:\SISTEMA DE GESTION CATASTRAL`:

```powershell
scp -r "E:\SISTEMA DE GESTION CATASTRAL" root@192.168.116.132:/opt/sgc-web
```

En el servidor:

```bash
cd /opt/sgc-web
ls -la
# Debe ver: backend, frontend, docker-compose.yml, .env.example
```

---

## Paso 3 — Crear `.env` (configuración)

```bash
cd /opt/sgc-web
cp .env.example .env
nano .env
```

Ajuste como mínimo:

```env
# Base catastro (si ya existe PostgreSQL en la VM)
DATABASE_URL=postgresql+psycopg://USUARIO:CLAVE@127.0.0.1:5432/catastro_lab

# GeoNode en esta misma máquina
GEONODE_URL=http://192.168.116.132
GEONODE_USER=usuario_con_permiso_en_geonode
GEONODE_PASSWORD=clave_de_ese_usuario

GEONODE_WMS_LAYERS=geonode:limite_municipal_mexicali,geonode:colonias,geonode:prediosmxli
GEONODE_WMS_LAYER_TITLES=Límite municipal,Colonias,Predios Mexicali

JWT_SECRET=genere-una-clave-larga-aleatoria-aqui
BOOTSTRAP_ADMIN_USER=admin
BOOTSTRAP_ADMIN_PASSWORD=SuClaveAdminSegura123!

VITE_API_URL=http://192.168.116.132:8000
CORS_ORIGINS=http://192.168.116.132:5173,http://localhost:5173
SEED_ON_STARTUP=true
```

### ¿Usar PostgreSQL de GeoNode o el contenedor Docker?

| Opción | Cuándo |
|--------|--------|
| **A) Contenedor `db` de docker-compose** | Más simple; base nueva `catastro_lab` solo para SGC |
| **B) PostgreSQL ya instalado en la VM** | Ponga `DATABASE_URL` con `127.0.0.1` y comente o elimine el servicio `db` en `docker-compose.yml` |

Para opción B, en PostgreSQL:

```bash
sudo -u postgres psql -c "CREATE DATABASE catastro_lab;" 2>/dev/null || true
sudo -u postgres psql -d catastro_lab -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

---

## Paso 4 — Levantar SGC-Web

```bash
cd /opt/sgc-web
docker compose up --build -d
docker compose ps
docker compose logs -f api
```

Espere ver que la API arranca y ejecuta migraciones + usuario `admin`.

---

## Paso 5 — Probar en el navegador

| Prueba | URL |
|--------|-----|
| Salud API | http://192.168.116.132:8000/api/v1/health |
| GeoNode WMS (credenciales) | http://192.168.116.132:8000/api/v1/geonode/status |
| **Login** | http://192.168.116.132:5173/login |
| Sistema | http://192.168.116.132:5173 |

- Usuario: `admin`
- Contraseña: la de `BOOTSTRAP_ADMIN_PASSWORD` en `.env`

---

## Paso 6 — Usuario de servicio en GeoNode (cartografía)

En la interfaz web de GeoNode (`http://192.168.116.132`):

1. Crear usuario `sgc_web` (o usar uno existente).
2. Asignar permiso **view** a las capas WMS que usará el mapa.
3. Esas mismas credenciales van en `GEONODE_USER` / `GEONODE_PASSWORD` del `.env`.
4. Reiniciar API: `docker compose restart api`

---

## Orden resumido (checklist)

1. [ ] SSH al servidor
2. [ ] Verificar IP y GeoServer WMS
3. [ ] Copiar proyecto a `/opt/sgc-web`
4. [ ] Crear y editar `.env`
5. [ ] `docker compose up --build -d`
6. [ ] Abrir `/login` y entrar con `admin`
7. [ ] Crear usuarios en **Administración → Usuarios**

---

## Error: puerto 5432 already in use

GeoNode ya usa PostgreSQL en el puerto **5432**. No levante el servicio `db` embebido.

Use solo:

```bash
cd /opt/sgc-web
docker-compose down
docker-compose up --build -d
```

En `.env` apunte a la base **catastro_lab** del servidor:

```env
DATABASE_URL=postgresql+psycopg://USUARIO:CLAVE@host.docker.internal:5432/catastro_lab
METRIC_SRID=32611
```

Sustituya `USUARIO` y `CLAVE` por las credenciales reales de PostgreSQL (las de GeoNode o un usuario dedicado).

### PostGIS en catastro_lab

```bash
sudo -u postgres psql -d catastro_lab -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

### Si la API no conecta a PostgreSQL

1. Verifique que PostgreSQL escucha conexiones locales:

```bash
grep listen_addresses /etc/postgresql/*/main/postgresql.conf
```

Debe incluir `localhost` o `*`.

2. Permita conexiones desde Docker en `pg_hba.conf` (red bridge, ejemplo):

```text
host    catastro_lab    all    172.17.0.0/16    md5
host    catastro_lab    all    127.0.0.1/32     md5
```

Reinicie PostgreSQL: `systemctl restart postgresql`

3. Pruebe desde el contenedor:

```bash
docker-compose logs api --tail 50
```

---

```bash
docker compose logs api --tail 100
docker compose logs web --tail 50
```

- **Error de base de datos:** revise `DATABASE_URL` y que PostGIS esté instalado.
- **401 en geonode/status:** usuario GeoNode sin permiso o clave incorrecta.
- **No abre el puerto 5173:** firewall `ufw allow 5173` y `ufw allow 8000`.
