import { Link, useParams } from "react-router-dom";
import InstitutionalShell from "../components/InstitutionalShell";
import ModuleIcon from "../components/ModuleIcon";
import { getModuleById } from "../config/modules";
import "../styles/modules-portal.css";

export default function ModulePlaceholderPage() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const mod = moduleId ? getModuleById(moduleId) : undefined;

  if (!mod) {
    return (
      <InstitutionalShell>
        <div className="module-placeholder-card">
          <h2>Módulo no encontrado</h2>
          <p>El identificador solicitado no corresponde a un módulo del sistema.</p>
          <div className="module-placeholder-actions">
            <Link to="/" className="module-placeholder-btn module-placeholder-btn-primary">
              Volver a módulos
            </Link>
          </div>
        </div>
      </InstitutionalShell>
    );
  }

  return (
    <InstitutionalShell>
      <div className="module-placeholder-card">
        <div className="module-placeholder-icon">
          <ModuleIcon id={mod.icon} size={24} />
        </div>
        <h2>{mod.title}</h2>
        <p>
          Este módulo está en proceso de emparejamiento con el SGC institucional.
          Por ahora puede usar <strong>Gestión Catastral</strong> para consulta
          predial y mapa.
        </p>
        <div className="module-placeholder-actions">
          <Link
            to="/gestion-catastral"
            className="module-placeholder-btn module-placeholder-btn-primary"
          >
            Ir a Gestión Catastral
          </Link>
          <Link
            to="/"
            className="module-placeholder-btn module-placeholder-btn-secondary"
          >
            ← Volver a módulos
          </Link>
        </div>
      </div>
    </InstitutionalShell>
  );
}
