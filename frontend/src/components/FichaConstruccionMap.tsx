import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { BaseMapId } from "./CadastralSidebar";
import type { ConstruccionCartograficaItem } from "../api";
import { buildGeonodeWmsTileUrl, getBaseMapRasterSource, MAPLIBRE_GLYPHS_URL } from "../map/wms";
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
  construccionesLayerIds,
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
  collectSnapPoints,
  measureGeoJSON,
  snapToNearestVertex,
  type MeasureMode,
} from "../utils/mapSnap";
import FichaMapLayersPanel, {
  buildFichaConstruccionLayerOrder,
  layerTitle,
  type FichaPlanoLayerId,
  type FichaPlanoLayerRow,
} from "./FichaMapLayersPanel";

const LABEL_FONT = ["Open Sans Regular", "Arial Unicode MS Regular"];

interface Props {
  clave: string;
  geometry: GeoJSON.Geometry | null;
  geometryClave?: string | null;
  geonodeLayers: GeonodeLayer[];
  wmsPath: string;
  construccionItems: ConstruccionCartograficaItem[];
  measureEnabled: boolean;
  measureMode: MeasureMode;
  snapEnabled: boolean;
  measureHidden: boolean;
  measurePoints: GeoJSON.Position[];
  onMeasurePointsChange: (points: GeoJSON.Position[]) => void;
  layersPanelOpen: boolean;
  onCloseLayersPanel: () => void;
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
    "highlight-clave-label",
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

function fitMapToGeometry(map: maplibregl.Map, geometry: GeoJSON.Geometry) {
  const bbox = bboxFromGeometry(geometry);
  if (!bbox) return;
  const opts = fitOptionsForGeometry(geometry);
  map.fitBounds(bbox, { padding: opts.padding, maxZoom: opts.maxZoom, duration: 0 });
}

function buildCuadroMeasurements(
  geometry: GeoJSON.Geometry,
  zoom: number
): GeoJSON.FeatureCollection {
  const center = centroidFromGeometry(geometry);
  const lat = center?.[1] ?? 32.624639;
  return buildPredioMeasurementsGeoJSON(geometry, {
    cotaOffsetMeters: cotaOffsetMetersForZoom(lat, zoom, 16),
    vertexOffsetMeters: cotaOffsetMetersForZoom(lat, zoom, 10),
  });
}

function buildFreeMeasureDisplay(
  points: GeoJSON.Position[],
  mode: MeasureMode,
  zoom: number
): GeoJSON.FeatureCollection {
  if (mode === "polygon" && points.length >= 3) {
    const ring = [...points, points[0]];
    const geom: GeoJSON.Polygon = { type: "Polygon", coordinates: [ring] };
    const center = centroidFromGeometry(geom);
    const lat = center?.[1] ?? 32.624639;
    return buildPredioMeasurementsGeoJSON(geom, {
      cotaOffsetMeters: cotaOffsetMetersForZoom(lat, zoom, 14),
      vertexOffsetMeters: cotaOffsetMetersForZoom(lat, zoom, 8),
    });
  }
  const base = measureGeoJSON(points, mode);
  if (mode === "line" && points.length >= 2) {
    for (let i = 0; i < points.length - 1; i++) {
      const p = points[i];
      const q = points[i + 1];
      base.features.push({
        type: "Feature",
        properties: { kind: "edge" },
        geometry: { type: "LineString", coordinates: [p, q] },
      });
    }
  }
  return base;
}

function construccionesVectorFc(
  items: ConstruccionCartograficaItem[]
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const item of items) {
    if (!item.geometry) continue;
    features.push({
      type: "Feature",
      properties: {
        clave_const: item.clave_const,
        tipo: item.tipo,
      },
      geometry: item.geometry,
    });
  }
  return { type: "FeatureCollection", features };
}

