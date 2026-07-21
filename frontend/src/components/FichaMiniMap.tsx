import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { BaseMapId } from "./CadastralSidebar";
import { buildGeonodeWmsTileUrl, getBaseMapRasterSource } from "../map/wms";
import {
  applyGeonodeRasterOpacity,
  scheduleGeonodeRasterOpacity,
} from "../map/wmsLayerState";
import {
  bboxFromGeometry,
  centroidFromGeometry,
  fitOptionsForGeometry,
  isWgs84Geometry,
} from "../utils/geometry";
import {
  FISCAL_MAP_FILL_RGB,
  FISCAL_MAP_LINE,
  SELECTED_MAP_FILL_OPACITY,
  SELECTED_MAP_HALO,
  SELECTED_MAP_HALO_WIDTH,
  SELECTED_MAP_LINE,
  SELECTED_MAP_LINE_WIDTH,
  type FiscalStatus,
} from "../utils/fiscal";
import {
  buildInitialOpacity,
  buildInitialVisibility,
  capColoniasOpacityWithPredios,
  layerRole,
  PREDIOS_WMS_NEAR_OPACITY,
  prediosLayerIds,
} from "../config/mapLayers";
import type { GeonodeLayer, PublicConfig } from "../types/config";
import {
  identifyPredioClaveAtPoint,
  mapShowsSelectablePredio,
} from "../utils/mapIdentify";
import FichaMapLayersPanel, {
  buildFichaLayerOrder,
  layerTitle,
  type FichaPlanoLayerId,
  type FichaPlanoLayerRow,
} from "./FichaMapLayersPanel";

interface Props {
  clave: string;
  geometry: GeoJSON.Geometry | null;
  fiscalStatus?: FiscalStatus;
  searchHighlights?: GeoJSON.FeatureCollection | null;
  /** Clave catastral a la que pertenece `geometry` (evita flashes al cambiar predio). */
  geometryClave?: string | null;
  geonodeLayers: GeonodeLayer[];
  wmsPath: string;
  layersPanelOpen: boolean;
  onCloseLayersPanel: () => void;
  onPredioSelect?: (clave: string) => void;
}

function hasLayer(map: maplibregl.Map, id: string): boolean {
  try {
    return Boolean(map.getLayer(id));
  } catch {
    return false;
  }
}

function hasSource(map: maplibregl.Map, id: string): boolean {
  try {
    return Boolean(map.getSource(id));
  } catch {
    return false;
  }
}

function mapLayerId(id: FichaPlanoLayerId): string {
  return id === "highlight" ? "highlight-line" : `geonode-${id}`;
}

function restackByOrder(map: maplibregl.Map, order: FichaPlanoLayerId[]) {
  const ids = order.map(mapLayerId).filter((id) => hasLayer(map, id));
  for (let i = ids.length - 1; i >= 0; i--) {
    try {
      map.moveLayer(ids[i]);
    } catch {
      /* */
    }
  }
}

function fitMapToGeometry(map: maplibregl.Map, geometry: GeoJSON.Geometry) {
  const bbox = bboxFromGeometry(geometry);
  if (!bbox) return;
  const opts = fitOptionsForGeometry(geometry);
  map.fitBounds(bbox, { padding: opts.padding, maxZoom: opts.maxZoom, duration: 0 });
}

