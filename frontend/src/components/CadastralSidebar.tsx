import { type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  fiscalClaveClass,
  fiscalRowClass,
  fiscalStatusFromAdeudos,
} from "../utils/fiscal";
import type {
  FiscalStatus,
  GeonodeStatus,
  PredioAlfanumericoRecord,
  SearchCombinar,
  SourceStatus,
} from "../api";
import type { PublicConfig } from "../types/config";

export type SidebarSection =
  | "consulta"
  | "capas"
  | "herramientas"
  | "movimientos"
  | "admin";

export type BaseMapId = "hybrid" | "osm";

export interface SearchFields {
  clave: string;
  apellido: string;
  calle: string;
  numof: string;
  colonia: string;
}

interface Props {
  section: SidebarSection;
  onSectionChange: (s: SidebarSection) => void;
  showAdmin: boolean;
  search: SearchFields;
  onSearchChange: (f: SearchFields) => void;
  onSearchSubmit: (e?: FormEvent) => void;
  searching: boolean;
  searchResults: PredioAlfanumericoRecord[];
  searchTotal: number;
  searchPage: number;
  searchTotalPages: number;
  combinar: SearchCombinar;
  onCombinarChange: (v: SearchCombinar) => void;
  padron: PredioAlfanumericoRecord | null;
  onSelectRecord: (r: PredioAlfanumericoRecord) => void;
  config: PublicConfig | null;
  geonodeLayers: PublicConfig["geonode"]["layers"];
  visibleLayers: Record<string, boolean>;
  onVisibleLayersChange: (next: Record<string, boolean>) => void;
  layerOpacity: Record<string, number>;
  onLayerOpacityChange: (id: string, value: number) => void;
  layerOrder: string[];
  onLayerOrderChange: (order: string[]) => void;
  baseMap: BaseMapId;
  onBaseMapChange: (id: BaseMapId) => void;
  showCartoPanel: boolean;
  onShowCartoPanelChange: (v: boolean) => void;
  showFloatingLegend: boolean;
  onShowFloatingLegendChange: (v: boolean) => void;
  sourceStatus: SourceStatus | null;
  geonodeStatus: GeonodeStatus | null;
  syncing: boolean;
  onSync: () => void;
  syncingAdeudos?: boolean;
  onSyncAdeudos?: () => void;
  fiscalStatus?: FiscalStatus | null;
  canSync: boolean;
  geometrySource: string | null;
  adminUserCount?: number;
  adminActiveCount?: number;
}

function formatResultLine(r: PredioAlfanumericoRecord) {
  const ubic = [r.colonia, r.calle, r.numof ? `#${r.numof}` : ""]
    .filter(Boolean)
    .join(" · ");
  return ubic || r.delegacion || "Sin ubicación";
}

