import { formatMoney } from "../utils/geometry";
import {
  fiscalChipClass,
  fiscalClaveClass,
  fiscalLabel,
  fiscalRowClass,
  fiscalStatusFromAdeudos,
} from "../utils/fiscal";
import type { PredioAlfanumericoRecord } from "../api";

export type ResultsPanelMode = "open" | "minimized" | "hidden";

interface Props {
  items: PredioAlfanumericoRecord[];
  activeClave: string | null;
  currency: string;
  onSelect: (r: PredioAlfanumericoRecord) => void;
  filter: string;
  onFilterChange: (v: string) => void;
  compact?: boolean;
  onCompactChange?: (v: boolean) => void;
  panelMode: ResultsPanelMode;
  onPanelModeChange: (m: ResultsPanelMode) => void;
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
}

function cartoStatus(r: PredioAlfanumericoRecord) {
  return r.parcel_id ? "DIBUJADO" : "SIN CARTOGRAFÍA";
}

export default function ResultadosCatastrales({
  items,
  activeClave,
  currency,
  onSelect,
  filter,
  onFilterChange,
  compact = false,
  onCompactChange,
  panelMode,
  onPanelModeChange,
  total,
  page,
  totalPages,
  onPageChange,
  loading = false,
}: Props) {
  const q = filter.trim().toUpperCase();
  const rows = q
    ? items.filter(
        (r) =>
          r.clave_catastral.toUpperCase().includes(q) ||
          (r.nombre_completo ?? "").toUpperCase().includes(q) ||
          (r.colonia ?? "").toUpperCase().includes(q) ||
          (r.calle ?? "").toUpperCase().includes(q)
      )
    : items;

  if (panelMode === "hidden") {
    return (
      <button
        type="button"
        className="cm-results-restore"
        onClick={() => onPanelModeChange("open")}
        title="Mostrar resultados"
      >
        Resultados ({total.toLocaleString("es-MX")})
      </button>
    );
  }

  return (
    <div
      className={`cm-float cm-float-results ${compact ? "is-compact" : ""} ${
        panelMode === "minimized" ? "is-minimized" : ""
      }`}
    >
      <div className="cm-results-header">
        <h3>Resultados catastrales</h3>
        <div className="cm-results-actions">
          {onCompactChange && panelMode === "open" && (
            <label className="cm-compact-toggle">
              <input
                type="checkbox"
                checked={compact}
                onChange={(e) => onCompactChange(e.target.checked)}
              />
              Compacto
            </label>
          )}
          <button
            type="button"
            className="cm-btn-excel"
            disabled
            title="Próximamente"
          >
            Excel
          </button>
          <span className="cm-results-count">
            {loading
              ? "Buscando…"
              : `${rows.length} en página · ${total.toLocaleString("es-MX")} total`}
          </span>
          <button
            type="button"
            className="cm-panel-ctrl"
            onClick={() =>
              onPanelModeChange(panelMode === "minimized" ? "open" : "minimized")
            }
            title={panelMode === "minimized" ? "Expandir" : "Minimizar"}
          >
            {panelMode === "minimized" ? "▲" : "▼"}
          </button>
          <button
            type="button"
            className="cm-panel-ctrl"
            onClick={() => onPanelModeChange("hidden")}
            title="Ocultar panel"
          >
            ×
          </button>
        </div>
      </div>

      {panelMode === "open" && (
        <>
          <input
            type="search"
            className="cm-results-filter"
            placeholder="Filtro en esta página…"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
          />
          <div className="cm-results-scroll">
            <table className="cm-results-table">
              <thead>
                <tr>
                  <th>Clave</th>
                  <th>Nombre</th>
                  <th>Colonia</th>
                  <th>Calle</th>
                  <th>No.</th>
                  <th>Zona</th>
                  <th>Valor</th>
                  <th>Uso</th>
                  <th>Fiscal</th>
                  <th>Carto.</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !loading && (
                  <tr>
                    <td colSpan={10} className="cm-empty-row">
                      Sin registros en esta página
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const fiscal = fiscalStatusFromAdeudos(
                    r.adeudo_2026,
                    r.adeudo_total
                  );
                  const rowCls = [
                    fiscalRowClass(fiscal),
                    activeClave === r.clave_catastral ? "selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                  <tr
                    key={r.id}
                    className={rowCls || undefined}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(r);
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(r);
                    }}
                  >
                    <td>
                      <code className={fiscalClaveClass(fiscal)}>
                        {r.clave_catastral}
                      </code>
                    </td>
                    <td>{r.nombre_completo ?? "—"}</td>
                    <td>{r.colonia ?? "—"}</td>
                    <td>{r.calle ?? "—"}</td>
                    <td>{r.numof ?? "—"}</td>
                    <td>{r.zonah ?? "—"}</td>
                    <td>{formatMoney(r.valor2026, currency)}</td>
                    <td>{r.descripcion_uso ?? "—"}</td>
                    <td>
                      <span className={fiscalChipClass(fiscal)}>
                        {fiscalLabel(fiscal)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={
                          r.parcel_id ? "cm-carto-ok" : "cm-carto-warn"
                        }
                      >
                        {cartoStatus(r)}
                      </span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="cm-results-pager">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => onPageChange(page - 1)}
              >
                Anterior
              </button>
              <span>
                Página {page} de {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => onPageChange(page + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
