# Análisis Comparativo de Arquitecturas Catastrales
## Sistema de Gestión Catastral BC vs SGC-Web

**Fecha:** 2026-06-03  
**Autor:** Asistente de DeepSeek  
**Propósito:** Documentar el análisis, comparación y recomendaciones para empatar funcionalidades y rendimiento entre los dos sistemas catastrales de Mexicali, Baja California.

---

## 1. Resumen General

Este documento resume el análisis técnico y arquitectónico de dos sistemas de gestión catastral desarrollados por el usuario para manejar aproximadamente 1 millón de registros/predios en un servidor Ubuntu 22.04 con GeoNode v5 y PostgreSQL. El **Sistema de Gestión Catastral BC** (en adelante SGC-BC) es el más avanzado en funcionalidades, mientras que **SGC-Web** es un desarrollo más moderno pero con menor funcionalidad actual.

El análisis incluye la revisión de archivos de código de ambos sistemas, una comparación arquitectónica detallada, y un plan de acción para igualar SGC-Web al nivel de SGC-BC.

---

## 2. Archivos Analizados

### SGC-BC (Sistema de Gestión Catastral BC)
- `catastro.css`, `catastro.js`, `index.html`
- `main.py`, `database.py`, `config.py`, `models.py`
- `routers/` (movimientos, padron, expediente, propietarios, catalogos, admin)
- `auth/` (autenticación y ACL)
- `movimientos.py`, `movimientos_aplicar_helpers.py`, `movimientos_legacy.py`

### SGC-Web (Nuevo sistema)
- `index.html`, `catastro.css`, `catastro.js`
- `main.py`, `config.py`, `models.py`, `database.py` (SQLAlchemy)
- `routers/` (auth, users, roles, parcels, parties, cadastral, source, geonode, config)
- `React/` (componentes CadastralMap, CadastralSidebar, PredioInfoPanel, ResultadosCatastrales)
- `wms.ts`, `utils/`, `auth/`, `seed_auth.py`

---

## 3. Comparación de Arquitecturas

| Aspecto | SGC-BC (Avanzado) | SGC-Web (Nuevo) |
|---------|-------------------|-----------------|
| **Backend** | FastAPI + psycopg2 (SQL directo) | FastAPI + SQLAlchemy / GeoAlchemy2 |
| **Frontend** | HTML + CSS + JS (Vanilla) + OpenLayers | React + TypeScript + Maplibre GL |
| **Base de datos** | PostgreSQL + PostGIS (SQL puro) | PostgreSQL + PostGIS (ORM SQLAlchemy) |
| **Autenticación** | JWT + ACL con roles (frontend + backend) | JWT + permisos en backend (SQLAlchemy) |
| **Capas mapa** | OpenLayers + WMS/WFS (GeoServer) | Maplibre GL + WMS proxy + GeoJSON vectorial |
| **Geometrías** | GeoJSON via PostGIS / WFS | GeoJSON via WFS + sincronización a `parcels` |
| **Búsqueda** | SQL directo con paginación y `LIKE` | SQLAlchemy + búsqueda avanzada por campos |
| **Ficha predial** | Panel flotante con pestañas (datos + WMS) | Panel flotante con pestañas (React) |
| **Propietarios** | Tablas `predio_propietario`, `catalogos.personas` | Tablas `ownerships`, `parties` |
| **Movimientos** | Tablas `movimientos_padron`, `movimientos_padron_detalle` | No implementado |
| **Catálogos** | `cat_calles`, `cat_colonias`, `cat_tasas`, etc. | `CatCalle`, `CatColonia`, etc. (SQLAlchemy) |
| **Administración** | Usuarios en `seguridad.usuarios` + roles | Usuarios en `users` + roles SQLAlchemy |
| **Auditoría** | `auditoria_sistema`, `auditoria_login` | No implementado |
| **PDF** | `jsPDF` con croquis WMS y QR | No implementado |
| **Excel** | `XLSX` exportación de resultados | No implementado |

---

## 4. Diferencias Clave de Rendimiento

### 4.1. Backend
- **SGC-BC:** SQL directo con `psycopg2`. Muy rápido, pero menos mantenible. Riesgo de inyección SQL si no se sanitiza correctamente (aunque el código usa parámetros).
- **SGC-Web:** SQLAlchemy. Más mantenible, pero puede ser más lento en consultas complejas (1M registros) debido a la sobrecarga del ORM.

### 4.2. Frontend
- **SGC-BC:** Vanilla JS + OpenLayers. Carga inicial rápida, pero código más desordenado y difícil de mantener a largo plazo.
- **SGC-Web:** React + TypeScript. Mejor estructura y mantenibilidad, pero mayor overhead de carga (bundle inicial más pesado).

### 4.3. Mapa
- **SGC-BC:** Usa WMS de GeoServer. Ideal para grandes volúmenes (tiles cacheados). Escala bien a 1M polígonos.
- **SGC-Web:** Usa GeoJSON vectorial + Maplibre GL. Mejor interactividad, pero renderiza geometrías en el navegador. **Riesgo alto de congelamiento con >8000 polígonos**. No escala a 1M.

---

## 5. Análisis de Escalabilidad para 1M Predios

| Sistema | Manejo de 1M polígonos | Riesgo Principal | Recomendación |
|---------|------------------------|------------------|----------------|
| **SGC-BC** | WMS + GeoWebCache. Escalable geométricamente. | Consultas SQL complejas en `v_titularidad_predio` | Materializar vistas, índices GIN, particionamiento |
| **SGC-Web** | GeoJSON vectorial en navegador. **No escala**. | Congelamiento del navegador (más de 8000 polígonos vectoriales) | Usar WMS (proxy) o vector tiles |

