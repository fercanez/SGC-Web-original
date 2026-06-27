-- Permisos mínimos para que SGC-Web pueda autenticar contra seguridad.usuarios.
-- Ejecutar como superusuario PostgreSQL (sudo -u postgres psql -d NOMBRE_BD -f ...).
--
-- 1) Identifique el usuario de SGC-Web:
--    grep DATABASE_URL /opt/sgc-web/.env
--    Ejemplo: postgresql+psycopg://sgc_web:clave@127.0.0.1:5432/geonode_data
--    Usuario = sgc_web

-- Sustituya sgc_web por el usuario real de DATABASE_URL:
GRANT USAGE ON SCHEMA seguridad TO sgc_web;
GRANT SELECT ON seguridad.usuarios TO sgc_web;
