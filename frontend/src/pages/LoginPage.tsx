import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getHomePath, getLoginPath } from "../config/appBase";
import "../styles/login.css";

const AUTH_ERROR_KEY = "sgc_auth_error";

const logoUrl = `${import.meta.env.BASE_URL}logomxli.png`;

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(AUTH_ERROR_KEY);
    if (stored) {
      setError(stored);
      sessionStorage.removeItem(AUTH_ERROR_KEY);
    }
  }, []);

  useEffect(() => {
    if (!loading && user) {
      window.location.replace(getHomePath());
    }
  }, [loading, user]);

  useEffect(() => {
    if (window.location.pathname === "/login") {
      window.location.replace(getLoginPath());
    }
  }, []);

  if (!loading && user) {
    return (
      <div className="login-overlay">
        <div className="login-portal">
          <p className="login-body-aviso" style={{ padding: "2rem" }}>
            Redirigiendo al portal…
          </p>
        </div>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-overlay">
      <div className="login-portal">
        <header className="login-topbar">
          <div className="login-topbar-marca">
            <img
              src={logoUrl}
              alt="Gobierno de Mexicali"
              className="login-topbar-logo"
              width={72}
              height={72}
            />
            <div className="login-topbar-texto">
              <div className="login-topbar-linea">
                Dirección de Administración Urbana
              </div>
              <div className="login-topbar-linea login-topbar-linea-principal">
                Jefatura de Catastro
              </div>
              <div className="login-topbar-linea login-topbar-linea-municipio">
                Mexicali, Baja California
              </div>
            </div>
          </div>
        </header>

        <div className="login-card">
          <section
            className="login-info-panel"
            aria-label="Información institucional"
          >
            <h1 className="login-info-titulo">Sistema de Gestión Catastral</h1>
            <p className="login-info-subtitulo">
              Portal Institucional de Consultas y Administración Catastral
              Multifinalitaria
            </p>
            <p className="login-info-descripcion">
              Plataforma web para la consulta, integración y administración de
              la información predial del Municipio de Mexicali. Acceso exclusivo
              para personal autorizado de la Jefatura de Catastro y dependencias
              vinculadas.
            </p>
            <ul className="login-info-lista">
              <li>
                <span className="login-info-icono" aria-hidden="true">
                  🗺️
                </span>
                Consulta cartográfica y catastral
              </li>
              <li>
                <span className="login-info-icono" aria-hidden="true">
                  📋
                </span>
                Expedientes y titularidad predial
              </li>
              <li>
                <span className="login-info-icono" aria-hidden="true">
                  🔒
                </span>
                Operaciones con registro de auditoría
              </li>
            </ul>
          </section>

          <section className="login-body" aria-label="Acceso al sistema">
            <form className="login-body-inner" onSubmit={onSubmit}>
              <h2>Ingresar</h2>
              <p className="login-body-aviso">
                Introduzca su nombre de cuenta y contraseña institucional.
              </p>

              <label htmlFor="loginUsuario">Usuario</label>
              <input
                id="loginUsuario"
                type="text"
                autoComplete="username"
                placeholder="Nombre de cuenta"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />

              <label htmlFor="loginPassword">Contraseña</label>
              <input
                id="loginPassword"
                type="password"
                autoComplete="current-password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              {error && (
                <div className="login-mensaje error" role="alert">
                  {error}
                </div>
              )}

              <button type="submit" disabled={submitting}>
                {submitting ? "Ingresando…" : "Ingresar sesión"}
              </button>

              <p className="login-body-legal">
                Acceso exclusivo para personal autorizado.
              </p>
            </form>
          </section>
        </div>

        <footer className="login-footer">
          <div className="login-footer-grid">
            <div className="login-footer-col">
              <strong>Dirección</strong>
              <span>
                Av. Independencia 998, Centro Cívico C.P. 21000, Mexicali,
                Baja California.
              </span>
            </div>
            <div className="login-footer-col">
              <strong>Contacto</strong>
              <a href="mailto:contacto@mexicali.gob.mx">
                contacto@mexicali.gob.mx
              </a>
              <span>(686) 558.1600</span>
            </div>
            <div className="login-footer-col">
              <strong>Horario</strong>
              <span>Lunes a Viernes 8:00 – 3:00 p.m.</span>
              <span>Sábados 10:00 – 3:00 p.m.</span>
            </div>
          </div>
          <div className="login-footer-auditoria">
            Todas las operaciones quedan registradas en auditoría institucional.
          </div>
        </footer>
      </div>
    </div>
  );
}