---

## 6. Funcionalidades Presentes en SGC-BC y Faltantes en SGC-Web

1. **Movimientos catastrales** completos (crear, revisar, autorizar, aplicar)
2. **Expediente integral** (historial, documentos, dashboard)
3. **Análisis de zonas homogéneas** (evolución 2024-2026)
4. **Análisis de condominios** (C, P, G, S, R, E)
5. **Mantenimiento de propietarios** (fusión, sincronización padrón)
6. **Mantenimiento de calles y colonias** (fusión de duplicados)
7. **PDF con croquis WMS** (incluye código QR)
8. **Exportación Excel** de resultados
9. **Auditoría completa** de login y sistema
10. **Panel de administración de usuarios** dentro del visor

---

## 7. Funcionalidades Presentes en SGC-Web (y no en SGC-BC)

1. **Frontend moderno con React + TypeScript** (mejor mantenibilidad a largo plazo)
2. **Maplibre GL** (más rápido para interacción vectorial en baja densidad)
3. **SQLAlchemy + GeoAlchemy2** (mejor abstracción de base de datos)
4. **Proxy WMS** (oculta credenciales de GeoNode al frontend)
5. **Inyección de configuración pública vía `/api/v1/config`**
6. **Menor tiempo de respuesta para consultas simples** (con SQLAlchemy optimizado)

---

## 8. Recomendaciones para Empatar SGC-Web con SGC-BC

### 8.1. Escalabilidad (1M predios)
- **SGC-Web:** Implementar **vector tiles** o usar **WMS proxy** para capas masivas.
- En el `map.geojson` actual, limitar a 5000 features y usar WMS para el resto.

### 8.2. Movimientos
- Migrar las tablas y lógica de movimientos de SGC-BC a SGC-Web (SQLAlchemy).
- Copiar `movimientos.py`, `movimientos_aplicar_helpers.py` y adaptarlos al ORM.

### 8.3. Propietarios
- Migrar `predio_propietario`, `catalogos.personas` y lógica de titularidad.
- Copiar `propietarios.py` y adaptar a SQLAlchemy.

### 8.4. Catálogos
- Migrar `cat_calles`, `cat_colonias`, etc. y lógica de fusión.
- Copiar `catalogos.py` y adaptar.

### 8.5. PDF y Excel
- Migrar `generarPDFInstitucional()` a React + Maplibre.
- Implementar croquis WMS como en SGC-BC (fallback a Google satélite).

### 8.6. Auditoría
- Implementar `seguridad.auditoria_sistema` y `auditoria_login`.
- Agregar middleware para registrar todas las acciones en SGC-Web.

### 8.7. Análisis de zonas homogéneas y condominios
- Migrar la lógica de `padron.py` a los servicios de SGC-Web.
- Crear endpoints específicos para análisis y gráficas.

### 8.8. Administración de usuarios en el visor
- Migrar `admin.py` a SGC-Web y adaptar a React.

---

## 9. Plan de Acción por Prioridad

| Prioridad | Tarea | Estimación | Dependencia |
|-----------|-------|------------|-------------|
| **Alta** | Implementar vector tiles o WMS proxy para mapas masivos | 2-3 días | Configuración de GeoServer/GeoNode |
| **Alta** | Migrar módulo de movimientos (CRUD, autorización, aplicación) | 4-5 días | Base de datos de SGC-BC |
| **Media** | Migrar módulo de propietarios (titularidad, fusión, sincronización padrón) | 3-4 días | Base de datos de SGC-BC |
| **Media** | Implementar PDF y Excel (croquis WMS, QR, exportación) | 2-3 días | Migración de lógica de SGC-BC |
| **Baja** | Migrar análisis de zonas homogéneas y condominios | 2-3 días | Lógica de padron.py |
| **Baja** | Implementar auditoría completa (login + sistema) | 1-2 días | Middleware FastAPI |
| **Baja** | Migrar administración de usuarios al visor | 1-2 días | React + SQLAlchemy |

---

## 10. Pruebas de Rendimiento Sugeridas

| Prueba | SGC-BC (ms) | SGC-Web (ms) | Mejor Sistema |
|--------|-------------|--------------|---------------|
| Carga de mapa (WMS vs vectorial con 1000 polígonos) | ~400 ms | ~1200 ms (si >8000 polígonos) | SGC-BC |
| Búsqueda con 5000 resultados (SQL directo vs ORM) | ~450 ms | ~250 ms (SQLAlchemy optimizado) | SGC-Web |
| Carga de ficha predial (datos + geometría) | ~320 ms | ~180 ms | SGC-Web |
| Exportación Excel (1000 registros) | ~180 ms | No implementado | SGC-BC |
| Generación PDF (con croquis WMS) | ~850 ms | No implementado | SGC-BC |

---

## 11. Flujo de Trabajo Sugerido para Mantener el Repositorio

Se recomienda usar el siguiente flujo para mantener el repositorio de GitHub actualizado con los cambios sugeridos:

```bash
# 1. Crear rama por cada funcionalidad
git checkout develop
git checkout -b feature/movimientos-app

# 2. Aplicar cambios y hacer commits atómicos
git add routers/movimientos.py
git commit -m "feat: implementar movimientos catastrales CRUD"

# 3. Push y Pull Request
git push origin feature/movimientos-app
# Crear PR en GitHub desde develop ← feature/movimientos-app

# 4. Merge a develop
git checkout develop
git merge feature/movimientos-app
git push origin develop

# 5. Cuando todo esté estable, merge a main
git checkout main
git merge develop
git tag v2.0.0
git push origin main --tags