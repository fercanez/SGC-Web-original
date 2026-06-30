import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { BaseMapId } from "./CadastralSidebar";
import {
  buildGeonodeWmsTileUrl,
  getBaseMapRasterSource,
  MAPLIBRE_GLYPHS_URL,
} from "../map/wms";
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
  SELECTED_MAP_FILL_OPACITY,
  SELECTED_MAP_HALO,
  SELECTED_MAP_HALO_WIDTH,
  SELECTED_MAP_LINE,
  SELECTED_MAP_LINE_WIDTH,
} from "../utils/fiscal";
import {
  buildInitialOpacity,
  buildInitialVisibility,
  capColoniasOpacityWithPredios,
  layerRole,
  PREDIOS_WMS_NEAR_OPACITY,
  prediosLayerIds,
} from "../config/mapLayers";
import type { GeonodeLayer } from "../types/config";
import {
  buildPredioMeasurementsGeoJSON,
  cotaOffsetMetersForZoom,
} from "../utils/predioMeasurements";
import {
  buildFichaLayerOrder,
  type FichaPlanoLayerId,
} from "./FichaMapLayersPanel";

const LABEL_FONT = ["Open Sans Regular", "Arial Unicode MS Regular"];

export interface FichaPrintMapHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  center: () => void;
  resize: () => void;
  waitForIdle: () => Promise<void>;
  captureImage: () => Promise<string | null>;
}

interface Props {
  clave: string;
  geometry: GeoJSON.Geometry | null;
  geometryClave?: string | null;
  geonodeLayers: GeonodeLayer[];
  wmsPath: string;
  baseMap: BaseMapId;
  showCotas: boolean;
  showVertices: boolean;
  visibleLayers: Record<string, boolean>;
  layerOpacity: Record<string, number>;
  layerOrder: FichaPlanoLayerId[];
  highlightVisible?: boolean;
}

function hasLayer(map: maplibregl.Map, id: string): boolean {
  try {
    return Boolean(map.getLayer(id));
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
  for (const id of [
    "meas-edges",
    "meas-vertices",
    "meas-cotas",
    "meas-vertex-labels",
    "highlight-clave-label",
  ]) {
    if (hasLayer(map, id)) {
      try {
        map.moveLayer(id);
      } catch {
        /* */
      }
    }
  }
}

function waitForContainerSize(el: HTMLElement, maxMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (el.offsetWidth >= 40 && el.offsetHeight >= 40) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= maxMs) {
        resolve(false);
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function waitForMapIdle(map: maplibregl.Map): Promise<void> {
  return new Promise((resolve) => {
    if (map.loaded()) {
      map.once("idle", () => resolve());
      map.triggerRepaint();
    } else {
      map.once("load", () => map.once("idle", () => resolve()));
    }
    window.setTimeout(resolve, 2500);
  });
}

function captureMapCanvas(map: maplibregl.Map): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (data: string | null) => {
      if (settled) return;
      settled = true;
      resolve(data);
    };
    const grab = () => {
      try {
        map.triggerRepaint();
        const data = map.getCanvas().toDataURL("image/png");
        finish(data && data.length > 100 ? data : null);
      } catch {
        finish(null);
      }
    };
    if (map.loaded()) {
      map.once("idle", grab);
      map.triggerRepaint();
    } else {
      map.once("load", () => map.once("idle", grab));
    }
    window.setTimeout(() => finish(null), 3500);
  });
}

function buildMeasurementsForZoom(
  geometry: GeoJSON.Geometry,
  zoom: number
): GeoJSON.FeatureCollection {
  const center = centroidFromGeometry(geometry);
  const lat = center?.[1] ?? 32.624639;
  const cotaOffset = cotaOffsetMetersForZoom(lat, zoom, 16);
  const vertexOffset = cotaOffsetMetersForZoom(lat, zoom, 10);
  return buildPredioMeasurementsGeoJSON(geometry, {
    cotaOffsetMeters: cotaOffset,
    vertexOffsetMeters: vertexOffset,
  });
}