export default function FichaConstruccionMap({
  clave,
  geometry,
  geometryClave,
  geonodeLayers,
  wmsPath,
  construccionItems,
  measureEnabled,
  measureMode,
  snapEnabled,
  measureHidden,
  measurePoints,
  onMeasurePointsChange,
  layersPanelOpen,
  onCloseLayersPanel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapBootKeyRef = useRef("");
  const baseMapAppliedRef = useRef<BaseMapId | null>(null);
  const visibleLayersRef = useRef<Record<string, boolean>>({});
  const layerOpacityRef = useRef<Record<string, number>>({});
  const snapPointsRef = useRef<GeoJSON.Position[]>([]);
  const [mapReady, setMapReady] = useState(0);
  const [mapVisible, setMapVisible] = useState(false);
  const [baseMap, setBaseMap] = useState<BaseMapId>("googleHybrid");
  const [cursorLabel, setCursorLabel] = useState("—");

  const effectiveGeometry = useMemo(() => {
    if (!geometry || !isWgs84Geometry(geometry)) return null;
    if (geometryClave && geometryClave !== clave) return null;
    return geometry;
  }, [geometry, geometryClave, clave]);

  const geometryKey = useMemo(
    () => (effectiveGeometry ? `${clave}|${JSON.stringify(effectiveGeometry)}` : ""),
    [clave, effectiveGeometry]
  );

  const initialVisible = useMemo(() => {
    const vis = buildInitialVisibility(geonodeLayers);
    for (const id of prediosLayerIds(geonodeLayers)) vis[id] = true;
    for (const id of construccionesLayerIds(geonodeLayers)) vis[id] = true;
    vis["construcciones-vector"] = true;
    vis["measure-free"] = true;
    return vis;
  }, [geonodeLayers]);

  const initialOpacity = useMemo(() => {
    const op = buildInitialOpacity(geonodeLayers);
    for (const l of geonodeLayers) {
      if (layerRole(l) === "predios") op[l.id] = PREDIOS_WMS_NEAR_OPACITY;
    }
    op["construcciones-vector"] = 1;
    op["measure-free"] = 1;
    return capColoniasOpacityWithPredios(initialVisible, op, geonodeLayers);
  }, [geonodeLayers, initialVisible]);

  const [visibleLayers, setVisibleLayers] = useState(initialVisible);
  const [layerOpacity, setLayerOpacity] = useState(initialOpacity);
  const [highlightVisible, setHighlightVisible] = useState(true);
  const [highlightOpacity, setHighlightOpacity] = useState(1);
  const [cuadroVisible, setCuadroVisible] = useState(true);
  const [cuadroOpacity, setCuadroOpacity] = useState(1);
  const [vectorVisible, setVectorVisible] = useState(true);
  const [vectorOpacity, setVectorOpacity] = useState(1);
  const [freeMeasureVisible, setFreeMeasureVisible] = useState(true);
  const [freeMeasureOpacity, setFreeMeasureOpacity] = useState(1);
  const [layerOrder, setLayerOrder] = useState<FichaPlanoLayerId[]>(() =>
    buildFichaConstruccionLayerOrder(geonodeLayers)
  );

  const snapPoints = useMemo(() => {
    const geoms: (GeoJSON.Geometry | null | undefined)[] = [effectiveGeometry];
    for (const item of construccionItems) geoms.push(item.geometry);
    return collectSnapPoints(geoms);
  }, [effectiveGeometry, construccionItems]);

  useEffect(() => {
    snapPointsRef.current = snapPoints;
  }, [snapPoints]);

  useEffect(() => {
    visibleLayersRef.current = visibleLayers;
  }, [visibleLayers]);

  useEffect(() => {
    layerOpacityRef.current = layerOpacity;
  }, [layerOpacity]);

  useEffect(() => {
    setVisibleLayers(initialVisible);
    setLayerOpacity(initialOpacity);
    setLayerOrder(buildFichaConstruccionLayerOrder(geonodeLayers));
    setHighlightVisible(true);
    setHighlightOpacity(1);
    setCuadroVisible(true);
    setVectorVisible(true);
    setFreeMeasureVisible(true);
  }, [initialVisible, initialOpacity, geonodeLayers, clave]);

  const layerKey = `${geonodeLayers.map((l) => l.layer).join("|")}|${wmsPath}`;
  const mapBootKey = `${clave}|${geometryKey}|${layerKey}`;

  useEffect(() => {
    setMapVisible(false);
    if (!containerRef.current || !effectiveGeometry) return;

    const bootKey = mapBootKey;
    mapBootKeyRef.current = bootKey;

    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { clave }, geometry: effectiveGeometry },
      ],
    };
    const cuadroMeas = buildCuadroMeasurements(effectiveGeometry, 18);
    const vectorFc = construccionesVectorFc(construccionItems);
    const center = centroidFromGeometry(effectiveGeometry) ?? [-115.468278, 32.624639];

    const sources: Record<string, maplibregl.SourceSpecification> = {
      basemap: getBaseMapRasterSource(baseMap),
      highlight: { type: "geojson", data: fc },
      cuadro: { type: "geojson", data: cuadroMeas },
      "construcciones-vector": { type: "geojson", data: vectorFc },
      "free-measure": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
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

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: { version: 8, glyphs: MAPLIBRE_GLYPHS_URL, sources, layers },
      center,
      zoom: 18,
      attributionControl: false,
      interactive: true,
      fadeDuration: 0,
    });

    mapRef.current = map;

    const reveal = () => {
      if (mapBootKeyRef.current !== bootKey) return;
      baseMapAppliedRef.current = baseMap;
      fitMapToGeometry(map, effectiveGeometry);
      scheduleGeonodeRasterOpacity(
        map,
        geonodeLayers,
        visibleLayersRef.current,
        layerOpacityRef.current
      );
      setMapReady((n) => n + 1);
      setMapVisible(true);
    };

    map.on("mousemove", (e) => {
      setCursorLabel(
        `Lon: ${e.lngLat.lng.toFixed(6)} | Lat: ${e.lngLat.lat.toFixed(6)}`
      );
    });

    map.once("load", reveal);

    return () => {
      map.off("load", reveal);
      map.remove();
      mapRef.current = null;
      setMapVisible(false);
    };
  }, [clave, geometryKey, layerKey, wmsPath, geonodeLayers, effectiveGeometry, mapBootKey, baseMap]);

  const handleMapClick = useCallback(
    (e: maplibregl.MapMouseEvent) => {
      if (!measureEnabled || measureMode === "off") return;
      let pt: GeoJSON.Position = [e.lngLat.lng, e.lngLat.lat];
      if (snapEnabled) {
        pt = snapToNearestVertex(pt, snapPointsRef.current, 12);
      }
      onMeasurePointsChange([...measurePoints, pt]);
    },
    [measureEnabled, measureMode, snapEnabled, measurePoints, onMeasurePointsChange]
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [mapReady, handleMapClick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !hasSource(map, "construcciones-vector")) return;
    const src = map.getSource("construcciones-vector") as maplibregl.GeoJSONSource;
    src.setData(construccionesVectorFc(construccionItems));
  }, [construccionItems, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !effectiveGeometry) return;

    const updateCuadro = () => {
      if (!hasSource(map, "cuadro")) return;
      const zoom = map.getZoom();
      const src = map.getSource("cuadro") as maplibregl.GeoJSONSource;
      src.setData(buildCuadroMeasurements(effectiveGeometry, zoom));
    };

    updateCuadro();
    map.on("zoomend", updateCuadro);
    return () => {
      map.off("zoomend", updateCuadro);
    };
  }, [effectiveGeometry, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !hasSource(map, "free-measure")) return;
    const zoom = map.getZoom();
    const src = map.getSource("free-measure") as maplibregl.GeoJSONSource;
    if (measureHidden || !freeMeasureVisible) {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    src.setData(buildFreeMeasureDisplay(measurePoints, measureMode, zoom));
  }, [
    measurePoints,
    measureMode,
    measureHidden,
    freeMeasureVisible,
    mapReady,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (baseMapAppliedRef.current === baseMap) return;
    if (!hasSource(map, "basemap")) return;
    try {
      map.removeLayer("basemap");
      map.removeSource("basemap");
    } catch {
      return;
    }
    map.addSource("basemap", getBaseMapRasterSource(baseMap));
    map.addLayer(
      { id: "basemap", type: "raster", source: "basemap" },
      hasLayer(map, "constr-fill") ? "constr-fill" : undefined
    );
    baseMapAppliedRef.current = baseMap;
  }, [baseMap, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const apply = () => {
      applyGeonodeRasterOpacity(map, geonodeLayers, visibleLayers, layerOpacity);

      const hOp = highlightVisible ? highlightOpacity : 0;
      if (hasLayer(map, "highlight-fill")) {
        map.setPaintProperty("highlight-fill", "fill-opacity", hOp * SELECTED_MAP_FILL_OPACITY);
      }
      if (hasLayer(map, "highlight-halo")) map.setPaintProperty("highlight-halo", "line-opacity", hOp);
      if (hasLayer(map, "highlight-line")) map.setPaintProperty("highlight-line", "line-opacity", hOp);

      const cOp = cuadroVisible ? cuadroOpacity : 0;
      for (const id of ["cuadro-edges", "cuadro-vertices", "cuadro-cotas", "cuadro-vertex-labels"]) {
        if (!hasLayer(map, id)) continue;
        if (id === "cuadro-edges") map.setPaintProperty(id, "line-opacity", cOp);
        else if (id === "cuadro-vertices") map.setPaintProperty(id, "circle-opacity", cOp);
        else map.setPaintProperty(id, "text-opacity", cOp);
      }

      const vOp = vectorVisible ? vectorOpacity : 0;
      if (hasLayer(map, "constr-fill")) map.setPaintProperty("constr-fill", "fill-opacity", vOp * 0.35);
      if (hasLayer(map, "constr-line")) map.setPaintProperty("constr-line", "line-opacity", vOp);

      const fOp = freeMeasureVisible && !measureHidden ? freeMeasureOpacity : 0;
      for (const id of [
        "free-meas-edges",
        "free-meas-vertices",
        "free-meas-cotas",
        "free-meas-vertex-labels",
      ]) {
        if (!hasLayer(map, id)) continue;
        if (id === "free-meas-edges") map.setPaintProperty(id, "line-opacity", fOp);
        else if (id === "free-meas-vertices") map.setPaintProperty(id, "circle-opacity", fOp);
        else map.setPaintProperty(id, "text-opacity", fOp);
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
    cuadroVisible,
    cuadroOpacity,
    vectorVisible,
    vectorOpacity,
    freeMeasureVisible,
    freeMeasureOpacity,
    measureHidden,
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
    if (id === "measure-free") {
      return {
        id,
        title: layerTitle(id, geonodeLayers),
        role: "other",
        visible: freeMeasureVisible,
        opacity: freeMeasureOpacity,
      };
    }
    if (id === "construcciones-vector") {
      return {
        id,
        title: layerTitle(id, geonodeLayers),
        role: "construcciones",
        visible: vectorVisible,
        opacity: vectorOpacity,
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
    if (id === "measure-free") {
      setFreeMeasureVisible(on);
      return;
    }
    if (id === "construcciones-vector") {
      setVectorVisible(on);
      return;
    }
    setVisibleLayers((prev) => {
      const next = { ...prev, [id]: on };
      setLayerOpacity((op) => capColoniasOpacityWithPredios(next, op, geonodeLayers));
      return next;
    });
  }

  function setOpacity(id: FichaPlanoLayerId, value: number) {
    if (id === "highlight") {
      setHighlightOpacity(value);
      if (value > 0) setHighlightVisible(true);
      return;
    }
    if (id === "measure-free") {
      setFreeMeasureOpacity(value);
      if (value > 0) setFreeMeasureVisible(true);
      return;
    }
    if (id === "construcciones-vector") {
      setVectorOpacity(value);
      if (value > 0) setVectorVisible(true);
      return;
    }
    setLayerOpacity((prev) => {
      const next = { ...prev, [id]: value };
      return capColoniasOpacityWithPredios(visibleLayers, next, geonodeLayers);
    });
    if (value > 0) setVisibleLayers((prev) => ({ ...prev, [id]: true }));
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
      <div className="ficha-mini-map ficha-mini-map--empty">
        <p>
          {geometryClave && geometryClave !== clave
            ? "Actualizando geometría…"
            : "Sin geometría cartográfica para el cuadro de construcción."}
        </p>
      </div>
    );
  }

  return (
    <div className="ficha-mini-map-wrap ficha-construccion-map-wrap">
      <div className="ficha-mini-map-stage">
        <div
          ref={containerRef}
          className={`ficha-mini-map ficha-construccion-map${
            mapVisible ? " ficha-mini-map--ready" : " ficha-mini-map--loading"
          }${measureEnabled && measureMode !== "off" ? " ficha-construccion-map--measuring" : ""}`}
          aria-label="Medición cartográfica"
        />
        {measureEnabled && measureMode !== "off" && (
          <div className="ficha-medicion-panel" role="region" aria-label="Medición">
            <strong>Medición</strong>
            <p className="ficha-medicion-hint">Clic en el mapa para agregar vértices.</p>
          </div>
        )}
        <div className="ficha-construccion-coords">{cursorLabel}</div>
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
