# Plan de Emparejamiento: SGC-Web vs Sistema-de-Gestion-Catastral

> Objetivo: igualar funcionalidad priorizando **cartografía (mapas)**, **consultas PostgreSQL** y **velocidad de despliegue**.

## 1) Metadatos de control
- Fecha inicio:
- Responsable técnico:
- Equipo:
- Repositorio fuente (maduro): `fercanez/Sistema-de-Gestion-Catastral`
- Repositorio destino: `fercanez/SGC-Web`
- Rama de trabajo:
- Estado global: `No iniciado | En progreso | Bloqueado | Completado`

---

## 2) Tablero de avance por fases

| Fase | Objetivo | Estado | % | Fecha objetivo | Notas |
|---|---|---|---:|---|---|
| Fase 1 | Paridad mínima operativa (API + DB + mapa base) | No iniciado | 0 |  |  |
| Fase 2 | Optimización mapas + consultas PostgreSQL | No iniciado | 0 |  |  |
| Fase 3 | Despliegue robusto + pruebas de humo | No iniciado | 0 |  |  |

---

## 3) Matriz funcional detallada (control principal)

| ID | Módulo | Endpoint/Función fuente | Endpoint/Función destino | SQL/Vista/Tabla | Frontend dependiente | Prioridad (P0/P1/P2) | Estado | Responsable | PR/Commit | Fecha objetivo | Riesgo | Notas |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MF-001 | Predios | `GET /predios/search` | `GET /predios/search` | `predios`, `propietarios` | Buscador + listado | P0 | No iniciado |  |  |  | Medio |  |
| MF-002 | Ficha predial | `GET /predios/{clave}` | `GET /predios/{clave}` | vista_ficha_predial | Vista ficha | P0 | No iniciado |  |  |  | Alto |  |
| MF-003 | Movimientos | `GET /movimientos` | `GET /movimientos` | `movimientos_padron` | Historial | P0 | No iniciado |  |  |  | Medio |  |
| MF-004 | Auth | Login/roles | Login/roles | users/roles | Todo | P0 | No iniciado |  |  |  | Alto |  |
| MF-005 | Mapa capa predios | capa catastral | capa catastral | geometría predios (PostGIS) | Mapa | P0 | No iniciado |  |  |  | Alto |  |
| MF-006 | Click mapa→ficha | identify/query | identify/query | predios + ficha | Popup/ficha | P0 | No iniciado |  |  |  | Alto |  |
| MF-007 | Filtros espaciales | bbox/zoom | bbox/zoom | índice GiST geom | Mapa | P1 | No iniciado |  |  |  | Alto |  |
| MF-008 | Catálogos | catálogos base | catálogos base | tablas catálogo | Filtros UI | P1 | No iniciado |  |  |  | Medio |  |
| MF-009 | Deploy API | arranque backend | compose backend | n/a | n/a | P2 | No iniciado |  |  |  | Medio |  |
| MF-010 | Smoke tests | health/db/mapa | health/db/mapa | n/a | n/a | P2 | No iniciado |  |  |  | Bajo |  |

---

## 4) Registro de rendimiento (mapas + PostgreSQL)

| ID | Endpoint | Métrica objetivo | Baseline actual | Resultado actual | Estado | Evidencia (PR/issue/log) |
|---|---|---|---:|---:|---|---|
| PERF-001 | `/predios/search` | p95 < 400ms |  |  | No iniciado |  |
| PERF-002 | `/map/predios?bbox=...` | p95 < 700ms |  |  | No iniciado |  |
| PERF-003 | `/predios/{clave}` | p95 < 250ms |  |  | No iniciado |  |
| PERF-004 | render inicial mapa | < 2.5s |  |  | No iniciado |  |

---

## 5) Checklist de PostgreSQL/PostGIS

- [ ] Pool de conexiones habilitado (min/max definidos)
- [ ] Timeouts de query y conexión configurados
- [ ] Índices B-tree en claves de búsqueda
- [ ] Índices espaciales GiST en geometrías (si aplica)
- [ ] Queries sin `SELECT *` en endpoints críticos
- [ ] Paginación y límites en endpoints de consulta
- [ ] Filtros por `bbox`/`zoom` para mapa
- [ ] Vistas/materializadas evaluadas para consultas pesadas
- [ ] EXPLAIN ANALYZE de top queries documentado

---

## 6) Checklist de despliegue

- [ ] `.env.example` completo y vigente
- [ ] `docker-compose.yml` con healthchecks
- [ ] Orden de arranque API↔DB validado
- [ ] Script de migración/seed ejecutable
- [ ] Endpoint `/health` operativo
- [ ] Pruebas de humo automatizadas post-deploy
- [ ] Guía de rollback documentada
- [ ] Registro de versión (tag/release) por despliegue

---

## 7) Plantilla de control por PR (usar en cada Pull Request)

### Resumen
- Objetivo del PR:
- Módulos impactados:
- Relacionado con IDs de matriz: (ej. MF-002, MF-006)

### Cambios
- [ ] Backend
- [ ] Frontend
- [ ] SQL/DB
- [ ] Infra/Deploy
- [ ] Tests

### Validación
- [ ] Pruebas locales exitosas
- [ ] Smoke tests exitosos
- [ ] Métricas no degradadas
- [ ] Evidencia adjunta (capturas/logs)

### Riesgos
- Riesgo principal:
- Plan de mitigación:
- Plan rollback:

---

## 8) Registro semanal de avance

### Semana 1
- Logros:
- Bloqueos:
- Decisiones:
- Próximos pasos:

### Semana 2
- Logros:
- Bloqueos:
- Decisiones:
- Próximos pasos:

(Agregar semanas según avance)