function buildClaveLabelGeoJSON(
  clave: string,
  geometry: GeoJSON.Geometry
): GeoJSON.FeatureCollection {
  const center = centroidFromGeometry(geometry);
  if (!center) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { clave },
        geometry: { type: "Point", coordinates: center },
      },
    ],
  };
}

const FichaPrintMap = forwardRef<FichaPrintMapHandle, Props>(function FichaPrintMap(
  {
    clave,
    geometry,
    geometryClave,
    geonodeLayers,
    wmsPath,
    baseMap,
    showCotas,
    showVertices,
    visibleLayers,
    layerOpacity,
    layerOrder,
    highlightVisible = true,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const baseMapRef = useRef(baseMap);
  const visibleLayersRef = useRef(visibleLayers);
  const layerOpacityRef = useRef(layerOpacity);
  const [mapReady, setMapReady] = useState(0);
  const [mapVisible, setMapVisible] = useState(false);

  useEffect(() => {
    visibleLayersRef.current = visibleLayers;
  }, [visibleLayers]);

  useEffect(() => {
    layerOpacityRef.current = layerOpacity;
  }, [layerOpacity]);

  const effectiveGeometry = useMemo(() => {
    if (!geometry || !isWgs84Geometry(geometry)) return null;
    if (geometryClave && geometryClave !== clave) return null;
    return geometry;
  }, [geometry, geometryClave, clave]);

  const geometryKey = useMemo(
    () => (effectiveGeometry ? `${clave}|${JSON.stringify(effectiveGeometry)}` : ""),
    [clave, effectiveGeometry]
  );

  const layerKey = `${geonodeLayers.map((l) => l.layer).join("|")}|${wmsPath}`;
  const mapBootKey = `${geometryKey}|${layerKey}`;

  useImperativeHandle(ref, () => ({
    zoomIn() {
      mapRef.current?.zoomTo((mapRef.current.getZoom() || 17) + 1, { duration: 200 });
    },
    zoomOut() {
      mapRef.current?.zoomTo((mapRef.current.getZoom() || 17) - 1, { duration: 200 });
    },
    center() {
      const map = mapRef.current;
      if (!map || !effectiveGeometry) return;
      const bbox = bboxFromGeometry(effectiveGeometry);
      if (!bbox) return;
      const opts = fitOptionsForGeometry(effectiveGeometry);
      map.resize();
      map.fitBounds(bbox, {
        padding: opts.padding,
        maxZoom: opts.maxZoom,
        duration: 300,
      });
    },
    resize() {
      try {
        mapRef.current?.resize();
      } catch {
        /* */
      }
    },
    waitForIdle() {
      const map = mapRef.current;
      if (!map) return Promise.resolve();
      return waitForMapIdle(map);
    },
    captureImage() {
      const map = mapRef.current;
      if (!map) return Promise.resolve(null);
      return captureMapCanvas(map);
    },
  }));

  useEffect(() => {
    setMapVisible(false);
    if (!containerRef.current || !effectiveGeometry) return;

    const container = containerRef.current;
    const bootKey = mapBootKey;
    let map: maplibregl.Map | null = null;
    let cancelled = false;

    const init = async () => {
      const sized = await waitForContainerSize(container);
      if (cancelled || !containerRef.current || !effectiveGeometry) return;

      const fc: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { clave },
            geometry: effectiveGeometry,
          },
        ],
      };

      const initialMeasurements = buildMeasurementsForZoom(effectiveGeometry, 18);
      const claveLabel = buildClaveLabelGeoJSON(clave, effectiveGeometry);

      const sources: Record<string, maplibregl.SourceSpecification> = {
        basemap: getBaseMapRasterSource(baseMapRef.current),
        highlight: { type: "geojson", data: fc },
        "highlight-label": { type: "geojson", data: claveLabel },
        measurements: { type: "geojson", data: initialMeasurements },
      };
      const layers: maplibregl.LayerSpecification[] = [
        { id: "basemap", type: "raster", source: "basemap" },
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
            "fill-color": "rgba(0, 60, 255, 0.12)",
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
            "line-color": SELECTED_MAP_LINE,
            "line-width": SELECTED_MAP_LINE_WIDTH,
            "line-dasharray": [2, 1.2],
          },
        },
        {
          id: "highlight-clave-label",
          type: "symbol",
          source: "highlight-label",
          layout: {
            "text-field": ["get", "clave"],
            "text-font": LABEL_FONT,
            "text-size": 15,
            "text-letter-spacing": 0.04,
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          },
          paint: {
            "text-color": "#000000",
            "text-halo-color": "#ffffff",
            "text-halo-width": 3,
          },
        },
        {
          id: "meas-edges",
          type: "line",
          source: "measurements",
          filter: ["==", ["get", "kind"], "edge"],
          paint: {
            "line-color": "#703341",
            "line-width": 2,
            "line-dasharray": [2, 1.2],
          },
        },
        {
          id: "meas-vertices",
          type: "circle",
          source: "measurements",
          filter: ["==", ["get", "kind"], "vertex-dot"],
          paint: {
            "circle-radius": 4,
            "circle-color": "#ffffff",
            "circle-stroke-color": "#007bff",
            "circle-stroke-width": 2,
          },
        },
        {
          id: "meas-cotas",
          type: "symbol",
          source: "measurements",
          filter: ["==", ["get", "kind"], "cota"],
          layout: {
            "text-field": ["get", "label"],
            "text-font": LABEL_FONT,
            "text-size": 12,
            "text-rotate": ["get", "bearing"],
            "text-rotation-alignment": "map",
            "text-pitch-alignment": "map",
            "text-keep-upright": true,
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          },
          paint: {
            "text-color": "#703341",
            "text-halo-color": "#ffffff",
            "text-halo-width": 2.5,
          },
        },
        {
          id: "meas-vertex-labels",
          type: "symbol",
          source: "measurements",
          filter: ["==", ["get", "kind"], "vertex-label"],
          layout: {
            "text-field": ["get", "label"],
            "text-font": LABEL_FONT,
            "text-size": 11,
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "#007bff",
            "text-halo-width": 2,
          },
        }
      );

      const center = centroidFromGeometry(effectiveGeometry) ?? [
        -115.468278, 32.624639,
      ];

      map = new maplibregl.Map({
        container,
        style: {
          version: 8,
          glyphs: MAPLIBRE_GLYPHS_URL,
          sources,
          layers,
        },
        center,
        zoom: 18,
        attributionControl: false,
        interactive: true,
        fadeDuration: 0,
        preserveDrawingBuffer: true,
      });

      if (cancelled) {
        map.remove();
        return;
      }

      mapRef.current = map;

      const onReady = () => {
        if (cancelled || !map) return;
        try {
          map.resize();
        } catch {
          /* */
        }
        const bbox = bboxFromGeometry(effectiveGeometry);
        if (bbox) {
          const opts = fitOptionsForGeometry(effectiveGeometry);
          map.fitBounds(bbox, {
            padding: opts.padding,
            maxZoom: opts.maxZoom,
            duration: 0,
          });
        }
        const zoom = map.getZoom();
        const src = map.getSource("measurements") as maplibregl.GeoJSONSource | undefined;
        src?.setData(buildMeasurementsForZoom(effectiveGeometry, zoom));
        scheduleGeonodeRasterOpacity(
          map,
          geonodeLayers,
          visibleLayersRef.current,
          layerOpacityRef.current
        );
        setMapReady((n) => n + 1);
        setMapVisible(true);
      };

      map.once("load", onReady);
      if (!sized) {
        setTimeout(() => {
          try {
            map?.resize();
          } catch {
            /* */
          }
        }, 200);
      }
    };

    void init();

    return () => {
      cancelled = true;
      if (map) {
        map.remove();
      }
      mapRef.current = null;
      setMapVisible(false);
    };
  }, [clave, mapBootKey, wmsPath, geonodeLayers, effectiveGeometry]);

  useEffect(() => {
    baseMapRef.current = baseMap;
    const map = mapRef.current;
    if (!map || !mapReady) return;
    try {
      if (map.getSource("basemap")) {
        map.removeLayer("basemap");
        map.removeSource("basemap");
      }
      map.addSource("basemap", getBaseMapRasterSource(baseMap));
      const before = hasLayer(map, "highlight-fill") ? "highlight-fill" : undefined;
      map.addLayer(
        { id: "basemap", type: "raster", source: "basemap" },
        before
      );
    } catch {
      /* */
    }
  }, [baseMap, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !effectiveGeometry) return;

    const applyMeasurementOffsets = () => {
      const src = map.getSource("measurements") as maplibregl.GeoJSONSource | undefined;
      src?.setData(buildMeasurementsForZoom(effectiveGeometry, map.getZoom()));
    };

    applyMeasurementOffsets();
    map.on("zoom", applyMeasurementOffsets);
    map.on("moveend", applyMeasurementOffsets);
    return () => {
      map.off("zoom", applyMeasurementOffsets);
      map.off("moveend", applyMeasurementOffsets);
    };
  }, [mapReady, effectiveGeometry]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !effectiveGeometry) return;
    const labelSrc = map.getSource("highlight-label") as maplibregl.GeoJSONSource | undefined;
    labelSrc?.setData(buildClaveLabelGeoJSON(clave, effectiveGeometry));
  }, [clave, effectiveGeometry, mapReady]);

  useEffect(() => {
    const el = containerRef.current;
    const map = mapRef.current;
    if (!el || !map || !mapReady) return;
    const ro = new ResizeObserver(() => {
      try {
        map.resize();
      } catch {
        /* */
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mapReady]);

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

      const hOp = highlightVisible ? 1 : 0;
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
      if (hasLayer(map, "highlight-clave-label")) {
        map.setLayoutProperty(
          "highlight-clave-label",
          "visibility",
          highlightVisible ? "visible" : "none"
        );
      }

      if (hasLayer(map, "meas-edges")) {
        map.setLayoutProperty(
          "meas-edges",
          "visibility",
          showCotas ? "visible" : "none"
        );
      }
      if (hasLayer(map, "meas-cotas")) {
        map.setLayoutProperty(
          "meas-cotas",
          "visibility",
          showCotas ? "visible" : "none"
        );
      }
      if (hasLayer(map, "meas-vertex-labels")) {
        map.setLayoutProperty(
          "meas-vertex-labels",
          "visibility",
          showVertices ? "visible" : "none"
        );
      }
      if (hasLayer(map, "meas-vertices")) {
        map.setLayoutProperty(
          "meas-vertices",
          "visibility",
          showVertices ? "visible" : "none"
        );
      }
      restackByOrder(map, layerOrder);
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
    scheduleGeonodeRasterOpacity(map, geonodeLayers, visibleLayers, layerOpacity);
  }, [
    visibleLayers,
    layerOpacity,
    layerOrder,
    geonodeLayers,
    mapReady,
    highlightVisible,
    showCotas,
    showVertices,
  ]);

  if (!effectiveGeometry) {
    return (
      <div className="ficha-print-map-empty">
        {geometryClave && geometryClave !== clave
          ? "Cargando geometría del predio…"
          : "Sin geometría cartográfica."}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`ficha-print-map${mapVisible ? " ficha-print-map--ready" : ""}`}
      aria-label="Mapa de impresión"
    />
  );
});

export default FichaPrintMap;

export function buildPrintLayerOrder(
  geonodeLayers: GeonodeLayer[]
): FichaPlanoLayerId[] {
  return buildFichaLayerOrder(geonodeLayers);
}

export function buildPrintInitialVisibility(geonodeLayers: GeonodeLayer[]) {
  const vis = buildInitialVisibility(geonodeLayers);
  for (const id of prediosLayerIds(geonodeLayers)) {
    vis[id] = true;
  }
  return vis;
}

export function buildPrintInitialOpacity(
  geonodeLayers: GeonodeLayer[],
  visible: Record<string, boolean>
) {
  const op = buildInitialOpacity(geonodeLayers);
  for (const l of geonodeLayers) {
    if (layerRole(l) === "predios") {
      op[l.id] = PREDIOS_WMS_NEAR_OPACITY;
    }
  }
  return capColoniasOpacityWithPredios(visible, op, geonodeLayers);
}
