# Arquitectura — SGC-Web (Gestión Catastral Multifinalitario)

## Visión

Sistema web de **gestión catastral multifinalitario** para el **Municipio de Mexicali, Baja California, México**, integrado con **GeoNode** (`geonode:prediosmxli`) para cartografía y origen vectorial de predios, bajo licencia **AGPL-3.0**, alineado con ISO 19152 LADM y OGC.

## Principios open source

| Principio | Implementación |
|-----------|----------------|
| Datos abiertos | API REST + GeoJSON; exportación estándar |
| Sin vendor lock-in | PostgreSQL/PostGIS, formatos abiertos |
| Extensible | Módulos por dominio (catastro, tributación, planeación) |
| Auditable | Código público, migraciones versionadas, trazabilidad |
| Soberanía | Despliegue on-premise o nube del municipio |

## Stack tecnológico

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite + MapLibre GL)                      │
│  — Mapa catastral, consultas, formularios, expedientes      │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS / JSON / GeoJSON
┌──────────────────────────▼──────────────────────────────────┐
│  API (FastAPI + SQLAlchemy 2 + GeoAlchemy2)                 │
│  — REST, validación, auth (JWT, futuro OIDC)                │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  PostgreSQL 16 + PostGIS 3                                  │
│  — Geometrías, índices espaciales, vistas materializadas    │
└─────────────────────────────────────────────────────────────┘
```

## Modelo de dominio (inspirado en LADM)

- **Party**: persona natural o jurídica (propietario, poseedor, usufructuario).
- **BaUnit** (unidad administrativa básica): predio/lote catastral con código único municipal.
- **SpatialUnit**: representación espacial (polígono, multipolígono) en SRID configurable (default EPSG:4326; producción suele usar proyección local).
- **RRR** (Rights, Restrictions, Responsibilities): derechos reales, gravámenes, servidumbres.
- **ParcelUse**: uso del suelo / clasificación catastral.
- **Valuation**: avalúo catastral y vigencias.
- **PurposeModule**: extensión multifinalitario (tributación, planeación, ambiente, servicios).

## Módulos multifinalitarios (roadmap)

1. **Catastro** (MVP): predios, mapa, propietarios, consulta pública básica.
2. **Tributación**: base gravable, exenciones, sincronización con sistema tributario.
3. **Planeación urbana**: zonificación, normas, compatibilidad de usos.
4. **Ambiente / riesgos**: capas de amenaza, restricciones.
5. **Servicios públicos**: redes, acometidas por predio.
6. **Expedientes**: trámites (fusión, subdivisión, rectificación).

## Seguridad (fases)

- Fase 1: API sin auth en desarrollo; CORS restringido en producción.
- Fase 2: JWT + roles (consulta, operador, administrador).
- Fase 3: OIDC/Keycloak para SSO gubernamental.

## Despliegue

- Desarrollo: `docker compose up`
- Producción: Kubernetes o Docker Swarm + reverse proxy (Traefik/Caddy) + backups PostGIS.

## Referencias

- [ISO 19152 LADM](https://www.iso.org/standard/67040.html)
- [PostGIS](https://postgis.net/)
- [OGC API — Features](https://ogcapi.ogc.org/features/)
