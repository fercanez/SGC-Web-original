import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONFeatureCollection } from "../api";
import {
  buildGeonodeWmsTileUrl,
  OSM_RASTER_SOURCE,
  SATELLITE_RASTER_SOURCE,
} from "../map/wms";
import type { BaseMapId } from "./CadastralSidebar";
import {
  bboxFromFeatureCollection,
} from "../utils/geometry";
import {
  FISCAL_MAP_FILL,
  FISCAL_MAP_LINE,
  SELECTED_MAP_LINE,
  SELECTED_MAP_LINE_WIDTH,
  type FiscalStatus,
} from "../utils/fiscal";
import type { PublicConfig } from "../types/config";

/** Por encima de esto el visor usa solo capas WMS (evita congelar el navegador). */
const MAX_VECTOR_PARCELS = 8000;

export interface ActiveMapHighlight {
  geometry: GeoJSON.Geometry;
  fiscal: FiscalStatus;
  clave: string;
}

/** Ejecuta fit varias veces (idle + retrasos) para ganar a capas WMS y parcels. */
function scheduleMapFit(map: maplibregl.Map, fn: () => void) {
  const run = () => {
    try {
      fn();
    } catch {
      /* mapa destruido o sin bounds */
    }
  };
  const arm = () => {
    run();
    window.setTimeout(run, 120);
    window.setTimeout(run, 450);
    window.setTimeout(run, 900);
    map.once("idle", run);
  };
  if (map.isStyleLoaded()) {
    arm();
  } else {
    map.once("load", arm);
  }
}

function moveHighlightLayersToTop(map: maplibregl.Map) {
  const ids = [
    "search-highlight-fill",
    "search-highlight-line",
    "highlight-fill",
    "highlight-line",
    "active-highlight-fill",
    "active-highlight-line",
  ];
  for (const id of ids) {
    if (map.getLayer(id)) {
      try {
        map.moveLayer(id);
      } catch {
        /* capa ya arriba */
      }
    }
  }
}

interface Props {
  geojson: GeoJSONFeatureCollection | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  config: PublicConfig | null;
  /** Centrar mapa tras búsqueda en padrón (lon, lat). */
  flyTo?: { lng: number; lat: number; zoom?: number } | null;
  highlightLabel?: string | null;
  highlightFiscal?: FiscalStatus;
  /** Varios predios de la búsqueda (coloreados por adeudo). */
  searchHighlights?: GeoJSON.FeatureCollection | null;
  /** Incrementa al terminar de cargar geometrías de la búsqueda (dispara zoom a manzana). */
  mapFitNonce?: number;
  activeSearchClave?: string | null;
  /** Predio seleccionado encima de la manzana (color fiscal correcto). */
  activeHighlight?: ActiveMapHighlight | null;
  /** Visibilidad de capas WMS (control desde barra lateral). */
  visibleLayers?: Record<string, boolean>;
  layerOpacity?: Record<string, number>;
  layerOrder?: string[];
  baseMap?: BaseMapId;
  showLayerControl?: boolean;
}

