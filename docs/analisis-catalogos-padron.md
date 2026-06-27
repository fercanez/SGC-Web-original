# Análisis del padrón alfanumérico y catálogos — padron2026

Documento de diseño: cómo se analiza la base alfanumérica importada y cómo SGC-Web genera catálogos normalizados en la **misma PostgreSQL** (`catastro_lab`).

## 1. Situación actual del padrón

El archivo **padron2026** (Excel) es una tabla **ancha y desnormalizada**: cada fila es un predio con todos los atributos repetidos como texto o número.

### Campos del padrón (muestra analizada)

| Campo padron2026 | Tipo | Rol en el modelo |
|------------------|------|------------------|
| `clave_catastral` | texto | **Clave de enlace** con GeoNode (`clavecatas`) |
| `nombre_completo` | texto | Titular (persona física; nombre completo) |
| `delegacion` | texto | Catálogo territorial (ej. ALGODONES) |
| `colonia` | texto | Catálogo urbano |
| `calle` | texto | Catálogo vial |
| `numof`, `numint`, `letra` | texto | Componentes de domicilio (no catálogo) |
| `zonah` | texto | Catálogo zona homogénea (MVA006A, MVAABBA) |
| `valor2026` | número | Valuación ejercicio 2026 |
| `sup_documental`, `sup_fisica`, `sup_const` | número | Superficies del predio (atributo, no catálogo) |
| `condominio` | texto | Catálogo régimen (ej. **P** = propiedad) |
| `adeudo_2026`, `adeudo_total` | número | Adeudos ejercicio / acumulado |
| `id_tasa` | entero | Catálogo tasa municipal |
| `descripcion_uso` | texto | Catálogo uso de suelo |
| `porcentaje_tasa` | número | Atributo de la tasa (2.4, 5, …) |

### Lo que **no** trae el padrón (y por tanto no se infiere aún)

- RFC / CURP separados
- Nombre, apellido paterno, apellido materno, razón social por columnas
- Histórico de valuación 2024, 2025 (solo columnas `*2026` hoy)
- Catálogo explícito de delegaciones/colonias aparte del padrón

Esos pueden agregarse en una fase posterior si el municipio entrega tablas maestras adicionales.

---

## 2. Arquitectura en PostgreSQL

```
                    ┌─────────────────────┐
                    │   predios_alfanumerico │  ← copia operativa del Excel
                    └──────────┬──────────┘
                               │ analizar DISTINCT + FK
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
  cat_delegaciones      cat_colonias           cat_titulares
  cat_calles            cat_zonas_homogeneas   cat_usos_suelo
  cat_tasas             cat_regimenes_propiedad
         │                     │
         └──────────┬──────────┘
                    ▼
            predio_valuaciones (ejercicio 2026, histórico futuro)
                    │
                    ▼
              parcels (geometría GeoNode, clave_catastral = clavecatas)
```

**Misma base de datos** `catastro_lab`. GeoNode sigue en su capa cartográfica; SGC-Web une ambas por clave.

---

## 3. Catálogos que se generan automáticamente

Tras importar el Excel, el servicio `rebuild_catalogs_from_padron` recorre `predios_alfanumerico` y:

| Catálogo | Tabla | Origen (valores únicos) |
|----------|-------|-------------------------|
| Delegaciones | `cat_delegaciones` | `delegacion` |
| Colonias | `cat_colonias` | `colonia` + FK delegación |
| Calles | `cat_calles` | `calle` + FK colonia |
| Zonas homogéneas | `cat_zonas_homogeneas` | `zonah` |
| Usos de suelo | `cat_usos_suelo` | `descripcion_uso` |
| Tasas | `cat_tasas` | `id_tasa` + `porcentaje_tasa` + uso |
| Régimen propiedad | `cat_regimenes_propiedad` | `condominio` (ej. P) |
| Titulares | `cat_titulares` | `nombre_completo` |
| Valuaciones | `predio_valuaciones` | `valor2026`, `adeudo_2026`, `adeudo_total` |

Cada predio recibe **FK** a esos catálogos (`delegacion_id`, `colonia_id`, …) manteniendo también las columnas texto originales del Excel (auditoría y compatibilidad).

### Ejemplo con su muestra (Algodones)

| Catálogo | Valores detectados |
|----------|-------------------|
| Delegaciones | ALGODONES |
| Colonias | CULIACAN (en contexto ALGODONES) |
| Calles | CULIACAN, CONOCIDO |
| Zonas H | MVA006A, MVAABBA |
| Usos | PREDIOS RESERVA URBANA…, HABITACIONAL…, COMERCIAL… |
| Tasas | (3, 2.4%), (2, 2.4%), (8, 5%), (4, 5%) |
| Régimen | P |
| Titulares | MORENO LOPEZ JONATHAN, GOMEZ SALAZAR JUAN PABLO, … |

Un titular puede aparecer en **varios predios** (ej. GOMEZ SALAZAR en A1004003 y A1004004) → **un solo registro** en `cat_titulares`.

---

## 4. Flujo operativo

```
1. POST /api/v1/import/excel          → predios_alfanumerico (+ enlace cartografía)
2. (automático) rebuild catálogos     → cat_* + predio_valuaciones + FK
3. POST /api/v1/source/sync           → parcels (geometría)
4. POST /api/v1/cadastral/link        → si hace falta re-enlazar
5. POST /api/v1/catalogs/rebuild      → re-analizar tras actualizar padrón
```

Consulta de catálogos:

- `GET /api/v1/catalogs/summary`
- `GET /api/v1/catalogs/delegaciones`
- `GET /api/v1/catalogs/colonias?delegacion_id=…`
- `GET /api/v1/catalogs/titulares`
- etc.

---

## 5. Valores por año

Hoy el padrón trae columnas fijas **2026** (`valor2026`, `adeudo_2026`).

SGC-Web copia esos importes a **`predio_valuaciones`** con `ejercicio = 2026` (configurable: `PADRON_DEFAULT_EJERCICIO=2026`).

Cuando exista padron2027, se pueden:

- añadir columnas `valor2027` / `adeudo_2027`, o
- importar solo a `predio_valuaciones` sin ampliar la tabla plana.

---

## 6. Fases futuras (opcional)

| Mejora | Descripción |
|--------|-------------|
| Separar persona física / moral | Parser de `nombre_completo` o columnas RFC/razón social |
| Catálogos maestros externos | Importar delegaciones/colonias oficiales INEGI/municipio antes del padrón |
| UI administración catálogos | Pantallas CRUD para corregir calles/colonias |
| Sincronizar titulares → `parties` | Cuando haya RFC/CURP en el padrón |

---

## 7. Migración

Migración Alembic **006** crea todas las tablas `cat_*`, `predio_valuaciones` y FK en `predios_alfanumerico`.

```bash
docker exec sgc-web_api_1 alembic upgrade head
```

Tras reconstruir la imagen API, la migración corre al arrancar el contenedor.