export default function CadastralSidebar({
  section,
  onSectionChange,
  showAdmin,
  search,
  onSearchChange,
  onSearchSubmit,
  searching,
  searchResults,
  searchTotal,
  searchPage,
  searchTotalPages,
  combinar,
  onCombinarChange,
  padron,
  onSelectRecord,
  config,
  geonodeLayers,
  visibleLayers,
  onVisibleLayersChange,
  layerOpacity,
  onLayerOpacityChange,
  layerOrder,
  onLayerOrderChange,
  baseMap,
  onBaseMapChange,
  showCartoPanel,
  onShowCartoPanelChange,
  showFloatingLegend,
  onShowFloatingLegendChange,
  sourceStatus,
  geonodeStatus,
  syncing,
  onSync,
  syncingAdeudos = false,
  onSyncAdeudos,
  fiscalStatus,
  canSync,
  geometrySource,
  adminUserCount,
  adminActiveCount,
}: Props) {
  const navItems: { id: SidebarSection; label: string }[] = [
    { id: "consulta", label: "Consulta" },
    { id: "capas", label: "Capas" },
    { id: "herramientas", label: "Herramientas" },
    { id: "movimientos", label: "Movimientos" },
  ];
  if (showAdmin) navItems.push({ id: "admin", label: "Admin" });

  const orderedLayers = layerOrder
    .map((id) => geonodeLayers.find((l) => l.id === id))
    .filter(Boolean) as PublicConfig["geonode"]["layers"];

  function moveLayer(id: string, dir: -1 | 1) {
    const idx = layerOrder.indexOf(id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= layerOrder.length) return;
    const copy = [...layerOrder];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    onLayerOrderChange(copy);
  }

  return (
    <aside className="cm-sidebar">
      <p className="cm-sidebar-title">Consulta y herramientas</p>
      <nav className="cm-sidebar-nav">
        {navItems.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={section === id ? "active" : ""}
            onClick={() => onSectionChange(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="cm-sidebar-body">
        {section === "consulta" && (
          <>
            <h3 className="cm-section-heading">Búsqueda catastral</h3>
            <p className="cm-muted small">
              Clave con comodines: <code>ST32____</code> (_ = un carácter, * = varios).
              Resultados en la tabla inferior (500 por página).
            </p>
            <fieldset className="cm-combinar-field">
              <legend>Combinar criterios</legend>
              <label>
                <input
                  type="radio"
                  name="combinar"
                  checked={combinar === "todos"}
                  onChange={() => onCombinarChange("todos")}
                />
                Todos (AND)
              </label>
              <label>
                <input
                  type="radio"
                  name="combinar"
                  checked={combinar === "cualquiera"}
                  onChange={() => onCombinarChange("cualquiera")}
                />
                Cualquiera (OR)
              </label>
            </fieldset>
            <form className="cm-search-form" onSubmit={onSearchSubmit}>
              <label>
                Clave / patrón
                <input
                  type="search"
                  placeholder="Ej. ST312031 o ST32____"
                  value={search.clave}
                  onChange={(e) =>
                    onSearchChange({
                      ...search,
                      clave: e.target.value.toUpperCase(),
                    })
                  }
                  autoComplete="off"
                />
              </label>
              <label>
                Apellido / titular
                <input
                  type="search"
                  value={search.apellido}
                  onChange={(e) =>
                    onSearchChange({ ...search, apellido: e.target.value })
                  }
                />
              </label>
              <label>
                Calle
                <input
                  type="search"
                  value={search.calle}
                  onChange={(e) =>
                    onSearchChange({ ...search, calle: e.target.value })
                  }
                />
              </label>
              <label>
                Número oficial
                <input
                  type="search"
                  value={search.numof}
                  onChange={(e) =>
                    onSearchChange({ ...search, numof: e.target.value })
                  }
                />
              </label>
              <label>
                Colonia
                <input
                  type="search"
                  value={search.colonia}
                  onChange={(e) =>
                    onSearchChange({ ...search, colonia: e.target.value })
                  }
                />
              </label>
              <button
                type="submit"
                className="cm-btn-primary block"
                disabled={searching}
              >
                {searching ? "Buscando…" : "Buscar"}
              </button>
            </form>

            {searchTotal > 0 && (
              <div className="cm-search-summary">
                <strong>
                  {searchTotal.toLocaleString("es-MX")} predio
                  {searchTotal === 1 ? "" : "s"} encontrado
                  {searchTotal === 1 ? "" : "s"}
                </strong>
                {searchTotalPages > 1 && (
                  <p className="cm-muted small">
                    Página {searchPage} de {searchTotalPages} — ver tabla inferior
                  </p>
                )}
                {searchResults.slice(0, 6).map((r) => {
                  const fiscal = fiscalStatusFromAdeudos(
                    r.adeudo_2026,
                    r.adeudo_total
                  );
                  const fiscalCls = fiscalRowClass(fiscal);
                  return (
                  <button
                    key={r.id}
                    type="button"
                    className={`cm-result-card ${fiscalCls} ${
                      padron?.id === r.id ? "active" : ""
                    }`}
                    onClick={() => onSelectRecord(r)}
                  >
                    <code className={fiscalClaveClass(fiscal)}>
                      {r.clave_catastral}
                    </code>
                    <span className="cm-result-name">
                      {r.nombre_completo ?? "Sin titular"}
                    </span>
                    <span className="cm-result-addr">{formatResultLine(r)}</span>
                  </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {section === "capas" && (
          <>
            <h3 className="cm-section-heading">Mapa base</h3>
            <label className="cm-field-block">
              <select
                value={baseMap}
                onChange={(e) =>
                  onBaseMapChange(e.target.value as BaseMapId)
                }
              >
                <option value="hybrid">Vista satélite (híbrido)</option>
                <option value="osm">OpenStreetMap</option>
              </select>
            </label>

            <h3 className="cm-section-heading">Capas WMS</h3>
            {orderedLayers.length === 0 ? (
              <p className="cm-muted">Sin capas GeoNode configuradas.</p>
            ) : (
              orderedLayers.map((gl) => (
                <div key={gl.id} className="cm-layer-block">
                  <label className="cm-layer-item">
                    <input
                      type="checkbox"
                      checked={visibleLayers[gl.id] ?? true}
                      onChange={(e) =>
                        onVisibleLayersChange({
                          ...visibleLayers,
                          [gl.id]: e.target.checked,
                        })
                      }
                    />
                    <span>{gl.title}</span>
                  </label>
                  <div className="cm-layer-opacity">
                    <span>Opacidad</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round((layerOpacity[gl.id] ?? 1) * 100)}
                      onChange={(e) =>
                        onLayerOpacityChange(
                          gl.id,
                          Number(e.target.value) / 100
                        )
                      }
                    />
                  </div>
                  <div className="cm-layer-order-btns">
                    <button
                      type="button"
                      onClick={() => moveLayer(gl.id, -1)}
                      title="Subir capa"
                    >
                      Subir
                    </button>
                    <button
                      type="button"
                      onClick={() => moveLayer(gl.id, 1)}
                      title="Bajar capa"
                    >
                      Bajar
                    </button>
                  </div>
                </div>
              ))
            )}

            <h3 className="cm-section-heading">Vista</h3>
            <label className="cm-check-row">
              <input
                type="checkbox"
                checked={showCartoPanel}
                onChange={(e) => onShowCartoPanelChange(e.target.checked)}
              />
              Panel control cartográfico
            </label>
            <label className="cm-check-row">
              <input
                type="checkbox"
                checked={showFloatingLegend}
                onChange={(e) => onShowFloatingLegendChange(e.target.checked)}
              />
              Leyenda dinámica flotante
            </label>

            <div className="cm-mini-legend">
              <span className="cm-legend-title">Fiscal (referencia)</span>
              <span>
                <i className="swatch sw-green" /> Sin adeudo
              </span>
              <span>
                <i className="swatch sw-red" /> Con adeudo
              </span>
            </div>
          </>
        )}

        {section === "herramientas" && (
          <>
            <h3 className="cm-section-heading">Impresión institucional</h3>
            <p className="cm-muted small">
              Ficha PDF con croquis, datos catastrales, estado fiscal y código QR.
            </p>
            <button type="button" className="cm-btn-secondary block" disabled>
              Generar ficha PDF (próximamente)
            </button>

            <h3 className="cm-section-heading">Medición</h3>
            <div className="cm-btn-row">
              <button type="button" className="cm-btn-secondary" disabled>
                Línea
              </button>
              <button type="button" className="cm-btn-secondary" disabled>
                Polígono
              </button>
            </div>
            <button type="button" className="cm-btn-secondary block" disabled>
              Borrar medición
            </button>

            <h3 className="cm-section-heading">Cotas y cuadro de construcción</h3>
            <button type="button" className="cm-btn-secondary block" disabled>
              Generar cotas y cuadro
            </button>
            <button type="button" className="cm-btn-secondary block" disabled>
              Exportar Excel
            </button>

            <h3 className="cm-section-heading">Sistema / GeoNode</h3>
            <p className="cm-muted small">
              {config?.source.enabled
                ? `Origen: ${config.source.title}`
                : "Origen no configurado"}
            </p>
            {sourceStatus && (
              <p className="cm-muted small">
                WFS: {sourceStatus.ok ? "OK" : sourceStatus.message}
              </p>
            )}
            {canSync && config?.source.enabled && (
              <>
                <button
                  type="button"
                  className="cm-btn-primary block"
                  disabled={syncing || syncingAdeudos || !sourceStatus?.ok}
                  onClick={onSync}
                >
                  {syncing ? "Sincronizando…" : "Sincronizar predios"}
                </button>
                {onSyncAdeudos && (
                  <>
                    {fiscalStatus && (
                      <p className="cm-muted small">
                        Adeudos WFS:{" "}
                        {fiscalStatus.ok
                          ? fiscalStatus.adeudo_layer ?? "OK"
                          : fiscalStatus.message}
                      </p>
                    )}
                    <button
                      type="button"
                      className="cm-btn-secondary block"
                      disabled={
                        syncing ||
                        syncingAdeudos ||
                        !(fiscalStatus?.ok ?? false)
                      }
                      onClick={onSyncAdeudos}
                    >
                      {syncingAdeudos
                        ? "Sincronizando adeudos…"
                        : "Sincronizar adeudos"}
                    </button>
                  </>
                )}
              </>
            )}
            <p className="cm-muted small">
              GeoNode:{" "}
              {geonodeStatus?.ok ? "conectado" : "verificar credenciales"}
            </p>
            {geometrySource && (
              <p className="cm-muted small">
                Geometría activa:{" "}
                {geometrySource === "geonode_wfs" ? "WFS en vivo" : "BD sync"}
              </p>
            )}
          </>
        )}

        {section === "movimientos" && (
          <>
            <h3 className="cm-section-heading">Movimientos catastrales</h3>
            <label className="cm-field-block">
              Tipo de movimiento
              <select defaultValue="cambio_nombre" disabled>
                <option value="cambio_nombre">CAMBIO DE NOMBRE</option>
                <option value="cambio_superficie">CAMBIO DE SUPERFICIE</option>
                <option value="subdivisión">SUBDIVISIÓN</option>
              </select>
            </label>
            <label className="cm-field-block">
              Clave catastral origen
              <input
                type="text"
                readOnly
                value={padron?.clave_catastral ?? ""}
                placeholder="Seleccione un predio en Consulta"
              />
            </label>
            <label className="cm-field-block">
              Clave nueva / destino
              <input type="text" disabled placeholder="Opcional" />
            </label>
            <div className="cm-field-row">
              <label className="cm-field-block">
                Campo
                <input type="text" disabled placeholder="NOMBRE / TITULAR" />
              </label>
              <label className="cm-field-block">
                Valor nuevo
                <input type="text" disabled />
              </label>
            </div>
            <button type="button" className="cm-btn-secondary block" disabled>
              + Agregar cambio
            </button>
            <label className="cm-field-block">
              Motivo
              <textarea rows={2} disabled />
            </label>
            <label className="cm-field-block">
              Observaciones
              <textarea rows={2} disabled />
            </label>
            <button type="button" className="cm-btn-primary block" disabled>
              Guardar movimiento
            </button>
            <p className="cm-muted small">
              Registro de movimientos en desarrollo. Los datos del padrón y mapa
              ya están disponibles en Consulta.
            </p>

            <h3 className="cm-section-heading">Historial de movimientos</h3>
            <input
              type="search"
              className="cm-history-search"
              placeholder="Buscar por clave…"
              defaultValue={padron?.clave_catastral ?? ""}
              readOnly
            />
            <p className="cm-muted small">Sin movimientos registrados aún.</p>
          </>
        )}

        {section === "admin" && showAdmin && (
          <>
            <h3 className="cm-section-heading">Administración institucional</h3>
            <div className="cm-admin-stats">
              <span>
                <strong>{adminUserCount ?? "—"}</strong> usuarios
              </span>
              <span>
                <strong>{adminActiveCount ?? "—"}</strong> activos
              </span>
            </div>
            <p className="cm-muted small">
              Creación de usuarios, roles y matriz de permisos.
            </p>
            <Link to="/admin/usuarios" className="cm-btn-primary block cm-link-btn">
              Abrir administración completa
            </Link>
          </>
        )}
      </div>
    </aside>
  );
}
