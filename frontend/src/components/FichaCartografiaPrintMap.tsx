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
import type { ConstruccionCartograficaItem } from "../api";
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
import type { GeonodeLayer } from "../types/config";
import type { MeasureMode } from "../utils/mapSnap";
import {
  buildCuadroMeasurementsGeoJSON,
  buildFreeMeasureDisplayGeoJSON,
  construccionesVectorFeatureCollection,
} from "../utils/fichaCartografiaMapHelpers";
import type { FichaPlanoLayerId } from "./FichaMapLayersPanel";
import type { FichaPrintMapHandle } from "./FichaPrintMap";

export type { FichaPrintMapHandle };

const LABEL_FONT = ["Open Sans Regular", "Arial Unicode MS Regular"];

interface Props {
  clave: string;
  geometry: GeoJSON.Geometry | null;
  geometryClave?: string | null;
  geonodeLayers: GeonodeLayer[];
  wmsPath: string;
  baseMap: BaseMapId;
  visibleLayers: Record<string, boolean>;
  layerOpacity: Record<string, number>;
  layerOrder: FichaPlanoLayerId[];
  highlightVisible?: boolean;
  showCuadro: boolean;
  construccionItems: ConstruccionCartograficaItem[];
  measurePoints: GeoJSON.Position[];
  measureMode: MeasureMode;
  measureHidden: boolean;
  vectorVisible: boolean;
  freeMeasureVisible: boolean;
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

function mapLayerId(id: FichaPlanoLayerId): string | null {
  if (id === "highlight") return "highlight-line";
  if (id === "measure-free") return "free-meas-edges";
  if (id === "construcciones-vector") return "constr-fill";
  if (id === "cuadro") return "cuadro-edges";
  return `geonode-${id}`;
}

function restackByOrder(map: maplibregl.Map, order: FichaPlanoLayerId[]) {
  const topLayers = [
    "cuadro-edges",
    "cuadro-vertices",
    "cuadro-cotas",
    "cuadro-vertex-labels",
    "free-meas-edges",
    "free-meas-vertices",
    "free-meas-cotas",
    "free-meas-vertex-labels",
  ];
  const ids = order
    .map(mapLayerId)
    .filter((id): id is string => Boolean(id))
    .filter((id) => hasLayer(map, id));
  for (let i = ids.length - 1; i >= 0; i--) {
    try {
      map.moveLayer(ids[i]);
    } catch {
      /* */
    }
  }
  for (const id of topLayers) {
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

const FichaCartografiaPrintMap = forwardRef<FichaPrintMapHandle, Props>(
  function FichaCartografiaPrintMap(
    {
      clave,
      geometry,
      geometryClave,
      geonodeLayers,
      wmsPath,
      baseMap,
      visibleLayers,
      layerOpacity,
      layerOrder,
      highlightVisible = true,
      showCuadro,
      construccionItems,
      measurePoints,
      measureMode,
      measureHidden,
      vectorVisible,
      freeMeasureVisible,
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
      () =>
        effectiveGeometry ? `${clave}|${JSON.stringify(effectiveGeometry)}` : "",
      [clave, effectiveGeometry]
    );

    const layerKey = `${geonodeLayers.map((l) => l.layer).join("|")}|${wmsPath}`;
    const mapBootKey = `${geometryKey}|${layerKey}`;

    useImperativeHandle(ref, () => ({
      zoomIn() {
        mapRef.current?.zoomTo((mapRef.current.getZoom() || 17) + 1, {
          duration: 200,
        });
      },
      zoomOut() {
        mapRef.current?.zoomTo((mapRef.current.getZoom() || 17) - 1, {
          duration: 200,
        });
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

        const cuadroMeas = buildCuadroMeasurementsGeoJSON(effectiveGeometry, 18);
        const vectorFc = construccionesVectorFeatureCollection(construccionItems);

        const sources: Record<string, maplibregl.SourceSpecification> = {
          basemap: getBaseMapRasterSource(baseMapRef.current),
          highlight: { type: "geojson", data: fc },
          cuadro: { type: "geojson", data: cuadroMeas },
          "construcciones-vector": { type: "geojson", data: vectorFc },
          "free-measure": {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          },
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
            id: "constr-fill",
            type: "fill",
            source: "construcciones-vector",
            paint: { "fill-color": "#f97316", "fill-opacity": 0.35 },
          },
          {
            id: "constr-line",
            type: "line",
            source: "construcciones-vector",
            paint: { "line-color": "#c2410c", "line-width": 2 },
          },
          {
            id: "highlight-fill",
            type: "fill",
            source: "highlight",
            paint: {
              "fill-color": "rgba(0, 0, 255, 0.1)",
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
            id: "cuadro-edges",
            type: "line",
            source: "cuadro",
            filter: ["==", ["get", "kind"], "edge"],
            paint: {
              "line-color": "#007bff",
              "line-width": 2,
              "line-dasharray": [2, 1.2],
            },
          },
          {
            id: "cuadro-vertices",
            type: "circle",
            source: "cuadro",
            filter: ["==", ["get", "kind"], "vertex-dot"],
            paint: {
              "circle-radius": 5,
              "circle-color": "#dc2626",
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1.5,
            },
          },
          {
            id: "cuadro-cotas",
            type: "symbol",
            source: "cuadro",
            filter: ["==", ["get", "kind"], "cota"],
            layout: {
              "text-field": ["get", "label"],
              "text-font": LABEL_FONT,
              "text-size": 11,
              "text-rotate": ["get", "bearing"],
              "text-rotation-alignment": "map",
              "text-keep-upright": true,
              "text-allow-overlap": true,
              "text-ignore-placement": true,
            },
            paint: {
              "text-color": "#1d4ed8",
              "text-halo-color": "#ffffff",
              "text-halo-width": 2,
            },
          },
          {
            id: "cuadro-vertex-labels",
            type: "symbol",
            source: "cuadro",
            filter: ["==", ["get", "kind"], "vertex-label"],
            layout: {
              "text-field": ["get", "label"],
              "text-font": LABEL_FONT,
              "text-size": 10,
              "text-allow-overlap": true,
              "text-ignore-placement": true,
            },
            paint: {
              "text-color": "#ffffff",
              "text-halo-color": "#dc2626",
              "text-halo-width": 2,
            },
          },
          {
            id: "free-meas-edges",
            type: "line",
            source: "free-measure",
            filter: ["==", ["get", "kind"], "edge"],
            paint: {
              "line-color": "#2563eb",
              "line-width": 2,
              "line-dasharray": [2, 1.5],
            },
          },
          {
            id: "free-meas-vertices",
            type: "circle",
            source: "free-measure",
            filter: ["==", ["get", "kind"], "vertex-dot"],
            paint: {
              "circle-radius": 4,
              "circle-color": "#2563eb",
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            },
          },
          {
            id: "free-meas-cotas",
            type: "symbol",
            source: "free-measure",
            filter: ["==", ["get", "kind"], "cota"],
            layout: {
              "text-field": ["get", "label"],
              "text-font": LABEL_FONT,
              "text-size": 11,
              "text-rotate": ["get", "bearing"],
              "text-rotation-alignment": "map",
              "text-allow-overlap": true,
              "text-ignore-placement": true,
            },
            paint: {
              "text-color": "#ffffff",
              "text-halo-color": "#dc2626",
              "text-halo-width": 2.5,
            },
          },
          {
            id: "free-meas-vertex-labels",
            type: "symbol",
            source: "free-measure",
            filter: ["==", ["get", "kind"], "vertex-label"],
            layout: {
              "text-field": ["get", "label"],
              "text-font": LABEL_FONT,
              "text-size": 10,
              "text-allow-overlap": true,
              "text-ignore-placement": true,
            },
            paint: {
              "text-color": "#ffffff",
              "text-halo-color": "#2563eb",
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
          const cuadroSrc = map.getSource("cuadro") as
            | maplibregl.GeoJSONSource
            | undefined;
          cuadroSrc?.setData(
            buildCuadroMeasurementsGeoJSON(effectiveGeometry, zoom)
          );
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
        const before = hasLayer(map, "constr-fill") ? "constr-fill" : undefined;
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
      if (!map || !mapReady || !hasSource(map, "construcciones-vector")) return;
      const src = map.getSource("construcciones-vector") as maplibregl.GeoJSONSource;
      src.setData(construccionesVectorFeatureCollection(construccionItems));
    }, [construccionItems, mapReady]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady || !effectiveGeometry) return;

      const updateCuadro = () => {
        if (!hasSource(map, "cuadro")) return;
        const zoom = map.getZoom();
        const src = map.getSource("cuadro") as maplibregl.GeoJSONSource;
        src.setData(buildCuadroMeasurementsGeoJSON(effectiveGeometry, zoom));
      };

      updateCuadro();
      map.on("zoom", updateCuadro);
      map.on("moveend", updateCuadro);
      return () => {
        map.off("zoom", updateCuadro);
        map.off("moveend", updateCuadro);
      };
    }, [effectiveGeometry, mapReady]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady || !hasSource(map, "free-measure")) return;

      const updateFreeMeasure = () => {
        const zoom = map.getZoom();
        const src = map.getSource("free-measure") as maplibregl.GeoJSONSource;
        if (measureHidden || !freeMeasureVisible) {
          src.setData({ type: "FeatureCollection", features: [] });
          return;
        }
        src.setData(
          buildFreeMeasureDisplayGeoJSON(measurePoints, measureMode, zoom)
        );
      };

      updateFreeMeasure();
      map.on("zoom", updateFreeMeasure);
      map.on("moveend", updateFreeMeasure);
      return () => {
        map.off("zoom", updateFreeMeasure);
        map.off("moveend", updateFreeMeasure);
      };
    }, [
      measurePoints,
      measureMode,
      measureHidden,
      freeMeasureVisible,
      mapReady,
    ]);

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

        const hOp = highlightVisible
          ? (layerOpacity.highlight ?? 1)
          : 0;
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

        const cOp = showCuadro ? (layerOpacity.cuadro ?? 1) : 0;
        for (const id of [
          "cuadro-edges",
          "cuadro-vertices",
          "cuadro-cotas",
          "cuadro-vertex-labels",
        ]) {
          if (!hasLayer(map, id)) continue;
          if (id === "cuadro-edges") {
            map.setPaintProperty(id, "line-opacity", cOp);
          } else if (id === "cuadro-vertices") {
            map.setPaintProperty(id, "circle-opacity", cOp);
          } else {
            map.setPaintProperty(id, "text-opacity", cOp);
          }
        }

        const vOp = vectorVisible
          ? (layerOpacity["construcciones-vector"] ?? 1)
          : 0;
        if (hasLayer(map, "constr-fill")) {
          map.setPaintProperty("constr-fill", "fill-opacity", vOp * 0.35);
        }
        if (hasLayer(map, "constr-line")) {
          map.setPaintProperty("constr-line", "line-opacity", vOp);
        }

        const fOp =
          freeMeasureVisible && !measureHidden
            ? (layerOpacity["measure-free"] ?? 1)
            : 0;
        for (const id of [
          "free-meas-edges",
          "free-meas-vertices",
          "free-meas-cotas",
          "free-meas-vertex-labels",
        ]) {
          if (!hasLayer(map, id)) continue;
          if (id === "free-meas-edges") {
            map.setPaintProperty(id, "line-opacity", fOp);
          } else if (id === "free-meas-vertices") {
            map.setPaintProperty(id, "circle-opacity", fOp);
          } else {
            map.setPaintProperty(id, "text-opacity", fOp);
          }
        }

        restackByOrder(map, layerOrder);
      };

      if (map.isStyleLoaded()) apply();
      else map.once("load", apply);
      scheduleGeonodeRasterOpacity(
        map,
        geonodeLayers,
        visibleLayers,
        layerOpacity
      );
    }, [
      visibleLayers,
      layerOpacity,
      layerOrder,
      geonodeLayers,
      mapReady,
      highlightVisible,
      showCuadro,
      vectorVisible,
      freeMeasureVisible,
      measureHidden,
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
        aria-label="Mapa de impresión cartográfica"
      />
    );
  }
);

export default FichaCartografiaPrintMap;
