import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BaseMapId } from "./CadastralSidebar";
import type { ConstruccionCartograficaItem, PredioAlfanumericoRecord } from "../api";
import { formatMoney } from "../utils/geometry";
import { segmentosClaveCatastral } from "../utils/predioMeasurements";
import type { CuadroConstruccionResult } from "../utils/cuadroConstruccion";
import { buildCuadroConstruccionUtm } from "../utils/cuadroConstruccion";
import { fetchConstruccionesWfsMaduro } from "../utils/construccionesWfs";
import type { PublicConfig } from "../types/config";
import {
  anguloGradosADms,
  buildCartografiaPrintOpacity,
  buildCartografiaPrintVisibility,
  computeCartografiaMapHeightIn,
} from "../utils/fichaCartografiaMapHelpers";
import type { MeasureMode } from "../utils/mapSnap";
import type { GeonodeLayer } from "../types/config";
import FichaMapLayersPanel, {
  buildFichaConstruccionLayerOrder,
  layerTitle,
  type FichaPlanoLayerId,
  type FichaPlanoLayerRow,
} from "./FichaMapLayersPanel";
import FichaCartografiaPrintMap, {
  type FichaPrintMapHandle,
} from "./FichaCartografiaPrintMap";
import { capColoniasOpacityWithPredios, layerRole } from "../config/mapLayers";
import "../styles/ficha-print-preview.css";
import "../styles/ficha-catastral.css";

interface Props {
  open: boolean;
  padron: PredioAlfanumericoRecord;
  geometry: GeoJSON.Geometry | null;
  geometryClave?: string | null;
  cuadro: CuadroConstruccionResult | null;
  construcciones: ConstruccionCartograficaItem[];
  geonodeLayers: GeonodeLayer[];
  wmsPath: string;
  currency: string;
  construccionesConfig?: PublicConfig["construcciones"];
  measurePoints: GeoJSON.Position[];
  measureMode: MeasureMode;
  measureHidden: boolean;
  onClose: () => void;
}

function val(value: string | number | null | undefined, fallback = "—") {
  if (value == null || value === "") return fallback;
  return String(value);
}

