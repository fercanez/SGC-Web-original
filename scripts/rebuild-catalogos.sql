-- Reconstruye catálogos (cat_*, predio_valuaciones, FK) desde predios_alfanumerico.
-- Equivalente a POST /api/v1/catalogs/rebuild pero en SQL masivo (minutos vs horas).
--
-- Requisitos:
--   - Migración 006 aplicada
--   - predios_alfanumerico ya cargado (p. ej. import CSV previo)
--
-- Uso (DBeaver o psql conectado a catastro_lab):
--   1. Cancele cualquier POST /catalogs/rebuild en curso (Ctrl+C en curl)
--   2. Ejecute este script completo
--   3. sudo docker restart sgc-web_api_1
--   4. GET /api/v1/catalogs/summary para verificar
--
-- ADVERTENCIA: borra catálogos y valuaciones existentes; no toca predios_alfanumerico.
-- IMPORTANTE: no usar TRUNCATE ... CASCADE en cat_* — CASCADE borra predios_alfanumerico
-- porque esa tabla tiene FK hacia cat_delegaciones, cat_colonias, etc.

BEGIN;

UPDATE predios_alfanumerico SET
  delegacion_id = NULL,
  colonia_id = NULL,
  calle_id = NULL,
  zona_homogenea_id = NULL,
  uso_suelo_id = NULL,
  tasa_id = NULL,
  regimen_propiedad_id = NULL,
  titular_id = NULL;

TRUNCATE predio_valuaciones;
TRUNCATE cat_calles;
TRUNCATE cat_colonias;
TRUNCATE cat_tasas;
TRUNCATE cat_usos_suelo;
TRUNCATE cat_zonas_homogeneas;
TRUNCATE cat_regimenes_propiedad;
TRUNCATE cat_titulares;
TRUNCATE cat_delegaciones;

CREATE OR REPLACE FUNCTION norm_text(t text) RETURNS text AS $$
  SELECT CASE
    WHEN t IS NULL OR btrim(t) = '' THEN NULL
    ELSE upper(regexp_replace(btrim(t), '\s+', ' ', 'g'))
  END;
$$ LANGUAGE sql IMMUTABLE;

-- Delegaciones
INSERT INTO cat_delegaciones (id, nombre)
SELECT gen_random_uuid(), norm_text(delegacion)
FROM predios_alfanumerico
WHERE norm_text(delegacion) IS NOT NULL
GROUP BY 2;

-- Colonias (con o sin delegación)
INSERT INTO cat_colonias (id, delegacion_id, nombre)
SELECT gen_random_uuid(), d.id, x.colonia_n
FROM (
  SELECT DISTINCT norm_text(delegacion) AS del_n, norm_text(colonia) AS colonia_n
  FROM predios_alfanumerico
  WHERE norm_text(colonia) IS NOT NULL
) x
LEFT JOIN cat_delegaciones d ON d.nombre = x.del_n;

-- Calles con colonia
INSERT INTO cat_calles (id, colonia_id, nombre)
SELECT gen_random_uuid(), c.id, x.calle_n
FROM (
  SELECT DISTINCT
    norm_text(delegacion) AS del_n,
    norm_text(colonia) AS col_n,
    norm_text(calle) AS calle_n
  FROM predios_alfanumerico
  WHERE norm_text(calle) IS NOT NULL
    AND norm_text(colonia) IS NOT NULL
) x
LEFT JOIN cat_delegaciones d ON d.nombre = x.del_n
LEFT JOIN cat_colonias c
  ON c.nombre = x.col_n
 AND ((c.delegacion_id IS NULL AND d.id IS NULL) OR c.delegacion_id = d.id);

-- Calles sin colonia en el padrón
INSERT INTO cat_calles (id, colonia_id, nombre)
SELECT gen_random_uuid(), NULL, x.calle_n
FROM (
  SELECT DISTINCT norm_text(calle) AS calle_n
  FROM predios_alfanumerico
  WHERE norm_text(calle) IS NOT NULL
    AND norm_text(colonia) IS NULL
) x;

INSERT INTO cat_zonas_homogeneas (id, codigo)
SELECT gen_random_uuid(), norm_text(zonah)
FROM predios_alfanumerico
WHERE norm_text(zonah) IS NOT NULL
GROUP BY 2;

INSERT INTO cat_usos_suelo (id, descripcion)
SELECT gen_random_uuid(), norm_text(descripcion_uso)
FROM predios_alfanumerico
WHERE norm_text(descripcion_uso) IS NOT NULL
GROUP BY 2;

INSERT INTO cat_regimenes_propiedad (id, codigo)
SELECT gen_random_uuid(), norm_text(condominio)
FROM predios_alfanumerico
WHERE norm_text(condominio) IS NOT NULL
GROUP BY 2;

