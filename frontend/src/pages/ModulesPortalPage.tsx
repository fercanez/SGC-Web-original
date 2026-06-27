import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import InstitutionalShell from "../components/InstitutionalShell";
import ModuleIcon from "../components/ModuleIcon";
import { modulesForUser, type ModuleDefinition } from "../config/modules";
import "../styles/modules-portal.css";

export default function ModulesPortalPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const visible = modulesForUser(user);
  const welcome = user
    ? `${user.full_name} · Rol: ${(user.role?.code ?? user.role?.name ?? "—").toUpperCase()}`
    : undefined;

  function openModule(mod: ModuleDefinition) {
    if (mod.status === "coming-soon") {
      navigate(`/modulos/${mod.id}`);
      return;
    }
    navigate(mod.route);
  }

  return (
    <InstitutionalShell welcome={welcome}>
      <div className="modules-portal-card">
        <h2>Seleccione el módulo al que desea ingresar:</h2>
        <p className="modules-portal-aviso">
          Solo se muestran los módulos autorizados para su rol institucional.
        </p>

        {visible.length === 0 ? (
          <p className="modules-portal-vacio">
            No tiene módulos asignados. Contacte al administrador del sistema.
          </p>
        ) : (
          <ul className="modules-portal-lista">
            {visible.map((mod) => (
              <li key={mod.id}>
                <button
                  type="button"
                  className="modules-portal-item"
                  onClick={() => openModule(mod)}
                >
                  <span className="modules-portal-item-icono">
                    <ModuleIcon id={mod.icon} size={20} />
                  </span>
                  <span className="modules-portal-item-cuerpo">
                    <span className="modules-portal-item-texto">
                      <strong>{mod.title}</strong>
                      <span>{mod.description}</span>
                    </span>
                    {mod.status === "coming-soon" && (
                      <span className="modules-portal-item-badge">
                        Próximamente
                      </span>
                    )}
                    <span className="modules-portal-item-flecha" aria-hidden>
                      ›
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="modules-portal-footer">
          <button
            type="button"
            className="modules-portal-btn-salir"
            onClick={logout}
          >
            Salir del sistema
          </button>
        </div>
      </div>
    </InstitutionalShell>
  );
}