function fmtNum(value: number | null | undefined, digits = 2, suffix = "") {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}${suffix}`;
}

export default function FichaCartografiaPrintPreview({
  open,
  padron,
  geometry,
  geometryClave,
  cuadro,
  construcciones,
  geonodeLayers,
  wmsPath,
  currency,
  construccionesConfig,
  measurePoints,
  measureMode,
  measureHidden,
  onClose,
}: Props) {
  const mapRef = useRef<FichaPrintMapHandle>(null);
  const [layersPanelOpen, setLayersPanelOpen] = useState(false);
  const [baseMap, setBaseMap] = useState<BaseMapId>("googleHybrid");
  const [showCuadro, setShowCuadro] = useState(true);
  const [highlightVisible, setHighlightVisible] = useState(true);
  const [vectorVisible, setVectorVisible] = useState(true);
  const [freeMeasureVisible, setFreeMeasureVisible] = useState(true);
  const [printMapSnapshot, setPrintMapSnapshot] = useState<string | null>(null);
  const [resolvedConstr, setResolvedConstr] = useState<ConstruccionCartograficaItem[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [printMapHeightIn, setPrintMapHeightIn] = useState<number | null>(null);

  const initialVisible = useMemo(
    () => buildCartografiaPrintVisibility(geonodeLayers),
    [geonodeLayers]
  );
  const initialOpacity = useMemo(
    () => buildCartografiaPrintOpacity(geonodeLayers, initialVisible),
    [geonodeLayers, initialVisible]
  );

  const [visibleLayers, setVisibleLayers] = useState(initialVisible);
  const [layerOpacity, setLayerOpacity] = useState(initialOpacity);
  const [layerOrder, setLayerOrder] = useState<FichaPlanoLayerId[]>(() =>
    buildFichaConstruccionLayerOrder(geonodeLayers)
  );

  const geometryReady = useMemo(() => {
    if (!geometry) return null;
    if (geometryClave && geometryClave !== padron.clave_catastral) return null;
    return geometry;
  }, [geometry, geometryClave, padron.clave_catastral]);

  const cuadroData = useMemo((): CuadroConstruccionResult | null => {
    if (cuadro?.vertices?.length) return cuadro;
    if (geometryReady) {
      const built = buildCuadroConstruccionUtm(geometryReady);
      if (built.vertices.length) return built;
    }
    return cuadro;
  }, [cuadro, geometryReady]);

  const constrData = useMemo(() => {
    if (construcciones.length > 0) return construcciones;
    return resolvedConstr;
  }, [construcciones, resolvedConstr]);

  useEffect(() => {
    if (!open) return;
    setVisibleLayers(initialVisible);
    setLayerOpacity(initialOpacity);
    setLayerOrder(buildFichaConstruccionLayerOrder(geonodeLayers));
    setShowCuadro(true);
    setHighlightVisible(true);
    setVectorVisible(true);
    setFreeMeasureVisible(true);
    setLayersPanelOpen(false);
    setPrintMapSnapshot(null);
    setPrintMapHeightIn(null);
  }, [open, padron.clave_catastral, initialVisible, initialOpacity, geonodeLayers]);

  useEffect(() => {
    if (!open) {
      setResolvedConstr([]);
      setDataLoading(false);
      return;
    }

    if (construcciones.length > 0) {
      setResolvedConstr(construcciones);
      setDataLoading(false);
      return;
    }

    let cancelled = false;
    setDataLoading(true);
    void fetchConstruccionesWfsMaduro(
      padron.clave_catastral,
      construccionesConfig,
      geonodeLayers
    )
      .then((items) => {
        if (!cancelled) {
          setResolvedConstr(items);
          setDataLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedConstr([]);
          setDataLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    open,
    construcciones,
    padron.clave_catastral,
    construccionesConfig,
    geonodeLayers,
  ]);

  const mapHeightIn = useMemo(() => {
    if (printMapHeightIn != null) return printMapHeightIn;
    return computeCartografiaMapHeightIn(
      cuadroData?.vertices?.length ?? 0,
      constrData.length,
      Boolean(printMapSnapshot)
    );
  }, [
    printMapHeightIn,
    cuadroData?.vertices?.length,
    constrData.length,
    printMapSnapshot,
  ]);

  const seg = segmentosClaveCatastral(padron.clave_catastral);
  const fechaConsulta = new Date().toLocaleString("es-MX");
  const fechaPie = new Date().toLocaleDateString("es-MX");
  const supTxt =
    padron.sup_documental != null
      ? `${Number(padron.sup_documental).toFixed(2)} m²`
      : "—";
  const supConstTxt =
    padron.sup_const != null ? `${Number(padron.sup_const).toFixed(2)} m²` : "—";
  const tieneConst =
    constrData.length > 0 ||
    (padron.sup_const != null && Number(padron.sup_const) > 0)
      ? "Sí"
      : "No";

  const panelRows: FichaPlanoLayerRow[] = [
    {
      id: "highlight",
      title: "Predio consultado",
      role: "highlight",
      visible: highlightVisible,
      opacity: 1,
    },
    ...layerOrder
      .filter((id) => !["highlight", "construcciones-vector", "measure-free"].includes(id))
      .map((id) => {
        const gl = geonodeLayers.find((l) => l.id === id);
        return {
          id,
          title: layerTitle(id, geonodeLayers),
          role: gl ? layerRole(gl) : ("other" as const),
          visible: visibleLayers[id] ?? false,
          opacity: layerOpacity[id] ?? 1,
        };
      }),
    {
      id: "construcciones-vector",
      title: "Construcciones (vector)",
      role: "construcciones",
      visible: vectorVisible,
      opacity: 1,
    },
    {
      id: "cuadro",
      title: "Cotas y vértices (cuadro)",
      role: "other",
      visible: showCuadro,
      opacity: 1,
    },
    {
      id: "measure-free",
      title: "Medición libre",
      role: "other",
      visible: freeMeasureVisible,
      opacity: 1,
    },
  ];

  function toggleLayer(id: FichaPlanoLayerId, on: boolean) {
    if (id === "cuadro") {
      setShowCuadro(on);
      return;
    }
    if (id === "highlight") {
      setHighlightVisible(on);
      return;
    }
    if (id === "construcciones-vector") {
      setVectorVisible(on);
      return;
    }
    if (id === "measure-free") {
      setFreeMeasureVisible(on);
      return;
    }
    setVisibleLayers((prev) => {
      const next = { ...prev, [id]: on };
      setLayerOpacity((op) =>
        capColoniasOpacityWithPredios(next, op, geonodeLayers)
      );
      return next;
    });
  }

  function setOpacity(id: FichaPlanoLayerId, value: number) {
    if (id === "highlight" || id === "cuadro" || id === "construcciones-vector" || id === "measure-free") {
      if (value > 0) toggleLayer(id, true);
      return;
    }
    setLayerOpacity((prev) => {
      const next = { ...prev, [id]: value };
      return capColoniasOpacityWithPredios(visibleLayers, next, geonodeLayers);
    });
    if (value > 0) setVisibleLayers((prev) => ({ ...prev, [id]: true }));
  }

  function moveLayer(id: FichaPlanoLayerId, dir: -1 | 1) {
    if (id === "cuadro") return;
    setLayerOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  }

  async function handlePrint() {
    const printHeight = computeCartografiaMapHeightIn(
      cuadroData?.vertices?.length ?? 0,
      constrData.length,
      true
    );
    setPrintMapHeightIn(printHeight);
    document.documentElement.style.setProperty("--ficha-carto-map", `${printHeight}in`);

    mapRef.current?.resize();
    await mapRef.current?.waitForIdle();
    await new Promise((r) => window.setTimeout(r, 280));
    mapRef.current?.resize();
    await mapRef.current?.waitForIdle();

    const img = await mapRef.current?.captureImage();
    if (img) setPrintMapSnapshot(img);

    await new Promise((r) => window.setTimeout(r, 320));

    const pageStyle = document.createElement("style");
    pageStyle.id = "ficha-carto-legal-page";
    pageStyle.textContent =
      "@media print { @page { size: 8.5in 14in portrait; margin: 3mm; } }";
    document.head.appendChild(pageStyle);

    document.body.classList.add("ficha-printing-active", "papel-legal", "ficha-carto-print");
    const onAfter = () => {
      document.body.classList.remove(
        "ficha-printing-active",
        "papel-legal",
        "ficha-carto-print"
      );
      pageStyle.remove();
      setPrintMapSnapshot(null);
      setPrintMapHeightIn(null);
      document.documentElement.style.removeProperty("--ficha-carto-map");
      window.removeEventListener("afterprint", onAfter);
    };
    window.addEventListener("afterprint", onAfter);
    window.setTimeout(() => window.print(), 200);
  }

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("ficha-print-preview-open");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.classList.remove("ficha-print-preview-open");
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const refreshMap = () => {
      mapRef.current?.resize();
      mapRef.current?.center();
    };
    const t1 = window.setTimeout(refreshMap, 80);
    const t2 = window.setTimeout(refreshMap, 400);
    const t3 = window.setTimeout(refreshMap, 900);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [open, geometryReady, mapHeightIn]);

  if (!open) return null;

  const logoUrl = `${import.meta.env.BASE_URL}logomxli.png`;
  const stopBubble = (e: React.SyntheticEvent) => e.stopPropagation();

  return createPortal(
    <div
      className="ficha-print-overlay"
      role="dialog"
      aria-modal="true"
      onClick={stopBubble}
      onMouseDown={stopBubble}
    >
      <div className="ficha-print-toolbar no-print" onClick={stopBubble}>
        <span className="ficha-print-toolbar-info">
          Ficha cartográfica — {padron.clave_catastral}
        </span>
        <button type="button" onClick={() => mapRef.current?.zoomIn()}>
          Zoom +
        </button>
        <button type="button" onClick={() => mapRef.current?.zoomOut()}>
          Zoom −
        </button>
        <button type="button" onClick={() => mapRef.current?.center()}>
          Centrar
        </button>
        <button
          type="button"
          className={`ficha-print-btn-sec${layersPanelOpen ? " active" : ""}`}
          onClick={() => setLayersPanelOpen((v) => !v)}
        >
          Capas
        </button>
        <button type="button" className="ficha-print-btn-main" onClick={handlePrint}>
          Imprimir / PDF
        </button>
        <button type="button" className="ficha-print-btn-sec" onClick={onClose}>
          Cerrar
        </button>
      </div>

      <p className="ficha-print-hint no-print">
        Ajuste capas y zoom del mapa. Pulse «Imprimir / PDF» para guardar como PDF (Oficio
        8.5×14).
      </p>

      <div className="ficha-print-scroll">
        <article
          className="ficha-print-sheet ficha-carto-sheet papel-legal"
          style={
            {
              "--ficha-carto-map": `${mapHeightIn}in`,
            } as React.CSSProperties
          }
        >
          <header className="ficha-print-header">
            <img src={logoUrl} alt="Gobierno de Mexicali" className="ficha-print-logo" />
            <div className="ficha-print-header-text">
              <h2>FICHA CARTOGRAFÍA</h2>
              <p>Catastro Mexicali</p>
            </div>
            <div className="ficha-print-header-ids">
              <div>
                Clave catastral
                <b>{padron.clave_catastral}</b>
              </div>
            </div>
          </header>

          <section className="ficha-print-datos ficha-carto-datos">
            <p>
              <span className="ficha-print-label">Fecha y hora de consulta:</span>{" "}
              {fechaConsulta}
            </p>
            <p>
              <span className="ficha-print-label">Nombre registrado:</span>{" "}
              <strong className="ficha-print-nombre">{val(padron.nombre_completo)}</strong>
            </p>
            <div className="ficha-print-grid">
              <div>
                <span className="ficha-print-grid-label">Colonia</span>
                <span>{val(padron.colonia)}</span>
              </div>
              <div>
                <span className="ficha-print-grid-label">Calle</span>
                <span>{val(padron.calle)}</span>
              </div>
              <div>
                <span className="ficha-print-grid-label">Número oficial</span>
                <span>{val(padron.numof)}</span>
              </div>
              <div>
                <span className="ficha-print-grid-label">Superficie</span>
                <span>{supTxt}</span>
              </div>
              <div>
                <span className="ficha-print-grid-label">Manzana</span>
                <span>{seg.manzana}</span>
              </div>
              <div>
                <span className="ficha-print-grid-label">Lote</span>
                <span>{seg.lote}</span>
              </div>
              <div>
                <span className="ficha-print-grid-label">Zona homogénea</span>
                <span>{val(padron.zonah)}</span>
              </div>
              <div>
                <span className="ficha-print-grid-label">Valor / m²</span>
                <span>{formatMoney(padron.valor2026, currency)}</span>
              </div>
              <div className="ficha-print-grid-full">
                <span className="ficha-print-grid-label">Uso predial</span>
                <span>{val(padron.descripcion_uso)}</span>
              </div>
            </div>
          </section>

          <section className="ficha-print-media ficha-carto-map-section">
            <div className="ficha-print-media-head">
              <span>Medición cartográfica</span>
            </div>
            <div className="ficha-print-media-body ficha-print-map-wrap ficha-carto-map-wrap">
              {printMapSnapshot ? (
                <img
                  src={printMapSnapshot}
                  alt="Medición cartográfica"
                  className="ficha-print-map-snapshot"
                />
              ) : null}
              <FichaCartografiaPrintMap
                ref={mapRef}
                clave={padron.clave_catastral}
                geometry={geometry}
                geometryClave={geometryClave}
                geonodeLayers={geonodeLayers}
                wmsPath={wmsPath}
                baseMap={baseMap}
                visibleLayers={visibleLayers}
                layerOpacity={layerOpacity}
                layerOrder={layerOrder}
                highlightVisible={highlightVisible}
                showCuadro={showCuadro}
                construccionItems={constrData}
                measurePoints={measurePoints}
                measureMode={measureMode}
                measureHidden={measureHidden}
                vectorVisible={vectorVisible}
                freeMeasureVisible={freeMeasureVisible}
              />
              <FichaMapLayersPanel
                open={layersPanelOpen}
                onClose={() => setLayersPanelOpen(false)}
                rows={panelRows}
                baseMap={baseMap}
                onBaseMapChange={setBaseMap}
                onToggle={toggleLayer}
                onOpacity={setOpacity}
                onMove={moveLayer}
              />
            </div>
          </section>

          <section className="ficha-carto-medicion">
            <div className="ficha-carto-medicion-head">Datos de medición y construcciones</div>
            <div className="ficha-carto-resumen">
              <div>
                <span>Sup. documental</span>
                <b>{supTxt}</b>
              </div>
              <div>
                <span>Sup. construcción (padrón)</span>
                <b>{supConstTxt}</b>
              </div>
              <div>
                <span>Área UTM calculada</span>
                <b>{fmtNum(cuadroData?.area_m2, 2, " m²")}</b>
              </div>
              <div>
                <span>Perímetro UTM</span>
                <b>{fmtNum(cuadroData?.perimetro_m, 2, " m")}</b>
              </div>
              <div>
                <span>Construcción registrada</span>
                <b>{tieneConst}</b>
              </div>
            </div>

            <div className="ficha-carto-subhead">
              Cuadro de construcción — {padron.clave_catastral}
              {dataLoading && !cuadroData?.vertices?.length ? " (cargando…)" : ""}
            </div>
            <div className="ficha-carto-table-wrap">
              <table className="ficha-carto-table">
                <thead>
                  <tr>
                    <th>Vértice</th>
                    <th>Lado</th>
                    <th>Dist. (m)</th>
                    <th>Ángulo</th>
                    <th>Este</th>
                    <th>Norte</th>
                  </tr>
                </thead>
                <tbody>
                  {cuadroData?.vertices?.length ? (
                    cuadroData.vertices.map((v) => (
                      <tr key={v.vertice}>
                        <td>{v.vertice}</td>
                        <td>{v.lado}</td>
                        <td>{fmtNum(v.dist_m, 2)}</td>
                        <td>{anguloGradosADms(v.angulo_deg)}</td>
                        <td>{fmtNum(v.este, 3)}</td>
                        <td>{fmtNum(v.norte, 3)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>Sin geometría para cuadro de construcción.</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6}>
                      Área: {fmtNum(cuadroData?.area_m2, 2, " m²")} — Perímetro:{" "}
                      {fmtNum(cuadroData?.perimetro_m, 2, " m")} · EPSG:32611 (UTM 11N)
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className="ficha-carto-construcciones">
            <div className="ficha-carto-subhead ficha-carto-constr-head">
              Construcciones de la clave (capa cartográfica)
              {dataLoading && constrData.length === 0
                ? " — cargando…"
                : constrData.length > 0
                  ? ` — ${constrData.length} registros`
                  : ""}
            </div>
            <div className="ficha-carto-table-wrap">
              {constrData.length > 0 ? (
                <table className="ficha-carto-table">
                  <thead>
                    <tr>
                      <th>Clave const.</th>
                      <th>Niveles</th>
                      <th>Sup. hor. (m²)</th>
                      <th>Tipo</th>
                      <th>Perímetro (m)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {constrData.map((c, idx) => (
                      <tr key={`${c.clave_const ?? idx}-${idx}`}>
                        <td>{val(c.clave_const)}</td>
                        <td>{val(c.niveles)}</td>
                        <td>{fmtNum(c.sup_inc_m2, 3)}</td>
                        <td>{val(c.tipo)}</td>
                        <td>{fmtNum(c.perimetro_m, 4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="ficha-carto-vacio">
                  {dataLoading
                    ? "Consultando construcciones cartográficas…"
                    : "No se encontraron construcciones en la capa para esta clave."}
                </p>
              )}
            </div>
          </section>

          <footer className="ficha-print-footer">{fechaPie}</footer>
        </article>
      </div>
    </div>,
    document.body
  );
}