INSERT INTO cat_titulares (id, nombre_completo)
SELECT gen_random_uuid(), norm_text(nombre_completo)
FROM predios_alfanumerico
WHERE norm_text(nombre_completo) IS NOT NULL
GROUP BY 2;

INSERT INTO cat_tasas (id, id_tasa_municipal, porcentaje, uso_suelo_id)
SELECT gen_random_uuid(), x.id_tasa::int, x.porcentaje_tasa, u.id
FROM (
  SELECT DISTINCT id_tasa, porcentaje_tasa, norm_text(descripcion_uso) AS uso_n
  FROM predios_alfanumerico
  WHERE id_tasa IS NOT NULL AND porcentaje_tasa IS NOT NULL
) x
LEFT JOIN cat_usos_suelo u ON u.descripcion = x.uso_n;

-- FK en predios_alfanumerico
UPDATE predios_alfanumerico p SET delegacion_id = d.id
FROM cat_delegaciones d
WHERE norm_text(p.delegacion) = d.nombre;

UPDATE predios_alfanumerico p SET colonia_id = c.id
FROM cat_colonias c
LEFT JOIN cat_delegaciones d ON d.id = c.delegacion_id
WHERE c.nombre = norm_text(p.colonia)
  AND (
    (norm_text(p.delegacion) IS NULL AND c.delegacion_id IS NULL)
    OR d.nombre = norm_text(p.delegacion)
  );

UPDATE predios_alfanumerico p SET calle_id = ca.id
FROM cat_calles ca
LEFT JOIN cat_colonias c ON c.id = ca.colonia_id
LEFT JOIN cat_delegaciones d ON d.id = c.delegacion_id
WHERE ca.nombre = norm_text(p.calle)
  AND norm_text(p.colonia) IS NOT NULL
  AND c.nombre = norm_text(p.colonia)
  AND (
    (norm_text(p.delegacion) IS NULL AND c.delegacion_id IS NULL)
    OR d.nombre = norm_text(p.delegacion)
  );

UPDATE predios_alfanumerico p SET calle_id = ca.id
FROM cat_calles ca
WHERE ca.nombre = norm_text(p.calle)
  AND ca.colonia_id IS NULL
  AND norm_text(p.colonia) IS NULL;

UPDATE predios_alfanumerico p SET zona_homogenea_id = z.id
FROM cat_zonas_homogeneas z
WHERE norm_text(p.zonah) = z.codigo;

UPDATE predios_alfanumerico p SET uso_suelo_id = u.id
FROM cat_usos_suelo u
WHERE norm_text(p.descripcion_uso) = u.descripcion;

UPDATE predios_alfanumerico p SET regimen_propiedad_id = r.id
FROM cat_regimenes_propiedad r
WHERE norm_text(p.condominio) = r.codigo;

UPDATE predios_alfanumerico p SET titular_id = t.id
FROM cat_titulares t
WHERE norm_text(p.nombre_completo) = t.nombre_completo;

UPDATE predios_alfanumerico p SET tasa_id = ta.id
FROM cat_tasas ta
LEFT JOIN cat_usos_suelo u ON u.id = ta.uso_suelo_id
WHERE p.id_tasa::int = ta.id_tasa_municipal
  AND p.porcentaje_tasa = ta.porcentaje
  AND u.descripcion IS NOT DISTINCT FROM norm_text(p.descripcion_uso);

-- Valuaciones ejercicio 2026 (PADRON_DEFAULT_EJERCICIO)
INSERT INTO predio_valuaciones (
  id, predio_alfanumerico_id, ejercicio,
  valor_catastral, adeudo_ejercicio, adeudo_total
)
SELECT
  gen_random_uuid(), id, 2026,
  valor2026, adeudo_2026, adeudo_total
FROM predios_alfanumerico
WHERE valor2026 IS NOT NULL
   OR adeudo_2026 IS NOT NULL
   OR adeudo_total IS NOT NULL;

COMMIT;

-- Verificación
SELECT 'predios_alfanumerico' AS tabla, COUNT(*) AS total FROM predios_alfanumerico
UNION ALL SELECT 'delegaciones', COUNT(*) FROM cat_delegaciones
UNION ALL SELECT 'colonias', COUNT(*) FROM cat_colonias
UNION ALL SELECT 'calles', COUNT(*) FROM cat_calles
UNION ALL SELECT 'zonas_homogeneas', COUNT(*) FROM cat_zonas_homogeneas
UNION ALL SELECT 'usos_suelo', COUNT(*) FROM cat_usos_suelo
UNION ALL SELECT 'tasas', COUNT(*) FROM cat_tasas
UNION ALL SELECT 'regimenes', COUNT(*) FROM cat_regimenes_propiedad
UNION ALL SELECT 'titulares', COUNT(*) FROM cat_titulares
UNION ALL SELECT 'valuaciones', COUNT(*) FROM predio_valuaciones;