export default function CadastralMap({
  geojson,
  selectedId,
  onSelect,
  config,
  flyTo,
  highlightLabel,
  highlightFiscal = "sin_adeudo",
  searchHighlights,
  mapFitNonce = 0,
  activeSearchClave,
  activeHighlight,
  visibleLayers: visibleLayersProp,
  layerOpacity = {},
  layerOrder,
  baseMap = "hybrid",
  showLayerControl = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const fitSeqRef = useRef(0);
  const [mapReady, setMapReady] = useState(0);
  const [internalLayers, setInternalLayers] = useState<Record<string, boolean>>({});
  const visibleLayers = visibleLayersProp ?? internalLayers;

  const center = config?.map.center ?? [-115.468278, 32.624639];
  const zoom = config?.map.zoom ?? 12;
  const geonodeLayers = config?.geonode.layers ?? [];
  const geonodeEnabled = config?.geonode.enabled ?? false;
  const wmsPath = config?.geonode.wms_proxy_path ?? "/api/v1/geonode/wms";

  useEffect(() => {
    if (!geonodeLayers.length || visibleLayersProp) return;
    setInternalLayers((prev) => {
      const next = { ...prev };
      for (const l of geonodeLayers) {
        if (next[l.id] === undefined) next[l.id] = true;
      }
      return next;
    });
  }, [geonodeLayers, visibleLayersProp]);

  const order =
    layerOrder?.length === geonodeLayers.length
      ? layerOrder
      : geonodeLayers.map((l) => l.id);
  const layerKey = [
    geonodeLayers.map((l) => l.layer).join("|"),
    baseMap,
    order.join(","),
  ].join(";");

  useEffect(() => {
    if (!containerRef.current) return;

    const sources: Record<string, maplibregl.SourceSpecification> = {};
    const layers: maplibregl.LayerSpecification[] = [];

    sources.basemap =
      baseMap === "hybrid" ? SATELLITE_RASTER_SOURCE : OSM_RASTER_SOURCE;
    layers.push({
      id: "basemap",
      type: "raster",
      source: "basemap",
    });

    const ordered = order
      .map((id) => geonodeLayers.find((l) => l.id === id))
      .filter(Boolean) as typeof geonodeLayers;

    for (const gl of ordered) {
      const srcId = `geonode-${gl.id}`;
      sources[srcId] = {
        type: "raster",
        tiles: [buildGeonodeWmsTileUrl(wmsPath, gl.layer)],
        tileSize: 256,
        attribution: gl.title,
      };
      layers.push({
        id: srcId,
        type: "raster",
        source: srcId,
        layout: { visibility: "visible" },
        paint: { "raster-opacity": layerOpacity[gl.id] ?? 1 },
      });
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources,
        layers,
      },
      center: center as [number, number],
      zoom,
    });

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    mapRef.current = map;
    const onReady = () => setMapReady((n) => n + 1);
    map.once("load", onReady);
    if (map.isStyleLoaded()) onReady();

    return () => {
      map.off("load", onReady);
      map.remove();
      mapRef.current = null;
    };
    // layerKey ya codifica capas + orden + mapa base; center/zoom/opacity se leen
    // al crear y se actualizan en efectos aparte. Evita recrear el mapa en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerKey, wmsPath]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const gl of geonodeLayers) {
      const layerId = `geonode-${gl.id}`;
      if (!map.getLayer(layerId)) continue;
      map.setLayoutProperty(
        layerId,
        "visibility",
        visibleLayers[gl.id] ? "visible" : "none"
      );
      map.setPaintProperty(
        layerId,
        "raster-opacity",
        layerOpacity[gl.id] ?? 1
      );
    }
  }, [visibleLayers, layerOpacity, geonodeLayers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || order.length < 2) return;
    const run = () => {
      let beforeId: string | undefined;
      for (const id of order) {
        const layerId = `geonode-${id}`;
        if (!map.getLayer(layerId)) continue;
        if (beforeId) {
          try {
            map.moveLayer(layerId, beforeId);
          } catch {
            /* capa ya en posición */
          }
        }
        beforeId = layerId;
      }
    };
    if (map.isStyleLoaded()) run();
    else map.once("load", run);
  }, [order]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geojson) return;

    const apply = () => {
      if (geojson.features.length > MAX_VECTOR_PARCELS) {
        if (map.getLayer("parcels-fill")) {
          map.removeLayer("parcels-fill");
          map.removeLayer("parcels-line");
          map.removeSource("parcels");
        }
        return;
      }

      if (map.getSource("parcels")) {
        (map.getSource("parcels") as maplibregl.GeoJSONSource).setData(geojson);
      } else {
        map.addSource("parcels", { type: "geojson", data: geojson });
        map.addLayer({
          id: "parcels-fill",
          type: "fill",
          source: "parcels",
          paint: {
            "fill-color": [
              "case",
              ["==", ["get", "status"], "activo"],
              "#e85d04",
              "#8b9cb3",
            ],
            "fill-opacity": 0.5,
          },
        });
        map.addLayer({
          id: "parcels-line",
          type: "line",
          source: "parcels",
          paint: {
            "line-color": "#bc4749",
            "line-width": 2,
          },
        });

        map.on("click", "parcels-fill", (e) => {
          const f = e.features?.[0];
          const id = f?.properties?.id as string | undefined;
          if (id) onSelect(id);
        });
        map.on("mouseenter", "parcels-fill", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "parcels-fill", () => {
          map.getCanvas().style.cursor = "";
        });
      }

      const skipParcelFit =
        !!activeHighlight?.geometry ||
        (searchHighlights?.features?.length ?? 0) > 0;
      if (!skipParcelFit && geojson.features.length <= 500) {
        const bounds = new maplibregl.LngLatBounds();
        let hasBounds = false;
        for (const f of geojson.features) {
          if (
            f.geometry?.type === "Polygon" ||
            f.geometry?.type === "MultiPolygon"
          ) {
            const coords =
              f.geometry.type === "Polygon"
                ? f.geometry.coordinates[0]
                : f.geometry.coordinates[0][0];
            for (const c of coords) {
              bounds.extend(c as [number, number]);
              hasBounds = true;
            }
          }
        }
        if (hasBounds) {
          map.fitBounds(bounds, { padding: 48, maxZoom: 17 });
        }
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [geojson, onSelect, layerKey, activeHighlight, searchHighlights]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("parcels-line")) return;

    map.setPaintProperty("parcels-line", "line-width", [
      "case",
      ["==", ["get", "id"], selectedId ?? ""],
      4,
      2,
    ]);
    map.setPaintProperty("parcels-fill", "fill-opacity", [
      "case",
      ["==", ["get", "id"], selectedId ?? ""],
      0.72,
      0.5,
    ]);
  }, [selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTo) return;
    const doFly = () => {
      try {
        map.flyTo({
          center: [flyTo.lng, flyTo.lat],
          zoom: flyTo.zoom ?? 18,
          duration: 800,
          essential: true,
        });
      } catch {
        /* mapa aún sin estilo */
      }
    };
    if (map.isStyleLoaded()) doFly();
    else map.once("load", doFly);
    const t1 = window.setTimeout(doFly, 200);
    const t2 = window.setTimeout(doFly, 600);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [flyTo, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const clearSearchLayers = () => {
      if (map.getLayer("search-highlight-line")) {
        map.removeLayer("search-highlight-line");
        map.removeLayer("search-highlight-fill");
        map.removeSource("search-highlights");
      }
    };

    const apply = () => {
      if (!searchHighlights?.features?.length) {
        clearSearchLayers();
        return;
      }

      const data = searchHighlights;
      if (map.getSource("search-highlights")) {
        (map.getSource("search-highlights") as maplibregl.GeoJSONSource).setData(
          data
        );
      } else {
        map.addSource("search-highlights", { type: "geojson", data });
        map.addLayer({
          id: "search-highlight-fill",
          type: "fill",
          source: "search-highlights",
          paint: {
            "fill-color": [
              "match",
              ["get", "fiscal"],
              "con_adeudo",
              FISCAL_MAP_FILL.con_adeudo,
              FISCAL_MAP_FILL.sin_adeudo,
            ],
            "fill-opacity": [
              "case",
              ["==", ["get", "clave"], activeSearchClave ?? ""],
              0,
              0.5,
            ],
          },
        });
        map.addLayer({
          id: "search-highlight-line",
          type: "line",
          source: "search-highlights",
          paint: {
            "line-color": [
              "match",
              ["get", "fiscal"],
              "con_adeudo",
              FISCAL_MAP_LINE.con_adeudo,
              FISCAL_MAP_LINE.sin_adeudo,
            ],
            "line-width": [
              "case",
              ["==", ["get", "clave"], activeSearchClave ?? ""],
              0,
              2.5,
            ],
          },
        });
      }

      if (map.getLayer("search-highlight-line")) {
        /* El predio seleccionado se atenúa aquí (relleno y línea ocultos):
           su contorno azul sólido lo dibuja SOLO la capa active-highlight,
           que se reemplaza atómicamente y nunca deja resaltado el anterior. */
        map.setPaintProperty("search-highlight-fill", "fill-opacity", [
          "case",
          ["==", ["get", "clave"], activeSearchClave ?? ""],
          0,
          0.5,
        ]);
        map.setPaintProperty("search-highlight-line", "line-width", [
          "case",
          ["==", ["get", "clave"], activeSearchClave ?? ""],
          0,
          2.5,
        ]);
      }
      moveHighlightLayersToTop(map);
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [searchHighlights, activeSearchClave, activeHighlight, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const clearActive = () => {
      if (map.getLayer("active-highlight-line")) {
        map.removeLayer("active-highlight-line");
        map.removeLayer("active-highlight-fill");
        map.removeSource("active-highlight");
      }
    };

    const applyActive = () => {
      if (!activeHighlight?.geometry) {
        clearActive();
        return;
      }

      const fill = FISCAL_MAP_FILL[activeHighlight.fiscal];
      const fc: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              clave: activeHighlight.clave,
              fiscal: activeHighlight.fiscal,
            },
            geometry: activeHighlight.geometry,
          },
        ],
      };

      if (map.getSource("active-highlight")) {
        (map.getSource("active-highlight") as maplibregl.GeoJSONSource).setData(
          fc
        );
        map.setPaintProperty("active-highlight-fill", "fill-color", fill);
        map.setPaintProperty("active-highlight-line", "line-color", SELECTED_MAP_LINE);
        map.setPaintProperty(
          "active-highlight-line",
          "line-width",
          SELECTED_MAP_LINE_WIDTH
        );
      } else {
        map.addSource("active-highlight", { type: "geojson", data: fc });
        map.addLayer({
          id: "active-highlight-fill",
          type: "fill",
          source: "active-highlight",
          paint: {
            "fill-color": fill,
            "fill-opacity": 0.58,
          },
        });
        map.addLayer({
          id: "active-highlight-line",
          type: "line",
          source: "active-highlight",
          paint: {
            "line-color": SELECTED_MAP_LINE,
            "line-width": SELECTED_MAP_LINE_WIDTH,
          },
        });
      }
      moveHighlightLayersToTop(map);
    };

    if (map.isStyleLoaded()) applyActive();
    else map.once("load", applyActive);
    /* Reintentos: el estilo puede no estar listo justo al seleccionar. */
    const t1 = window.setTimeout(applyActive, 200);
    const t2 = window.setTimeout(applyActive, 600);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [activeHighlight, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const validBounds = (
      bbox: [[number, number], [number, number]] | null
    ): bbox is [[number, number], [number, number]] => {
      if (!bbox) return false;
      const [[west, south], [east, north]] = bbox;
      return (
        Math.abs(west) <= 180 &&
        Math.abs(east) <= 180 &&
        Math.abs(south) <= 90 &&
        Math.abs(north) <= 90
      );
    };

    /* El predio seleccionado lo centra el efecto flyTo (mapFlyTo).
       Aquí solo encuadramos la manzana cuando NO hay predio seleccionado. */
    if (activeHighlight?.geometry) return;

    const mySeq = ++fitSeqRef.current;
    const runFit = () => {
      if (mySeq !== fitSeqRef.current) return;
      if (activeHighlight?.geometry) return;
      if (searchHighlights?.features?.length) {
        const bbox = bboxFromFeatureCollection(searchHighlights);
        if (validBounds(bbox)) {
          map.fitBounds(bbox, { padding: 60, maxZoom: 17.5, duration: 700 });
        }
      }
    };

    scheduleMapFit(map, runFit);
  }, [searchHighlights, activeHighlight, mapFitNonce, mapReady]);

  return (
    <div className="map-root">
      {showLayerControl && geonodeLayers.length > 0 && (
        <div className="layer-control">
          <span className="layer-control-title">Capas GeoNode</span>
          {geonodeLayers.map((gl) => (
            <label key={gl.id} className="layer-toggle">
              <input
                type="checkbox"
                checked={visibleLayers[gl.id] ?? true}
                onChange={(e) =>
                  setInternalLayers((v) => ({
                    ...v,
                    [gl.id]: e.target.checked,
                  }))
                }
              />
              {gl.title}
            </label>
          ))}
        </div>
      )}
      <div ref={containerRef} className="map-container" />
    </div>
  );
}
