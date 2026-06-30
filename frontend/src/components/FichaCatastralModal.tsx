import { useEffect, useMemo, useState } from "react";
import {
  getPredioPropietarios,
  type PredioAlfanumericoRecord,
  type PredioPropietarioItem,
  type PredioPropietariosResponse,
} from "../api";
import { centroidFromGeometry, formatMoney } from "../utils/geometry";
import {
  fiscalStatusFromAdeudos,
  fiscalLabel,
  type FiscalStatus,
} from "../utils/fiscal";
import FichaMiniMap from "./FichaMiniMap";
import "../styles/ficha-catastral.css";

export type FichaCatastralTab =
  | "datos"
  | "construccion"
  | "archivo"
  | "control-urbano"
  | "rppc"
  | "num-oficial"
  | "carta-2040"
  | "colonia"
  | "zona-h";

const TABS: { id: FichaCatastralTab; label: string }[] = [
  { id: "datos", label: "Datos" },
  { id: "construccion", label: "Construcción" },
  { id: "archivo", label: "Archivo" },
  { id: "control-urbano", label: "Ctrl. Urbano" },
  { id: "rppc", label: "RPPC" },
  { id: "num-oficial", label: "Núm. Oficial" },
  { id: "carta-2040", label: "Carta 2040" },
  { id: "colonia", label: "Colonia" },
  { id: "zona-h", label: "Zona H." },
];

interface Props {
  open: boolean;
  padron: PredioAlfanumericoRecord;
  geometry: GeoJSON.Geometry | null;
  geometryLoading?: boolean;
  dibujadoEnMapa: boolean;
  currency: string;
  searchResults?: PredioAlfanumericoRecord[];
  onNavigate?: (record: PredioAlfanumericoRecord) => void;
  onClose: () => void;
}

function val(value: string | number | null | undefined, fallback = "—") {
  if (value == null || value === "") return fallback;
  return String(value);
}

function tipoPersonaLabel(nombre: string | null | undefined): string {
  if (!nombre?.trim()) return "—";
  const up = nombre.toUpperCase();
  if (up.includes("S.A.") || up.includes("S DE R.L") || up.includes("SC")) {
    return "Persona moral";
  }
  return "Persona física";
}

function fiscalBadgeClass(status: FiscalStatus): string {
  if (status === "con_adeudo") return "ficha-badge-debt";
  if (status === "sin_dato") return "ficha-badge-unknown";
  return "ficha-badge-ok";
}

function TabPlaceholder({ title }: { title: string }) {
  return (
    <div className="ficha-tab-placeholder">
      <h3>{title}</h3>
      <p>
        Esta sección se integrará en la siguiente fase, con paridad al SGC
        institucional.
      </p>
    </div>
  );
}

