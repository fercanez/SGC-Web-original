import type { ReactNode } from "react";
import "../styles/institutional-shell.css";

const logoUrl = `${import.meta.env.BASE_URL}logomxli.png`;

export default function InstitutionalShell({
  welcome,
  children,
}: {
  welcome?: string;
  children: ReactNode;
}) {
  return (
    <div className="inst-shell">
      <header className="inst-topbar">
        <div className="inst-topbar-marca">
          <img
            src={logoUrl}
            alt="Gobierno de Mexicali"
            className="inst-topbar-logo"
            width={64}
            height={64}
          />
          <div className="inst-topbar-texto">
            <div className="inst-topbar-linea">
              Dirección de Administración Urbana
            </div>
            <div className="inst-topbar-linea inst-topbar-linea-principal">
              Jefatura de Catastro
            </div>
            <div className="inst-topbar-linea inst-topbar-linea-municipio">
              Mexicali, Baja California
            </div>
          </div>
        </div>
        {welcome && <p className="inst-topbar-bienvenida">{welcome}</p>}
      </header>
      <main className="inst-main">{children}</main>
    </div>
  );
}
