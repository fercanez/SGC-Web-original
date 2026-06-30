import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BaseMapId } from "./CadastralSidebar";
import type { PredioAlfanumericoRecord } from "../api";
import { centroidFromGeometry, formatMoney, isWgs84Geometry } from "../utils/geometry";
import { segmentosClaveCatastral } from "../utils/predioMeasurements";
import type { GeonodeLayer } from "../types/config";
import FichaMapLayersPanel, {
  buildFichaLayerOrder,
  layerTitle,
  type FichaPlanoLayerId,
  type FichaPlanoLayerRow,
} from "./FichaMapLayersPanel";
import FichaPrintMap, {
  buildPrintInitialOpacity,
  buildPrintInitialVisibility,
  type FichaPrintMapHandle,
} from "./FichaPrintMap";
import {
  capColoniasOpacityWithPredios,
  layerRole,
} from "../config/mapLayers";
import "../styles/ficha-print-preview.css";
import "../styles/ficha-catastral.css";

export type FichaPaperSize = "carta" | "legal";

const PAPER_LAYOUT: Record<
  FichaPaperSize,
  { label: string; alto: number; streetRatio: number }
> = {
  carta: { label: "Carta 8.5×11", alto: 11, streetRatio: 0.44 },
  legal: { label: "Legal / Oficio 8.5×14", alto: 14, streetRatio: 0.42 },
};

interface Props {
  open: boolean;
  padron: PredioAlfanumericoRecord;
  geometry: GeoJSON.Geometry | null;
  geometryClave?: string | null;
  folioReal: string | null;
  currency: string;
  geonodeLayers: GeonodeLayer[];
  wmsPath: string;
  onClose: () => void;
}

function val(value: string | number | null | undefined, fallback = "—") {
  if (value == null || value === "") return fallback;
  return String(value);
}

function streetViewUrl(
  lat: number,
  lon: number,
  heading: number,
  pitch: number
): string {
  const h = Math.round(heading) % 360;
  const p = Math.max(-90, Math.min(90, Math.round(pitch)));
  return (
    `https://maps.google.com/maps?q=&layer=c&cbll=${lat.toFixed(7)},${lon.toFixed(7)}` +
    `&cbp=12,${h},${p},0,0&output=svembed`
  );
}

