import { useEffect, useMemo, useState } from "react";
import {
  getPredioConstrucciones,
  type ConstruccionCartograficaItem,
  type PredioAlfanumericoRecord,
} from "../api";
import type { GeonodeLayer, PublicConfig } from "../types/config";
import {
  buildCuadroConstruccionUtm,
  measurePolygonUtmMetrics,
  type CuadroConstruccionResult,
  type CuadroVertex,
} from "../utils/cuadroConstruccion";
import {
  fetchConstruccionesWfsMaduro,
  sanitizeConstruccionesMessage,
} from "../utils/construccionesWfs";
import type { MeasureMode } from "../utils/mapSnap";
import FichaConstruccionMap from "./FichaConstruccionMap";
import FichaCartografiaPrintPreview from "./FichaCartografiaPrintPreview";

interface Props {
  padron: PredioAlfanumericoRecord;
  geometry: GeoJSON.Geometry | null;
  geometryClave?: string | null;
  geometryLoading?: boolean;
  geometrySource?: string | null;
  geometryWfsLayer?: string | null;
  geonodeLayers: GeonodeLayer[];
  wmsPath: string;
  construccionesConfig?: PublicConfig["construcciones"];
  currency: string;
  mapResizeNonce?: number;
}

function fmtNum(value: number | null | undefined, digits = 2, suffix = "") {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}${suffix}`;
}

function val(value: string | number | null | undefined, fallback = "—") {
  if (value == null || value === "") return fallback;
  return String(value);
}

export default function FichaConstruccionTab({
  padron,
  geometry,
  geometryClave,
  geometryLoading = false,
  geometrySource = null,
  geometryWfsLayer = null,
  geonodeLayers,
  wmsPath,
  construccionesConfig,
  currency,
  mapResizeNonce = 0,
}: Props) {
  const clave = padron.clave_catastral;
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [printSnapshot, setPrintSnapshot] = useState<{
    cuadro: CuadroConstruccionResult | null;
    construcciones: ConstruccionCartograficaItem[];
  } | null>(null);
  const [cuadro, setCuadro] = useState<CuadroConstruccionResult | null>(null);
  const [cuadroLoading, setCuadroLoading] = useState(false);
  const [cuadroError, setCuadroError] = useState<string | null>(null);
  const [construcciones, setConstrucciones] = useState<ConstruccionCartograficaItem[]>([]);
  const [constrLoading, setConstrLoading] = useState(false);
  const [constrError, setConstrError] = useState<string | null>(null);
  const [constrMessage, setConstrMessage] = useState<string | null>(null);

  const [measureEnabled, setMeasureEnabled] = useState(true);
  const [measureMode, setMeasureMode] = useState<MeasureMode>("off");
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [measureHidden, setMeasureHidden] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<GeoJSON.Position[]>([]);
  const [layersPanelOpen, setLayersPanelOpen] = useState(false);

  const geometryReady =
    geometry &&
    (!geometryClave || geometryClave === clave);

  const geometrySourceLabel = useMemo(() => {
    if (!geometryReady) return null;
    if (geometryWfsLayer) {
      return `WFS ${geometryWfsLayer}`;
    }
    if (geometrySource === "geonode_wfs" || geometrySource === "wfs_direct") {
      return "WFS GeoNode (capa predios)";
    }
    if (geometrySource === "database_sync" || geometrySource === "database_parcel") {
      return "PostgreSQL (sync previo)";
    }
    if (geometrySource === "search_batch" || geometrySource === "wfs_fallback") {
      return "Respaldo búsqueda / WFS";
    }
    return geometrySource ? String(geometrySource) : null;
  }, [geometryReady, geometrySource, geometryWfsLayer]);

  const measurePolygonStats = useMemo(() => {
    if (measureMode !== "polygon" || measurePoints.length < 3) return null;
    return measurePolygonUtmMetrics(measurePoints);
  }, [measureMode, measurePoints]);

  useEffect(() => {
    if (!geometryReady || !geometry) {
      setCuadro(null);
      setCuadroError(null);
      setCuadroLoading(false);
      return;
    }
    setCuadroLoading(true);
    setCuadroError(null);
    try {
      const data = buildCuadroConstruccionUtm(geometry);
      setCuadro(data);
      if (data.error) setCuadroError(data.error);
    } catch (err) {
      setCuadroError(
        err instanceof Error ? err.message : "Error al calcular cuadro UTM"
      );
      setCuadro(null);
    } finally {
      setCuadroLoading(false);
    }
  }, [geometry, geometryReady, clave]);

  useEffect(() => {
    let cancelled = false;

    async function loadConstrucciones() {
      setConstrLoading(true);
      setConstrError(null);
      setConstrMessage(null);

      let items: ConstruccionCartograficaItem[] = [];
      let message: string | null = null;

      try {
        items = await fetchConstruccionesWfsMaduro(
          clave,
          construccionesConfig,
          geonodeLayers
        );
      } catch {
        /* WFS directo opcional */
      }

      if (items.length === 0) {
        try {
          const data = await getPredioConstrucciones(clave);
          if (cancelled) return;
          items = data.items ?? [];
          message = sanitizeConstruccionesMessage(data.message ?? null);
        } catch (err) {
          if (!cancelled) {
            const raw =
              err instanceof Error ? err.message : "Error al consultar construcciones";
            setConstrError(sanitizeConstruccionesMessage(raw) ?? raw);
          }
          return;
        }
      }

      if (!cancelled) {
        setConstrucciones(items);
        setConstrMessage(
          items.length === 0
            ? message ?? "Sin construcciones en la capa WFS para esta clave."
            : null
        );
      }
    }

    void loadConstrucciones().finally(() => {
      if (!cancelled) setConstrLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [clave, construccionesConfig, geonodeLayers]);

  useEffect(() => {
    setMeasurePoints([]);
    setMeasureHidden(false);
  }, [clave]);

  const construccionRegistrada = useMemo(() => {
    if (construcciones.length > 0) return "SI";
    if (padron.sup_const != null && Number(padron.sup_const) > 0) return "SI";
    return "NO";
  }, [construcciones.length, padron.sup_const]);

  function openPrintPreview() {
    let snapshotCuadro = cuadro;
    if (!snapshotCuadro?.vertices?.length && geometryReady && geometry) {
      snapshotCuadro = buildCuadroConstruccionUtm(geometry);
    }
    setPrintSnapshot({
      cuadro: snapshotCuadro,
      construcciones: [...construcciones],
    });
    setPrintPreviewOpen(true);
  }

  function closePrintPreview() {
    setPrintPreviewOpen(false);
    setPrintSnapshot(null);
  }

  const supPadron = padron.sup_const != null ? Number(padron.sup_const) : null;

  return (
    <div className="ficha-construccion-layout">
      <section className="ficha-construccion-col ficha-construccion-tablas">
        <div className="ficha-construccion-resumen">
          <div className="ficha-construccion-metric">
            <span>Sup. documental</span>
            <strong>{fmtNum(padron.sup_documental != null ? Number(padron.sup_documental) : null, 2, " m²")}</strong>
          </div>
          <div className="ficha-construccion-metric">
            <span>Sup. construcción (padrón)</span>
            <strong>{fmtNum(supPadron, 2, " m²")}</strong>
          </div>
          <div className="ficha-construccion-metric">
            <span>Área UTM calculada</span>
            <strong>
              {cuadroLoading ? "…" : fmtNum(cuadro?.area_m2, 2, " m²")}
            </strong>
          </div>
          <div className="ficha-construccion-metric">
            <span>Perímetro UTM</span>
            <strong>
              {cuadroLoading ? "…" : fmtNum(cuadro?.perimetro_m, 2, " m")}
            </strong>
          </div>
          <div className="ficha-construccion-metric">
            <span>Construcción registrada</span>
            <strong>{construccionRegistrada}</strong>
          </div>
        </div>

        <h3 className="ficha-panel-title">
          Cuadro de construcción — {clave}
        </h3>
        {cuadroError && <p className="ficha-error">{cuadroError}</p>}
        {geometryLoading && (
          <p className="ficha-muted">Cargando geometría del predio…</p>
        )}
        {!geometryLoading && !geometryReady && (
          <p className="ficha-muted">Sin geometría para generar el cuadro UTM.</p>
        )}
        {geometryReady && !cuadroLoading && cuadro && cuadro.vertices.length === 0 && (
          <p className="ficha-muted">No se pudo generar el cuadro de vértices.</p>
        )}
        {cuadro && cuadro.vertices.length > 0 && (
          <div className="ficha-construccion-scroll">
            <table className="ficha-construccion-table">
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
                {cuadro.vertices.map((v: CuadroVertex) => (
                  <tr key={v.vertice}>
                    <td>{v.vertice}</td>
                    <td>{v.lado}</td>
                    <td>{fmtNum(v.dist_m, 2)}</td>
                    <td>{fmtNum(v.angulo_deg, 2)}</td>
                    <td>{fmtNum(v.este, 3)}</td>
                    <td>{fmtNum(v.norte, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="ficha-construccion-foot">
              EPSG:{cuadro.srid} (UTM) · Área {fmtNum(cuadro.area_m2, 2, " m²")} · Perímetro{" "}
              {fmtNum(cuadro.perimetro_m, 2, " m")}
              {geometrySourceLabel && (
                <>
                  <br />
                  Origen geometría: {geometrySourceLabel}
                </>
              )}
            </p>
          </div>
        )}

        <h3 className="ficha-panel-title ficha-construccion-subtitle">
          Construcciones de la clave (capa cartográfica)
          {!constrLoading && ` — ${construcciones.length} registro(s)`}
        </h3>
        {constrLoading && <p className="ficha-muted">Consultando capa WMS/WFS…</p>}
        {constrError && <p className="ficha-error">{constrError}</p>}
        {!constrLoading && !constrError && constrMessage && construcciones.length === 0 && (
          <p className="ficha-muted">{constrMessage}</p>
        )}
        {!constrLoading && construcciones.length > 0 && (
          <div className="ficha-construccion-scroll">
            <table className="ficha-construccion-table">
              <thead>
                <tr>
                  <th>Clave const.</th>
                  <th>Niveles</th>
                  <th>Sup. inc. (m²)</th>
                  <th>Tipo</th>
                  <th>Perímetro (m)</th>
                </tr>
              </thead>
              <tbody>
                {construcciones.map((c, idx) => (
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
          </div>
        )}
      </section>

      <section className="ficha-construccion-col ficha-construccion-map-col">
        <div className="ficha-map-toolbar">
          <h3 className="ficha-panel-title">Medición cartográfica</h3>
          <div className="ficha-map-actions">
            <label className="ficha-construccion-check">
              <input
                type="checkbox"
                checked={measureEnabled}
                onChange={(e) => {
                  const on = e.target.checked;
                  setMeasureEnabled(on);
                  if (on && measureMode === "off") setMeasureMode("line");
                }}
              />
              Medición
            </label>
            <button
              type="button"
              className={`ficha-btn-secondary ficha-btn-capas${layersPanelOpen ? " active" : ""}`}
              onClick={() => setLayersPanelOpen((v) => !v)}
            >
              Capas
            </button>
            <button
              type="button"
              className="ficha-btn-secondary"
              onClick={openPrintPreview}
            >
              Imprimir / PDF
            </button>
          </div>
        </div>

        {measureEnabled && (
          <div className="ficha-medicion-toolbar">
            <label className="ficha-construccion-check">
              <input
                type="checkbox"
                checked={snapEnabled}
                onChange={(e) => setSnapEnabled(e.target.checked)}
              />
              Snap a predios/vértices
            </label>
            <div className="ficha-medicion-modes">
              <button
                type="button"
                className={measureMode === "line" ? "active" : ""}
                onClick={() => setMeasureMode("line")}
              >
                Línea
              </button>
              <button
                type="button"
                className={measureMode === "polygon" ? "active" : ""}
                onClick={() => setMeasureMode("polygon")}
              >
                Polígono
              </button>
            </div>
            <div className="ficha-medicion-actions">
              <button
                type="button"
                disabled={measurePoints.length === 0}
                onClick={() => setMeasurePoints((pts) => pts.slice(0, -1))}
              >
                Deshacer punto
              </button>
              <button type="button" onClick={() => setMeasureHidden((v) => !v)}>
                {measureHidden ? "Mostrar medición" : "Ocultar medición"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMeasurePoints([]);
                  setMeasureHidden(false);
                }}
              >
                Quitar medición
              </button>
            </div>
            {measurePolygonStats && (
              <p className="ficha-medicion-polygon-stats">
                Área UTM: <strong>{measurePolygonStats.area_m2.toFixed(2)} m²</strong>
                {" · "}
                Perímetro: <strong>{measurePolygonStats.perimetro_m.toFixed(2)} m</strong>
              </p>
            )}
          </div>
        )}

        <div className="ficha-construccion-map-body">
          {geometryLoading ? (
            <div className="ficha-media-placeholder">Cargando mapa…</div>
          ) : (
            <FichaConstruccionMap
              clave={clave}
              geometry={geometry}
              geometryClave={geometryClave}
              geonodeLayers={geonodeLayers}
              wmsPath={wmsPath}
              construccionItems={construcciones}
              measureEnabled={measureEnabled}
              measureMode={measureEnabled ? measureMode : "off"}
              snapEnabled={snapEnabled}
              measureHidden={measureHidden}
              measurePoints={measurePoints}
              onMeasurePointsChange={setMeasurePoints}
              layersPanelOpen={layersPanelOpen}
              onCloseLayersPanel={() => setLayersPanelOpen(false)}
              mapResizeNonce={mapResizeNonce}
            />
          )}
        </div>
      </section>

      <FichaCartografiaPrintPreview
        open={printPreviewOpen}
        padron={padron}
        geometry={geometry}
        geometryClave={geometryClave}
        cuadro={printSnapshot?.cuadro ?? cuadro}
        construcciones={printSnapshot?.construcciones ?? construcciones}
        geonodeLayers={geonodeLayers}
        wmsPath={wmsPath}
        currency={currency}
        construccionesConfig={construccionesConfig}
        measurePoints={measurePoints}
        measureMode={measureEnabled ? measureMode : "off"}
        measureHidden={measureHidden}
        onClose={closePrintPreview}
      />
    </div>
  );
}