export default function FichaMiniMap({
  clave,
  geometry,
  fiscalStatus = "sin_adeudo",
  searchHighlights = null,
  geometryClave,
  geonodeLayers,
  wmsPath,
  layersPanelOpen,
  onCloseLayersPanel,
  onPredioSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onPredioSelectRef = useRef(onPredioSelect);
  const geonodeLayersRef = useRef(geonodeLayers);
  const wmsPathRef = useRef(wmsPath);
  const mapBootKeyRef = useRef("");
  const baseMapAppliedRef = useRef<BaseMapId | null>(null);
  const visibleLayersRef = useRef<Record<string, boolean>>({});
  const layerOpacityRef = useRef<Record<string, number>>({});
  const [mapReady, setMapReady] = useState(0);
  const [mapVisible, setMapVisible] = useState(false);
  const [baseMap, setBaseMap] = useState<BaseMapId>("googleHybrid");

  const effectiveGeometry = useMemo(() => {
    if (!geometry || !isWgs84Geometry(geometry)) return null;
    if (geometryClave && geometryClave !== clave) return null;
    return geometry;
  }, [geometry, geometryClave, clave]);

  const geometryKey = useMemo(
    () =>
      effectiveGeometry
        ? `${clave}|${JSON.stringify(effectiveGeometry)}`
        : `${clave}|no-geom`,
    [clave, effectiveGeometry]
  );

  const initialVisible = useMemo(() => {
    const vis = buildInitialVisibility(geonodeLayers);
    for (const id of prediosLayerIds(geonodeLayers)) {
      vis[id] = true;
    }
    return vis;
  }, [geonodeLayers]);

  const initialOpacity = useMemo(() => {
    const op = buildInitialOpacity(geonodeLayers);
    for (const l of geonodeLayers) {
      if (layerRole(l) === "predios") {
        op[l.id] = PREDIOS_WMS_NEAR_OPACITY;
      }
    }
    return capColoniasOpacityWithPredios(initialVisible, op, geonodeLayers);
  }, [geonodeLayers, initialVisible]);

  const [visibleLayers, setVisibleLayers] = useState(initialVisible);
  const [layerOpacity, setLayerOpacity] = useState(initialOpacity);
  const [highlightVisible, setHighlightVisible] = useState(true);
  const [highlightOpacity, setHighlightOpacity] = useState(1);
  const [layerOrder, setLayerOrder] = useState<FichaPlanoLayerId[]>(() =>
    buildFichaLayerOrder(geonodeLayers)
  );

  useEffect(() => {
    visibleLayersRef.current = visibleLayers;
  }, [visibleLayers]);

  useEffect(() => {
    layerOpacityRef.current = layerOpacity;
  }, [layerOpacity]);

  useEffect(() => {
    setVisibleLayers(initialVisible);
    setLayerOpacity(initialOpacity);
    setLayerOrder(buildFichaLayerOrder(geonodeLayers));
    setHighlightVisible(true);
    setHighlightOpacity(1);
  }, [initialVisible, initialOpacity, geonodeLayers, clave]);

  const layerKey = `${geonodeLayers.map((l) => l.layer).join("|")}|${wmsPath}`;
  const highlightsKey = useMemo(
    () =>
      searchHighlights?.features?.map((f) => String(f.properties?.clave ?? "")).join("|") ?? "no-highlights",
    [searchHighlights]
  );

  const mapBootKey = `${clave}|${geometryKey}|${layerKey}|${fiscalStatus}|${highlightsKey}`;

  const wfsPickConfig = useMemo((): PublicConfig | null => {
    const predios = geonodeLayers.find((l) => layerRole(l) === "predios");
    if (!predios) return null;
    return { source: { layer: predios.layer } } as PublicConfig;
  }, [geonodeLayers]);

  onPredioSelectRef.current = onPredioSelect;
  geonodeLayersRef.current = geonodeLayers;
  wmsPathRef.current = wmsPath;

  useEffect(() => {
    setMapVisible(false);
    if (!containerRef.current) return;

    const bootKey = mapBootKey;
    mapBootKeyRef.current = bootKey;

    const fc: GeoJSON.FeatureCollection = effectiveGeometry
      ? {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { clave },
              geometry: effectiveGeometry,
            },
          ],
        }
      : { type: "FeatureCollection", features: [] };

    const center: [number, number] = effectiveGeometry
      ? (centroidFromGeometry(effectiveGeometry) ?? [-115.468278, 32.624639])
      : [-115.468278, 32.624639];

    const highlightFill = "rgba(37, 99, 235, 0.22)";
    const highlightLine = "#1d4ed8";

    const miniSearchHighlights: GeoJSON.FeatureCollection =
      searchHighlights && searchHighlights.features?.length
        ? searchHighlights
        : { type: "FeatureCollection", features: [] };

    const sources: Record<string, maplibregl.SourceSpecification> = {
      basemap: getBaseMapRasterSource(baseMap),
      "search-highlights-mini": { type: "geojson", data: miniSearchHighlights },
      highlight: { type: "geojson", data: fc },
    };
    const layers: maplibregl.LayerSpecification[] = [
      { id: "basemap", type: "raster", source: "basemap" },
      {
        id: "search-highlight-fill-mini",
        type: "fill",
        source: "search-highlights-mini",
        paint: {
          "fill-color": [
            "match",
            ["coalesce", ["get", "fiscal"], "sin_adeudo"],
            "con_adeudo",
            FISCAL_MAP_FILL_RGB.con_adeudo,
            FISCAL_MAP_FILL_RGB.sin_adeudo,
          ],
          "fill-opacity": 0.45,
        },
      },
      {
        id: "search-highlight-line-mini",
        type: "line",
        source: "search-highlights-mini",
        paint: {
          "line-color": [
            "match",
            ["coalesce", ["get", "fiscal"], "sin_adeudo"],
            "con_adeudo",
            FISCAL_MAP_LINE.con_adeudo,
            FISCAL_MAP_LINE.sin_adeudo,
          ],
          "line-width": 1.2,
          "line-opacity": 0.95,
        },
      },
    ];

    for (const gl of geonodeLayers) {
      const srcId = `geonode-${gl.id}`;
      sources[srcId] = {
        type: "raster",
        tiles: [buildGeonodeWmsTileUrl(wmsPath, gl.layer)],
        tileSize: 256,
      };
      layers.push({
        id: srcId,
        type: "raster",
        source: srcId,
        paint: { "raster-opacity": 0 },
      });
    }

    layers.push(
      {
        id: "highlight-fill",
        type: "fill",
        source: "highlight",
        paint: {
          "fill-color": highlightFill,
          "fill-opacity": SELECTED_MAP_FILL_OPACITY,
        },
      },
      {
        id: "highlight-halo",
        type: "line",
        source: "highlight",
        paint: {
          "line-color": SELECTED_MAP_HALO,
          "line-width": SELECTED_MAP_HALO_WIDTH,
        },
      },
      {
        id: "highlight-line",
        type: "line",
        source: "highlight",
        paint: {
          "line-color": highlightLine,
          "line-width": SELECTED_MAP_LINE_WIDTH,
        },
      }
    );

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: { version: 8, sources, layers },
      center,
      zoom: effectiveGeometry ? 17 : 14,
      attributionControl: false,
      interactive: true,
      fadeDuration: 0,
    });

    mapRef.current = map;

    const reveal = () => {
      if (mapBootKeyRef.current !== bootKey) return;
      baseMapAppliedRef.current = baseMap;
      if (effectiveGeometry) fitMapToGeometry(map, effectiveGeometry);
      scheduleGeonodeRasterOpacity(
        map,
        geonodeLayers,
        visibleLayersRef.current,
        layerOpacityRef.current
      );
      setMapReady((n) => n + 1);
      setMapVisible(true);
    };

    map.once("load", reveal);

    return () => {
      map.off("load", reveal);
      map.remove();
      mapRef.current = null;
      setMapVisible(false);
    };
  }, [clave, geometryKey, layerKey, wmsPath, geonodeLayers, effectiveGeometry, mapBootKey]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const activeMap: maplibregl.Map = mapRef.current;

    let dragStart: { x: number; y: number } | null = null;

    async function onMapClick(e: maplibregl.MapMouseEvent) {
      if (!onPredioSelectRef.current) return;
      if (dragStart) {
        const dx = e.point.x - dragStart.x;
        const dy = e.point.y - dragStart.y;
        if (Math.hypot(dx, dy) > 6) return;
      }

      const picked = await identifyPredioClaveAtPoint(
        activeMap,
        e.point,
        e.lngLat,
        {
          wmsPath: wmsPathRef.current,
          geonodeLayers: geonodeLayersRef.current,
          allowWms: true,
          config: wfsPickConfig,
        }
      );
      if (picked && picked !== clave.trim().toUpperCase()) {
        onPredioSelectRef.current(picked);
      }
    }

    function onMapMove(e: maplibregl.MapMouseEvent) {
      const canvas = activeMap.getCanvas();
      if (
        onPredioSelectRef.current &&
        mapShowsSelectablePredio(activeMap, e.point, activeMap.getZoom())
      ) {
        canvas.style.cursor = "pointer";
        return;
      }
      canvas.style.cursor = "";
    }

    function onDragStart(e: maplibregl.MapMouseEvent) {
      dragStart = { x: e.point.x, y: e.point.y };
    }

    function onDragEnd() {
      dragStart = null;
    }

    activeMap.on("mousedown", onDragStart);
    activeMap.on("mouseup", onDragEnd);
    activeMap.on("click", onMapClick);
    activeMap.on("mousemove", onMapMove);
    return () => {
      activeMap.off("mousedown", onDragStart);
      activeMap.off("mouseup", onDragEnd);
      activeMap.off("click", onMapClick);
      activeMap.off("mousemove", onMapMove);
      activeMap.getCanvas().style.cursor = "";
    };
  }, [mapReady, clave, wfsPickConfig]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (baseMapAppliedRef.current === baseMap) return;

    if (!hasSource(map, "basemap")) return;
    const current = map.getStyle();
    const basemapLayer = current.layers?.find((l) => l.id === "basemap");
    if (!basemapLayer || basemapLayer.type !== "raster") return;

    try {
      map.removeLayer("basemap");
      map.removeSource("basemap");
    } catch {
      return;
    }

    map.addSource("basemap", getBaseMapRasterSource(baseMap));
    const beforeId = hasLayer(map, "highlight-fill")
      ? "highlight-fill"
      : undefined;
    map.addLayer(
      { id: "basemap", type: "raster", source: "basemap" },
      beforeId
    );
    baseMapAppliedRef.current = baseMap;
  }, [baseMap, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const apply = () => {
      applyGeonodeRasterOpacity(
        map,
        geonodeLayers,
        visibleLayers,
        layerOpacity
      );

      const hOp = highlightVisible ? highlightOpacity : 0;
      if (hasLayer(map, "highlight-fill")) {
        map.setPaintProperty(
          "highlight-fill",
          "fill-opacity",
          hOp * SELECTED_MAP_FILL_OPACITY
        );
      }
      if (hasLayer(map, "highlight-halo")) {
        map.setPaintProperty("highlight-halo", "line-opacity", hOp);
      }
      if (hasLayer(map, "highlight-line")) {
        map.setPaintProperty("highlight-line", "line-opacity", hOp);
      }

      restackByOrder(map, layerOrder);
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
    scheduleGeonodeRasterOpacity(map, geonodeLayers, visibleLayers, layerOpacity);
  }, [
    visibleLayers,
    layerOpacity,
    highlightVisible,
    highlightOpacity,
    layerOrder,
    geonodeLayers,
    mapReady,
  ]);

  const panelRows: FichaPlanoLayerRow[] = layerOrder.map((id) => {
    if (id === "highlight") {
      return {
        id,
        title: layerTitle(id, geonodeLayers),
        role: "highlight",
        visible: highlightVisible,
        opacity: highlightOpacity,
      };
    }
    const gl = geonodeLayers.find((l) => l.id === id);
    return {
      id,
      title: layerTitle(id, geonodeLayers),
      role: gl ? layerRole(gl) : "other",
      visible: visibleLayers[id] ?? false,
      opacity: layerOpacity[id] ?? 1,
    };
  });

  function toggleLayer(id: FichaPlanoLayerId, on: boolean) {
    if (id === "highlight") {
      setHighlightVisible(on);
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
    if (id === "highlight") {
      setHighlightOpacity(value);
      if (value > 0) setHighlightVisible(true);
      return;
    }
    setLayerOpacity((prev) => {
      const next = { ...prev, [id]: value };
      return capColoniasOpacityWithPredios(visibleLayers, next, geonodeLayers);
    });
    if (value > 0) {
      setVisibleLayers((prev) => ({ ...prev, [id]: true }));
    }
  }

  function moveLayer(id: FichaPlanoLayerId, dir: -1 | 1) {
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

  if (!effectiveGeometry) {
    return (
      <div className="ficha-mini-map-wrap">
        <div className="ficha-mini-map-stage">
          <div
            ref={containerRef}
            className={`ficha-mini-map${mapVisible ? " ficha-mini-map--ready" : " ficha-mini-map--loading"}`}
            aria-label="Localización cartográfica"
          />
          <div className="ficha-mini-map-overlay">
            <p>
              {geometryClave && geometryClave !== clave
                ? "Actualizando localización cartográfica…"
                : "Sin polígono del predio; mapa base y capas WMS disponibles."}
            </p>
          </div>
          <FichaMapLayersPanel
            open={layersPanelOpen}
            onClose={onCloseLayersPanel}
            rows={panelRows}
            baseMap={baseMap}
            onBaseMapChange={setBaseMap}
            onToggle={toggleLayer}
            onOpacity={setOpacity}
            onMove={moveLayer}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="ficha-mini-map-wrap">
      <div className="ficha-mini-map-stage">
        <div
          ref={containerRef}
          className={`ficha-mini-map${mapVisible ? " ficha-mini-map--ready" : " ficha-mini-map--loading"}`}
          aria-label="Localización cartográfica"
        />
        <FichaMapLayersPanel
          open={layersPanelOpen}
          onClose={onCloseLayersPanel}
          rows={panelRows}
          baseMap={baseMap}
          onBaseMapChange={setBaseMap}
          onToggle={toggleLayer}
          onOpacity={setOpacity}
          onMove={moveLayer}
        />
      </div>
    </div>
  );
}
