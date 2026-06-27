#!/usr/bin/env python3
"""
Diagnóstico de login SGC-Web contra seguridad.usuarios.
Ejecutar en el servidor:
  cd /opt/sgc-web/backend && source venv/bin/activate
  python3 ../scripts/diagnose-auth.py admin TU_PASSWORD
  python3 ../scripts/diagnose-auth.py canez TU_PASSWORD
"""
from __future__ import annotations

import sys
from pathlib import Path

# backend/ en PYTHONPATH
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.auth.security import verify_password
from app.config import settings
from app.database import SessionLocal


def mask_url(url: str) -> str:
    if "@" not in url:
        return url
    prefix, rest = url.split("@", 1)
    if "://" in prefix and ":" in prefix.split("://", 1)[1]:
        scheme, creds = prefix.split("://", 1)
        user = creds.split(":", 1)[0]
        return f"{scheme}://{user}:****@{rest}"
    return url


def main() -> int:
    if len(sys.argv) < 3:
        print("Uso: python3 scripts/diagnose-auth.py USUARIO CONTRASEÑA")
        return 1

    usuario_input = sys.argv[1].strip()
    password = sys.argv[2]

    print("=== SGC-Web diagnóstico de auth ===")
    print("DATABASE_URL:", mask_url(settings.database_url))
    print("Usuario a probar:", usuario_input)
    print()

    db = SessionLocal()
    try:
        try:
            rows = db.execute(
                text("""
                    SELECT id, usuario, rol, activo,
                           length(password_hash) AS hash_len,
                           left(password_hash, 7) AS hash_prefix
                    FROM seguridad.usuarios
                    WHERE lower(trim(usuario)) = lower(trim(:u))
                    ORDER BY id
                """),
                {"u": usuario_input},
            ).mappings().all()
        except SQLAlchemyError as exc:
            print("FALLO SELECT en seguridad.usuarios:")
            print(" ", exc)
            print()
            print("Solución (como postgres):")
            print("  GRANT USAGE ON SCHEMA seguridad TO <usuario_de_DATABASE_URL>;")
            print("  GRANT SELECT ON seguridad.usuarios TO <usuario_de_DATABASE_URL>;")
            return 2

        if not rows:
            print("No se encontró el usuario en esta base de datos.")
            print("Listado de usuarios existentes (máx. 15):")
            try:
                all_users = db.execute(
                    text("""
                        SELECT id, usuario, rol, activo
                        FROM seguridad.usuarios
                        ORDER BY id
                        LIMIT 15
                    """)
                ).mappings().all()
                for r in all_users:
                    print(f"  - id={r['id']} usuario={r['usuario']!r} rol={r['rol']} activo={r['activo']}")
            except SQLAlchemyError as exc:
                print("  (no se pudo listar):", exc)
            print()
            print("Si admin/canez aparecen en otra BD, corrija DATABASE_URL en /opt/sgc-web/.env")
            return 3

        for row in rows:
            print(f"Encontrado: id={row['id']} usuario={row['usuario']!r} rol={row['rol']} activo={row['activo']}")
            print(f"  hash: prefix={row['hash_prefix']!r} len={row['hash_len']}")

        row = db.execute(
            text("""
                SELECT id, usuario, nombre_completo, password_hash, rol, activo
                FROM seguridad.usuarios
                WHERE lower(trim(usuario)) = lower(trim(:u))
                LIMIT 1
            """),
            {"u": usuario_input},
        ).mappings().first()

        assert row is not None
        stored_hash = row["password_hash"]

        ok = verify_password(password, stored_hash)
        print()
        print("verify_password:", "OK ✓" if ok else "FALLO ✗")

        if not ok:
            print()
            print("La contraseña NO coincide con el hash en ESTA base de datos.")
            print("Compruebe:")
            print("  1) Que mira el hash en la misma BD que DATABASE_URL")
            print("  2) Que no hay espacios extra al copiar la contraseña")
            print("  3) Si entra en SGC maduro (catastro-api) pero no aquí, compare el hash:")
            print("     sudo -u postgres psql -d NOMBRE_BD -c \\")
            print("       \"SELECT usuario, left(password_hash,20) FROM seguridad.usuarios WHERE usuario='admin';\"")
            return 4

        if not row["activo"]:
            print("Usuario INACTIVO (activo=false) → la API responderá 403")
            return 5

        print("Login debería funcionar. Si el navegador falla:")
        print("  sudo journalctl -u sgc-web-api -n 30 --no-pager")
        print("  curl -s -w '\\nHTTP:%{http_code}\\n' -X POST http://127.0.0.1:9100/api/v1/auth/login \\")
        print(f"    -H 'Content-Type: application/json' -d '{{\"username\":\"{row['usuario']}\",\"password\":\"***\"}}'")
        return 0

    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
