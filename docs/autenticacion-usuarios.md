# Login, roles y permisos

## Primer arranque en la VM

1. Aplique migraciones y levante la API:

```bash
cd backend
alembic upgrade head
```

2. Con `SEED_ON_STARTUP=true`, se crean:
   - Roles: `consulta`, `operador`, `supervisor`, `admin`
   - Usuario inicial: `admin` (ver `.env`)

3. Entre en el sistema:
   - URL: `http://192.168.116.132:5173/login`
   - Usuario: `admin`
   - Contraseña: valor de `BOOTSTRAP_ADMIN_PASSWORD`

4. Cambie la contraseña del administrador en **Administración → Nuevo usuario** no aplica al admin; edite vía API o actualice en base de datos y use un usuario nuevo con rol admin.

## Roles predeterminados

| Rol | Uso |
|-----|-----|
| `consulta` | Solo lectura predios/propietarios |
| `operador` | Lectura y alta de predios/propietarios |
| `supervisor` | Operador + ver listado de usuarios |
| `admin` | Todo + gestión de usuarios y permisos de roles |

## Permisos

- `dashboard.view` — entrar al mapa
- `parcels.read` / `parcels.write`
- `parties.read` / `parties.write`
- `users.read` / `users.write`
- `roles.manage` — editar permisos de roles (excepto admin)

## Pantallas

- `/login` — acceso al sistema
- `/` — mapa y catastro (requiere sesión)
- `/admin/usuarios` — usuarios y roles (requiere `users.read`)

## Base de datos `catastro_lab`

SGC-Web crea tablas propias (`users`, `roles`, `parcels`, …) en la base indicada por `DATABASE_URL`.  
No modifica las tablas internas de GeoNode; conviven en el mismo PostgreSQL si usted lo configuró así.

## API

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me` (Bearer token)
- `GET/POST /api/v1/users` (permisos users.*)
- `GET /api/v1/roles` y `PUT /api/v1/roles/{code}/permissions`