export default function FichaPrintPreview({
  open,
  padron,
  geometry,
  geometryClave,
  folioReal,
  currency,
  geonodeLayers,
  wmsPath,
  onClose,
}: Props) {
  const mapRef = useRef<FichaPrintMapHandle>(null);
  const [paper, setPaper] = useState<FichaPaperSize>("carta");
  const [layersPanelOpen, setLayersPanelOpen] = useState(false);
  const [baseMap, setBaseMap] = useState<BaseMapId>("googleHybrid");
  const [showCotas, setShowCotas] = useState(true);
  const [showVertices, setShowVertices] = useState(true);
  const [streetHeading, setStreetHeading] = useState(0);
  const [streetPitch, setStreetPitch] = useState(0);
  const [printMapSnapshot, setPrintMapSnapshot] = useState<string | null>(null);

  const initialVisible = useMemo(
    () => buildPrintInitialVisibility(geonodeLayers),
    [geonodeLayers]
  );
  const initialOpacity = useMemo(
    () => buildPrintInitialOpacity(geonodeLayers, initialVisible),
    [geonodeLayers, initialVisible]
  );

  const [visibleLayers, setVisibleLayers] = useState(initialVisible);
  const [layerOpacity, setLayerOpacity] = useState(initialOpacity);
  const [layerOrder, setLayerOrder] = useState<FichaPlanoLayerId[]>(() =>
    buildFichaLayerOrder(geonodeLayers)
  );

  useEffect(() => {
    if (!open) return;
    setVisibleLayers(initialVisible);
    setLayerOpacity(initialOpacity);
    setLayerOrder(buildFichaLayerOrder(geonodeLayers));
    setShowCotas(true);
    setShowVertices(true);
    setStreetHeading(0);
    setStreetPitch(0);
    setPaper("carta");
    setLayersPanelOpen(false);
    setPrintMapSnapshot(null);
  }, [open, padron.clave_catastral, initialVisible, initialOpacity, geonodeLayers]);

  const effectiveGeometry = useMemo(() => {
    if (!geometry || !isWgs84Geometry(geometry)) return null;
    if (geometryClave && geometryClave !== padron.clave_catastral) return null;
    return geometry;
  }, [geometry, geometryClave, padron.clave_catastral]);

  const centro = useMemo(
    () => centroidFromGeometry(effectiveGeometry),
    [effectiveGeometry]
  );

  const streetSrc = centro
    ? streetViewUrl(centro[1], centro[0], streetHeading, streetPitch)
    : null;

  const seg = segmentosClaveCatastral(padron.clave_catastral);
  const fechaConsulta = new Date().toLocaleString("es-MX");
  const fechaPie = new Date().toLocaleDateString("es-MX");
  const supTxt =
    padron.sup_documental != null
      ? `${Number(padron.sup_documental).toFixed(2)} m²`
      : "—";

  const paperLayout = PAPER_LAYOUT[paper];
  const mediaUtilIn = Math.max(4.75, paperLayout.alto - 0.2 - 4.2);
  const streetIn = +(mediaUtilIn * paperLayout.streetRatio).toFixed(2);
  const mapIn = +(mediaUtilIn - streetIn).toFixed(2);

  const panelRows: FichaPlanoLayerRow[] = [
    {
      id: "highlight",
      title: "Predio consultado",
      role: "highlight",
      visible: true,
      opacity: 1,
    },
    ...layerOrder
      .filter((id) => id !== "highlight")
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
      id: "cotas",
      title: "Cotas (medidas)",
      role: "other",
      visible: showCotas,
      opacity: 1,
    },
    {
      id: "vertices",
      title: "Vértices P1…Pn",
      role: "other",
      visible: showVertices,
      opacity: 1,
    },
  ];

  function toggleLayer(id: FichaPlanoLayerId, on: boolean) {
    if (id === "cotas") {
      setShowCotas(on);
      return;
    }
    if (id === "vertices") {
      setShowVertices(on);
      return;
    }
    if (id === "highlight") return;
    setVisibleLayers((prev) => {
      const next = { ...prev, [id]: on };
      setLayerOpacity((op) =>
        capColoniasOpacityWithPredios(next, op, geonodeLayers)
      );
      return next;
    });
  }

  function setOpacity(id: FichaPlanoLayerId, value: number) {
    if (id === "highlight" || id === "cotas" || id === "vertices") return;
    setLayerOpacity((prev) => {
      const next = { ...prev, [id]: value };
      return capColoniasOpacityWithPredios(visibleLayers, next, geonodeLayers);
    });
    if (value > 0) {
      setVisibleLayers((prev) => ({ ...prev, [id]: true }));
    }
  }

  function moveLayer(id: FichaPlanoLayerId, dir: -1 | 1) {
    if (id === "cotas" || id === "vertices") return;
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
    mapRef.current?.resize();
    await mapRef.current?.waitForIdle();
    const img = await mapRef.current?.captureImage();
    if (img) setPrintMapSnapshot(img);

    document.body.classList.add("ficha-printing-active", `papel-${paper}`);
    const onAfter = () => {
      document.body.classList.remove(
        "ficha-printing-active",
        "papel-carta",
        "papel-legal"
      );
      setPrintMapSnapshot(null);
      window.removeEventListener("afterprint", onAfter);
    };
    window.addEventListener("afterprint", onAfter);
    window.setTimeout(() => window.print(), 150);
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
  }, [open, paper, effectiveGeometry]);

  if (!open) return null;

  const logoUrl = `${import.meta.env.BASE_URL}logomxli.png`;

  const stopBubble = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return createPortal(
    <div
      className="ficha-print-overlay"
      role="dialog"
      aria-modal="true"
      onClick={stopBubble}
      onMouseDown={stopBubble}
    >
      <div className="ficha-print-toolbar no-print" onClick={stopBubble}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            mapRef.current?.zoomIn();
          }}
        >
          Zoom +
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            mapRef.current?.zoomOut();
          }}
        >
          Zoom −
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            mapRef.current?.center();
          }}
        >
          Centrar
        </button>
        <label className="ficha-print-paper-select" onClick={stopBubble}>
          <select
            value={paper}
            onChange={(e) => setPaper(e.target.value as FichaPaperSize)}
          >
            <option value="carta">{PAPER_LAYOUT.carta.label}</option>
            <option value="legal">{PAPER_LAYOUT.legal.label}</option>
          </select>
        </label>
        <button
          type="button"
          className={`ficha-print-btn-sec${layersPanelOpen ? " active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            setLayersPanelOpen((v) => !v);
          }}
        >
          Capas
        </button>
        <button
          type="button"
          className="ficha-print-btn-main"
          onClick={(e) => {
            e.stopPropagation();
            handlePrint();
          }}
        >
          Imprimir / PDF
        </button>
        <button
          type="button"
          className="ficha-print-btn-sec"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          Cerrar
        </button>
      </div>

      <p className="ficha-print-hint no-print">
        Ajuste la vista de calle (↺ ↻) y el mapa. Cuando esté listo pulse «Imprimir /
        PDF».
      </p>

      <div className="ficha-print-scroll">
        <article
          className={`ficha-print-sheet papel-${paper}`}
          style={
            {
              "--ficha-media-street": `${streetIn}in`,
              "--ficha-media-map": `${mapIn}in`,
            } as React.CSSProperties
          }
        >
          <header className="ficha-print-header">
            <img src={logoUrl} alt="Gobierno de Mexicali" className="ficha-print-logo" />
            <div className="ficha-print-header-text">
              <h2>FICHA CATASTRAL GENERAL</h2>
              <p>Catastro Mexicali</p>
            </div>
            <div className="ficha-print-header-ids">
              <div>
                Clave catastral
                <b>{padron.clave_catastral}</b>
              </div>
              <div>
                Folio real
                <b>{val(folioReal)}</b>
              </div>
            </div>
          </header>

          <section className="ficha-print-datos">
            <p>
              <span className="ficha-print-label">Fecha y hora de consulta:</span>{" "}
              {fechaConsulta}
            </p>
            <p>
              <span className="ficha-print-label">Nombre registrado:</span>{" "}
              <strong className="ficha-print-nombre">
                {val(padron.nombre_completo)}
              </strong>
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

          <section className="ficha-print-media ficha-print-street">
            <div className="ficha-print-media-head">
              <span>Vista de calle</span>
              <div className="ficha-print-media-tools no-print">
                <button
                  type="button"
                  title="Girar izquierda"
                  onClick={() => setStreetHeading((h) => (h - 15 + 360) % 360)}
                >
                  ↺
                </button>
                <button
                  type="button"
                  title="Girar derecha"
                  onClick={() => setStreetHeading((h) => (h + 15) % 360)}
                >
                  ↻
                </button>
              </div>
            </div>
            <div className="ficha-print-media-body">
              {streetSrc ? (
                <iframe
                  key={streetSrc}
                  title="Vista de calle"
                  className="ficha-print-street-frame"
                  src={streetSrc}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : (
                <div className="ficha-print-map-empty">
                  Sin coordenadas para Street View.
                </div>
              )}
            </div>
          </section>

          <section className="ficha-print-media ficha-print-map-section">
            <div className="ficha-print-media-head">
              <span>Localización cartográfica</span>
            </div>
            <div className="ficha-print-media-body ficha-print-map-wrap">
              {printMapSnapshot ? (
                <img
                  src={printMapSnapshot}
                  alt="Localización cartográfica"
                  className="ficha-print-map-snapshot"
                />
              ) : null}
              <FichaPrintMap
                ref={mapRef}
                clave={padron.clave_catastral}
                geometry={geometry}
                geometryClave={geometryClave}
                geonodeLayers={geonodeLayers}
                wmsPath={wmsPath}
                baseMap={baseMap}
                showCotas={showCotas}
                showVertices={showVertices}
                visibleLayers={visibleLayers}
                layerOpacity={layerOpacity}
                layerOrder={layerOrder}
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

          <footer className="ficha-print-footer">{fechaPie}</footer>
        </article>
      </div>
    </div>,
    document.body
  );
}
