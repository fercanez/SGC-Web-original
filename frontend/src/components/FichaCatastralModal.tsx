import { useEffect, useMemo, useState } from "react";
import {
  getPredialAdeudo,
  getPredioFolioReal,
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
import FichaPrintPreview from "./FichaPrintPreview";
import FichaConstruccionTab from "./FichaConstruccionTab";
import type { GeonodeLayer, PublicConfig } from "../types/config";
import type { PredialAdeudoResponse } from "../types/predial";
import { mergeConstruccionLayer } from "../utils/mapSnap";
import { useFichaWorkspaceResize } from "../hooks/useFichaWorkspaceResize";
import PredialAdeudoBadge from "./predial/PredialAdeudoBadge";
import PredialAdeudoModal from "./predial/PredialAdeudoModal";
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
  geometryClave?: string | null;
  geometryLoading?: boolean;
  geometrySource?: string | null;
  geometryWfsLayer?: string | null;
  dibujadoEnMapa: boolean;
  currency: string;
  geonodeLayers?: GeonodeLayer[];
  wmsPath?: string;
  construccionesConfig?: PublicConfig["construcciones"];
  searchResults?: PredioAlfanumericoRecord[];
  searchHighlights?: GeoJSON.FeatureCollection | null;
  onNavigate?: (record: PredioAlfanumericoRecord) => void;
  onPredioPick?: (clave: string) => void;
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

function fiscalFromPredialAdeudo(
  predialAdeudo: PredialAdeudoResponse | null,
  fallback: FiscalStatus
): FiscalStatus {
  if (!predialAdeudo) return fallback;
  if (
    predialAdeudo.estatus_consulta === "con_adeudo" ||
    Number(predialAdeudo.total_a_pagar ?? 0) > 0
  ) {
    return "con_adeudo";
  }
  return "sin_adeudo";
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
  geometryClave,
  geometryLoading,
  dibujadoEnMapa,
  currency,
  propietarios,
  propietariosLoading,
  propietariosError,
  propietariosTotal,
  folioReal,
  folioRealLoading,
  geonodeLayers,
  wmsPath,
  onOpenPrint,
  onPredioSelect,
  predialAdeudo,
  predialAdeudoLoading,
  onOpenAdeudo,
  fiscal,
  searchHighlights,
}: {
  padron: PredioAlfanumericoRecord;
  geometry: GeoJSON.Geometry | null;
  geometryClave?: string | null;
  geometryLoading?: boolean;
  dibujadoEnMapa: boolean;
  currency: string;
  propietarios: PredioPropietarioItem[];
  propietariosLoading: boolean;
  propietariosError: string | null;
  propietariosTotal: number;
  folioReal: string | null;
  folioRealLoading: boolean;
  geonodeLayers: GeonodeLayer[];
  wmsPath: string;
  onOpenPrint: () => void;
  onPredioSelect?: (clave: string) => void;
  predialAdeudo: PredialAdeudoResponse | null;
  predialAdeudoLoading: boolean;
  onOpenAdeudo: () => void;
  fiscal: FiscalStatus;
  searchHighlights?: GeoJSON.FeatureCollection | null;
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
    [
      "Folio real",
      folioRealLoading ? "Cargando…" : val(folioReal),
    ],
  ];

  const copropiedadValida =
    propietarios.length > 0 &&
    Math.abs(propietariosTotal - 100) < 0.02;

  const [layersPanelOpen, setLayersPanelOpen] = useState(false);

  return (
    <div className="ficha-datos-layout">
      <section className="ficha-datos-col ficha-datos-form">
        <div style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Estado predial</h3>
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <PredialAdeudoBadge
              data={predialAdeudo}
              loading={predialAdeudoLoading}
            />
            <button
              type="button"
              className="ficha-btn-secondary"
              onClick={onOpenAdeudo}
              disabled={!predialAdeudo}
            >
              Ver adeudos
            </button>
          </div>
        </div>

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

      <div className="ficha-datos-media">
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
              <button
                type="button"
                className="ficha-btn-secondary"
                onClick={onOpenPrint}
                disabled={geometryLoading}
              >
                Imprimir / PDF
              </button>
              <button
                type="button"
                className={`ficha-btn-secondary ficha-btn-capas${layersPanelOpen ? " active" : ""}`}
                onClick={() => setLayersPanelOpen((v) => !v)}
              >
                Capas
              </button>
            </div>
          </div>
          {geometryLoading ? (
            <div className="ficha-media-placeholder">Cargando mapa…</div>
          ) : (
            <FichaMiniMap
              clave={padron.clave_catastral}
              geometry={geometry}
              fiscalStatus={fiscal}
              searchHighlights={searchHighlights}
              geometryClave={geometryClave}
              geonodeLayers={geonodeLayers}
              wmsPath={wmsPath}
              layersPanelOpen={layersPanelOpen}
              onCloseLayersPanel={() => setLayersPanelOpen(false)}
              onPredioSelect={onPredioSelect}
            />
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
    </div>
  );
}

export default function FichaCatastralModal({
  open,
  padron,
  geometry,
  geometryClave = null,
  geometryLoading = false,
  geometrySource = null,
  geometryWfsLayer = null,
  dibujadoEnMapa,
  currency,
  geonodeLayers = [],
  wmsPath = "/api/v1/geonode/wms",
  construccionesConfig,
  searchResults = [],
  searchHighlights = null,
  onNavigate,
  onPredioPick,
  onClose,
}: Props) {
  const fichaGeonodeLayers = useMemo(
    () => mergeConstruccionLayer(geonodeLayers, construccionesConfig),
    [geonodeLayers, construccionesConfig]
  );

  const { workspaceRef, size, mapResizeNonce, startResize } =
    useFichaWorkspaceResize(open);

  const [tab, setTab] = useState<FichaCatastralTab>("datos");
  const [propietarios, setPropietarios] = useState<PredioPropietarioItem[]>([]);
  const [propietariosTotal, setPropietariosTotal] = useState(0);
  const [propietariosLoading, setPropietariosLoading] = useState(false);
  const [propietariosError, setPropietariosError] = useState<string | null>(null);
  const [folioReal, setFolioReal] = useState<string | null>(null);
  const [folioRealLoading, setFolioRealLoading] = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [predialAdeudo, setPredialAdeudo] = useState<PredialAdeudoResponse | null>(null);
  const [predialAdeudoLoading, setPredialAdeudoLoading] = useState(false);
  const [predialAdeudoModalOpen, setPredialAdeudoModalOpen] = useState(false);

  const fiscalFallback = fiscalStatusFromAdeudos(
    padron.adeudo_2026,
    padron.adeudo_total
  );
  const fiscal = fiscalFromPredialAdeudo(predialAdeudo, fiscalFallback);

  const navIndex = searchResults.findIndex(
    (r) => r.clave_catastral === padron.clave_catastral
  );
  const canPrev = navIndex > 0;
  const canNext = navIndex >= 0 && navIndex < searchResults.length - 1;

  useEffect(() => {
    if (!open) return;
    setTab("datos");
    setPredialAdeudoModalOpen(false);
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
    if (!open || tab !== "datos") return;
    setFolioRealLoading(true);
    setFolioReal(null);
    getPredioFolioReal(padron.clave_catastral)
      .then((res) => setFolioReal(res.folio_real))
      .catch(() => setFolioReal(null))
      .finally(() => setFolioRealLoading(false));
  }, [open, tab, padron.clave_catastral]);

  useEffect(() => {
    if (!open || tab !== "datos") return;
    setPredialAdeudoLoading(true);
    setPredialAdeudo(null);
    getPredialAdeudo(padron.clave_catastral)
      .then((res) => setPredialAdeudo(res))
      .catch(() =>
        setPredialAdeudo({
          clave_catastral: padron.clave_catastral,
          tiene_adeudo: false,
          estatus_consulta: "error",
          periodo: null,
          subtotal_importes: 0,
          sobretasa_seguridad_publica: 0,
          fomento_deportivo: 0,
          rezago_fomento_deportivo: 0,
          servicio_alumbrado: 0,
          recargos: 0,
          multas: 0,
          gastos_ejecucion: 0,
          descuentos: 0,
          donativo_cruz_roja: 0,
          donativo_bomberos: 0,
          total_a_pagar: 0,
          consultado_en: "",
          fuente: "portal_mexicali",
          error: "No se pudo consultar adeudo predial",
        })
      )
      .finally(() => setPredialAdeudoLoading(false));
  }, [open, tab, padron.clave_catastral]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (predialAdeudoModalOpen) {
        e.stopPropagation();
        setPredialAdeudoModalOpen(false);
        return;
      }
      if (printPreviewOpen) {
        e.stopPropagation();
        setPrintPreviewOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, printPreviewOpen, predialAdeudoModalOpen]);

  if (!open) return null;

  const direccion = [
    padron.calle,
    padron.numof,
    padron.colonia ? `— ${padron.colonia}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div
        className="ficha-overlay"
        role="presentation"
        onClick={() => {
          if (!printPreviewOpen && !predialAdeudoModalOpen) onClose();
        }}
      >
        <div
          ref={workspaceRef}
          className={`ficha-workspace ${fiscalBadgeClass(fiscal)}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ficha-titulo"
          style={{ width: size.width, height: size.height }}
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

          <div
            className={`ficha-body${
              tab === "construccion" ? " ficha-body-construccion" : ""
            }`}
          >
            {tab === "datos" && (
              <FichaDatosTab
                padron={padron}
                geometry={geometry}
                geometryClave={geometryClave}
                geometryLoading={geometryLoading}
                dibujadoEnMapa={dibujadoEnMapa}
                currency={currency}
                propietarios={propietarios}
                propietariosLoading={propietariosLoading}
                propietariosError={propietariosError}
                propietariosTotal={propietariosTotal}
                folioReal={folioReal}
                folioRealLoading={folioRealLoading}
                geonodeLayers={fichaGeonodeLayers}
                wmsPath={wmsPath}
                onOpenPrint={() => setPrintPreviewOpen(true)}
                onPredioSelect={onPredioPick}
                predialAdeudo={predialAdeudo}
                predialAdeudoLoading={predialAdeudoLoading}
                onOpenAdeudo={() => setPredialAdeudoModalOpen(true)}
                fiscal={fiscal}
                searchHighlights={searchHighlights}
              />
            )}
            {tab === "construccion" && (
              <FichaConstruccionTab
                padron={padron}
                geometry={geometry}
                geometryClave={geometryClave}
                geometryLoading={geometryLoading}
                geometrySource={geometrySource}
                geometryWfsLayer={geometryWfsLayer}
                geonodeLayers={fichaGeonodeLayers}
                wmsPath={wmsPath}
                construccionesConfig={construccionesConfig}
                currency={currency}
                mapResizeNonce={mapResizeNonce}
              />
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

          <div
            className="ficha-resize ficha-resize-e"
            title="Ajustar ancho"
            aria-label="Ajustar ancho de la ficha"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              startResize("e", e.clientX, e.clientY);
            }}
          />
          <div
            className="ficha-resize ficha-resize-s"
            title="Ajustar alto"
            aria-label="Ajustar alto de la ficha"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              startResize("s", e.clientX, e.clientY);
            }}
          />
          <div
            className="ficha-resize ficha-resize-se"
            title="Redimensionar ficha"
            aria-label="Redimensionar ficha"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              startResize("se", e.clientX, e.clientY);
            }}
          />
        </div>
      </div>

      <FichaPrintPreview
        open={printPreviewOpen}
        padron={padron}
        geometry={geometry}
        geometryClave={geometryClave}
        folioReal={folioReal}
        currency={currency}
        geonodeLayers={fichaGeonodeLayers}
        wmsPath={wmsPath}
        onClose={() => setPrintPreviewOpen(false)}
      />

      <PredialAdeudoModal
        open={predialAdeudoModalOpen}
        onClose={() => setPredialAdeudoModalOpen(false)}
        data={predialAdeudo}
      />
    </>
  );
}