function FichaDatosTab({
  padron,
  geometry,
  geometryLoading,
  dibujadoEnMapa,
  currency,
  propietarios,
  propietariosLoading,
  propietariosError,
  propietariosTotal,
}: {
  padron: PredioAlfanumericoRecord;
  geometry: GeoJSON.Geometry | null;
  geometryLoading?: boolean;
  dibujadoEnMapa: boolean;
  currency: string;
  propietarios: PredioPropietarioItem[];
  propietariosLoading: boolean;
  propietariosError: string | null;
  propietariosTotal: number;
}) {
  const centro = useMemo(() => centroidFromGeometry(geometry), [geometry]);
  const streetViewSrc = centro
    ? `https://maps.google.com/maps?q=&layer=c&cbll=${centro[1]},${centro[0]}&cbp=0,0,0,0,0&output=svembed`
    : null;

  const rows: [string, string][] = [
    ["Clave catastral", val(padron.clave_catastral)],
    ["Nombre contribuyente", val(padron.nombre_completo)],
    ["Tipo persona", tipoPersonaLabel(padron.nombre_completo)],
    ["Delegación", val(padron.delegacion)],
    ["Colonia / fraccionamiento", val(padron.colonia)],
    ["Calle", val(padron.calle)],
    ["Número oficial", val(padron.numof)],
    [
      "Superficie documental",
      padron.sup_documental != null ? `${padron.sup_documental} m²` : "—",
    ],
    ["Valor 2026", formatMoney(padron.valor2026, currency)],
    ["Adeudo total", formatMoney(padron.adeudo_total, currency)],
    ["Uso de suelo predial", val(padron.descripcion_uso)],
    ["Zona homogénea", val(padron.zonah)],
    ["Folio real", "—"],
  ];

  const copropiedadValida =
    propietarios.length > 0 &&
    Math.abs(propietariosTotal - 100) < 0.02;

  return (
    <div className="ficha-datos-grid">
      <section className="ficha-datos-col ficha-datos-form">
        <table className="ficha-datos-table">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th>{label}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ficha-titularidad">
          <h3>Titulares vigentes del predio</h3>
          {propietariosLoading && (
            <p className="ficha-muted">Cargando titularidad…</p>
          )}
          {propietariosError && (
            <p className="ficha-error">{propietariosError}</p>
          )}
          {!propietariosLoading && !propietariosError && propietarios.length === 0 && (
            <table className="ficha-titularidad-table">
              <thead>
                <tr>
                  <th>Titular</th>
                  <th>Tipo</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{val(padron.nombre_completo)}</td>
                  <td>PROPIETARIO</td>
                  <td>100.00</td>
                </tr>
              </tbody>
            </table>
          )}
          {!propietariosLoading && propietarios.length > 0 && (
            <table className="ficha-titularidad-table">
              <thead>
                <tr>
                  <th>Titular</th>
                  <th>Tipo</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {propietarios.map((p) => (
                  <tr key={p.id_predio_propietario}>
                    <td>{p.nombre_completo}</td>
                    <td>{p.tipo_titularidad}</td>
                    <td>{p.porcentaje_propiedad.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div
            className={`ficha-copropiedad-total ${
              copropiedadValida ? "ok" : propietarios.length ? "warn" : ""
            }`}
          >
            TOTAL COPROPIEDAD:{" "}
            {propietarios.length
              ? `${propietariosTotal.toFixed(2)}%`
              : "100.00%"}{" "}
            {copropiedadValida || !propietarios.length ? "✓" : "⚠"}
          </div>
        </div>
      </section>

      <section className="ficha-datos-col ficha-datos-street">
        <h3 className="ficha-panel-title">Vista de calle</h3>
        {geometryLoading && (
          <div className="ficha-media-placeholder">Cargando ubicación…</div>
        )}
        {!geometryLoading && streetViewSrc && (
          <iframe
            title="Vista de calle"
            className="ficha-street-iframe"
            src={streetViewSrc}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        )}
        {!geometryLoading && !streetViewSrc && (
          <div className="ficha-media-placeholder">
            Sin coordenadas para Street View.
          </div>
        )}
      </section>

      <section className="ficha-datos-col ficha-datos-map">
        <div className="ficha-map-toolbar">
          <h3 className="ficha-panel-title">Localización cartográfica</h3>
          <div className="ficha-map-actions">
            <button type="button" className="ficha-btn-secondary" disabled>
              Imprimir / PDF
            </button>
            <button
              type="button"
              className="ficha-btn-secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(padron.clave_catastral);
              }}
            >
              Copiar
            </button>
          </div>
        </div>
        {geometryLoading ? (
          <div className="ficha-media-placeholder">Cargando mapa…</div>
        ) : (
          <FichaMiniMap clave={padron.clave_catastral} geometry={geometry} />
        )}
        <p className="ficha-map-status">
          Cartografía:{" "}
          {geometryLoading
            ? "Consultando…"
            : dibujadoEnMapa
              ? "Dibujado en mapa"
              : "Sin cartografía directa"}
        </p>
      </section>
    </div>
  );
}

export default function FichaCatastralModal({
  open,
  padron,
  geometry,
  geometryLoading = false,
  dibujadoEnMapa,
  currency,
  searchResults = [],
  onNavigate,
  onClose,
}: Props) {
  const [tab, setTab] = useState<FichaCatastralTab>("datos");
  const [propietarios, setPropietarios] = useState<PredioPropietarioItem[]>([]);
  const [propietariosTotal, setPropietariosTotal] = useState(0);
  const [propietariosLoading, setPropietariosLoading] = useState(false);
  const [propietariosError, setPropietariosError] = useState<string | null>(null);

  const fiscal = fiscalStatusFromAdeudos(padron.adeudo_2026, padron.adeudo_total);

  const navIndex = searchResults.findIndex(
    (r) => r.clave_catastral === padron.clave_catastral
  );
  const canPrev = navIndex > 0;
  const canNext = navIndex >= 0 && navIndex < searchResults.length - 1;

  useEffect(() => {
    if (!open) return;
    setTab("datos");
  }, [open, padron.clave_catastral]);

  useEffect(() => {
    if (!open || tab !== "datos") return;
    setPropietariosLoading(true);
    setPropietariosError(null);
    getPredioPropietarios(padron.clave_catastral)
      .then((res: PredioPropietariosResponse) => {
        setPropietarios(res.items ?? []);
        setPropietariosTotal(res.total_participacion ?? 0);
      })
      .catch((err: unknown) => {
        setPropietarios([]);
        setPropietariosTotal(0);
        setPropietariosError(
          err instanceof Error ? err.message : "No se pudo cargar titularidad"
        );
      })
      .finally(() => setPropietariosLoading(false));
  }, [open, tab, padron.clave_catastral]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const direccion = [
    padron.calle,
    padron.numof,
    padron.colonia ? `— ${padron.colonia}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="ficha-overlay" role="presentation" onClick={onClose}>
      <div
        className={`ficha-workspace ${fiscalBadgeClass(fiscal)}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ficha-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ficha-header">
          <div className="ficha-header-main">
            <p className="ficha-header-kicker">Ficha catastral</p>
            <h2 id="ficha-titulo">{val(padron.nombre_completo)}</h2>
            <p className="ficha-header-direccion">{direccion || "Sin dirección"}</p>
            <p className="ficha-header-clave">{padron.clave_catastral}</p>
            <span className={`ficha-fiscal-chip ${fiscalBadgeClass(fiscal)}`}>
              {fiscalLabel(fiscal)}
            </span>
          </div>
          <div className="ficha-header-actions">
            {searchResults.length > 1 && onNavigate && (
              <div className="ficha-nav">
                <button
                  type="button"
                  disabled={!canPrev}
                  onClick={() => canPrev && onNavigate(searchResults[navIndex - 1])}
                  aria-label="Predio anterior"
                >
                  ‹
                </button>
                <span>
                  {navIndex + 1} / {searchResults.length}
                </span>
                <button
                  type="button"
                  disabled={!canNext}
                  onClick={() => canNext && onNavigate(searchResults[navIndex + 1])}
                  aria-label="Predio siguiente"
                >
                  ›
                </button>
              </div>
            )}
            <button
              type="button"
              className="ficha-btn-close"
              onClick={onClose}
              aria-label="Cerrar ficha"
            >
              ×
            </button>
          </div>
        </header>

        <nav className="ficha-tabs" aria-label="Secciones de la ficha">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="ficha-body">
          {tab === "datos" && (
            <FichaDatosTab
              padron={padron}
              geometry={geometry}
              geometryLoading={geometryLoading}
              dibujadoEnMapa={dibujadoEnMapa}
              currency={currency}
              propietarios={propietarios}
              propietariosLoading={propietariosLoading}
              propietariosError={propietariosError}
              propietariosTotal={propietariosTotal}
            />
          )}
          {tab === "construccion" && (
            <TabPlaceholder title="Construcción y medición" />
          )}
          {tab === "archivo" && <TabPlaceholder title="Archivo digital" />}
          {tab === "control-urbano" && (
            <TabPlaceholder title="Control urbano" />
          )}
          {tab === "rppc" && <TabPlaceholder title="Registro Público de la Propiedad" />}
          {tab === "num-oficial" && <TabPlaceholder title="Números oficiales" />}
          {tab === "carta-2040" && <TabPlaceholder title="Carta Urbana 2040" />}
          {tab === "colonia" && <TabPlaceholder title="Colonia / fraccionamiento" />}
          {tab === "zona-h" && <TabPlaceholder title="Zona homogénea" />}
        </div>
      </div>
    </div>
  );
}
