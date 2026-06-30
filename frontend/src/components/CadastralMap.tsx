import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONFeatureCollection } from "../api";
import {
  buildGeonodeWmsTileUrl,
  getBaseMapRasterSource,
  MAPLIBRE_GLYPHS_URL,
} from "../map/wms";
import type { BaseMapId } from "./CadastralSidebar";
import {
  bboxFromFeatureCollection,
  bboxFromGeometry,
  centroidFromGeometry,
} from "../utils/geometry";
import {
  FISCAL_MAP_FILL_RGB,
  FISCAL_MAP_LINE,
  SEARCH_MANZANA_FILL_OPACITY,
  SELECTED_MAP_LINE,
  SELECTED_MAP_LINE_WIDTH,
  SELECTED_MAP_HALO,
  SELECTED_MAP_HALO_WIDTH,
  SELECTED_MAP_FILL_OPACITY,
  type FiscalStatus,
} from "../utils/fiscal";
import type { MapFitPadding } from "../utils/mapViewport";
import { normalizeCadastralCode } from "../utils/geometry";
import { PREDIOS_WMS_NEAR_ZOOM, wmsStackIds, wmsStackOrder } from "../config/mapLayers";
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
const SEARCH_LABEL_FONT = ["Open Sans Regular", "Arial Unicode MS Regular"];

function hasLayer(map: maplibregl.Map | null | undefined, id: string): boolean {
  try {
    if (!map) return false;
    return Boolean(map.getLayer(id));
  } catch {
    return false;
  }
}

function restackWmsLayers(map: maplibregl.Map, layers: PublicConfig["geonode"]["layers"]) {
  const stackIds = wmsStackIds(layers);
  const highlightIds = [
    "search-highlight-fill",
    "search-highlight-line",
    "search-highlight-labels",
    "active-highlight-fill",
    "active-highlight-halo",
    "active-highlight-line",
  ];
  let anchor: string | undefined;
  for (const id of highlightIds) {
    if (hasLayer(map, id)) {
      anchor = id;
      break;
    }
  }

  // Apilar colonias → predios justo debajo de los vectores (predios WMS encima de colonias).
  for (let i = stackIds.length - 1; i >= 0; i--) {
    const layerId = `geonode-${stackIds[i]}`;
    if (!hasLayer(map, layerId)) continue;
    try {
      if (anchor) map.moveLayer(layerId, anchor);
      else map.moveLayer(layerId);
    } catch {
      /* capa ya en posición */
    }
    anchor = layerId;
  }
  moveHighlightLayersToTop(map);
}

function moveHighlightLayersToTop(map: maplibregl.Map) {
  const ids = [
    "search-highlight-fill",
    "search-highlight-line",
    "search-highlight-labels",
    "active-highlight-fill",
    "active-highlight-halo",
    "active-highlight-line",
  ];
  for (const id of ids) {
    if (hasLayer(map, id)) {
      try {
        map.moveLayer(id);
      } catch {
        /* capa ya arriba */
      }
    }
  }
}

function selectedClaveMatch(
  activeClave: string | null | undefined
): maplibregl.ExpressionSpecification {
  const norm = (activeClave ?? "").trim().toUpperCase();
  if (!norm) return ["literal", false];
  return [
    "any",
    ["==", ["get", "clave"], norm],
    ["==", ["get", "clave_norm"], norm],
  ];
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
  /** Colorea resultados de búsqueda por adeudo (verde/rojo/amarillo). */
  fiscalThematic?: boolean;
  /** Padding al encuadrar predio / manzana (panel izq. + tabla inferior). */
  fitPadding?: MapFitPadding;
  /** Predios WMS al 75% solo cuando zoom >= umbral y hay predio activo. */
  onPredioWmsProximity?: (near: boolean) => void;
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
  baseMap = "googleHybrid",
  showLayerControl = false,
  fiscalThematic = false,
  fitPadding,
  onPredioWmsProximity,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const claveMarkerRef = useRef<maplibregl.Marker | null>(null);
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
        if (next[l.id] === undefined) next[l.id] = false;
      }
      return next;
    });
  }, [geonodeLayers, visibleLayersProp]);

  const layerKey = [
    geonodeLayers.map((l) => l.layer).join("|"),
    baseMap,
  ].join(";");

  useEffect(() => {
    if (!containerRef.current) return;

    const sources: Record<string, maplibregl.SourceSpecification> = {};
    const layers: maplibregl.LayerSpecification[] = [];

    sources.basemap = getBaseMapRasterSource(baseMap);
    layers.push({
      id: "basemap",
      type: "raster",
      source: "basemap",
    });

    for (const gl of wmsStackOrder(geonodeLayers)) {
      const srcId = `geonode-${gl.id}`;
      const wmsOp = visibleLayers[gl.id]
        ? (layerOpacity[gl.id] ?? 1)
        : 0;
      sources[srcId] = {
        type: "raster",
        tiles: [buildGeonodeWmsTileUrl(wmsPath, gl.layer)],
        tileSize: 256,
        attribution: wmsOp > 0 ? gl.title : "",
      };
      layers.push({
        id: srcId,
        type: "raster",
        source: srcId,
        layout: { visibility: "visible" },
        paint: { "raster-opacity": wmsOp },
      });
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        glyphs: MAPLIBRE_GLYPHS_URL,
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
    if (!map || !mapReady) return;

    const applyVisibility = () => {
      for (const gl of geonodeLayers) {
        const layerId = `geonode-${gl.id}`;
        if (!hasLayer(map, layerId)) continue;
        const wmsOp = visibleLayers[gl.id]
          ? (layerOpacity[gl.id] ?? 1)
          : 0;
        map.setLayoutProperty(layerId, "visibility", "visible");
        map.setPaintProperty(layerId, "raster-opacity", wmsOp);
      }
      restackWmsLayers(map, geonodeLayers);
      map.triggerRepaint();
    };

    if (map.isStyleLoaded()) applyVisibility();
    else map.once("load", applyVisibility);
    map.triggerRepaint();
  }, [visibleLayers, layerOpacity, geonodeLayers, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geonodeLayers.length) return;
    const run = () => restackWmsLayers(map, geonodeLayers);
    if (map.isStyleLoaded()) run();
    else map.once("load", run);
  }, [geonodeLayers, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geojson) return;

    const apply = () => {
      if (geojson.features.length > MAX_VECTOR_PARCELS) {
        if (hasLayer(map, "parcels-fill")) {
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
    if (!map || !hasLayer(map, "parcels-line")) return;

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
      if (hasLayer(map, "search-highlight-labels")) {
        map.removeLayer("search-highlight-labels");
      }
      if (hasLayer(map,"search-highlight-line")) {
        map.removeLayer("search-highlight-line");
        map.removeLayer("search-highlight-fill");
        map.removeSource("search-highlights");
      }
    };

    const hideSelected = selectedClaveMatch(activeSearchClave);
    const showFiscalManzana =
      fiscalThematic && Boolean(searchHighlights?.features?.length);

    const apply = () => {
      if (!searchHighlights?.features?.length) {
        clearSearchLayers();
        return;
      }

      const fiscalFill: maplibregl.ExpressionSpecification = [
        "match",
        ["get", "fiscal"],
        "con_adeudo",
        FISCAL_MAP_FILL_RGB.con_adeudo,
        "sin_dato",
        FISCAL_MAP_FILL_RGB.sin_dato,
        FISCAL_MAP_FILL_RGB.sin_adeudo,
      ];
      const fiscalLine: maplibregl.ExpressionSpecification = [
        "match",
        ["get", "fiscal"],
        "con_adeudo",
        FISCAL_MAP_LINE.con_adeudo,
        "sin_dato",
        FISCAL_MAP_LINE.sin_dato,
        FISCAL_MAP_LINE.sin_adeudo,
      ];

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
            "fill-color": showFiscalManzana
              ? fiscalFill
              : "rgba(11,61,145,0.18)",
            "fill-opacity": [
              "case",
              hideSelected,
              0,
              SEARCH_MANZANA_FILL_OPACITY,
            ],
          },
        });
        map.addLayer({
          id: "search-highlight-line",
          type: "line",
          source: "search-highlights",
          paint: {
            "line-color": showFiscalManzana ? fiscalLine : "#0b3d91",
            "line-width": [
              "case",
              hideSelected,
              0,
              showFiscalManzana ? 2.5 : 1.5,
            ],
            "line-opacity": [
              "case",
              hideSelected,
              0,
              0.92,
            ],
          },
        });
        map.addLayer({
          id: "search-highlight-labels",
          type: "symbol",
          source: "search-highlights",
          layout: {
            "text-field": ["get", "clave"],
            "text-font": SEARCH_LABEL_FONT,
            "text-size": 12,
            "text-letter-spacing": 0.04,
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          },
          paint: {
            "text-color": "#111111",
            "text-halo-color": "#ffffff",
            "text-halo-width": 2.5,
            "text-opacity": [
              "case",
              hideSelected,
              0,
              1,
            ],
          },
        });
      }

      if (hasLayer(map,"search-highlight-line")) {
        map.setPaintProperty(
          "search-highlight-fill",
          "fill-color",
          showFiscalManzana ? fiscalFill : "rgba(11,61,145,0.18)"
        );
        map.setPaintProperty(
          "search-highlight-line",
          "line-color",
          showFiscalManzana ? fiscalLine : "#0b3d91"
        );
        /* El predio seleccionado se atenúa aquí (relleno y línea ocultos):
           su contorno azul sólido lo dibuja SOLO la capa active-highlight,
           que se reemplaza atómicamente y nunca deja resaltado el anterior. */
        map.setPaintProperty("search-highlight-fill", "fill-opacity", [
          "case",
          hideSelected,
          0,
          SEARCH_MANZANA_FILL_OPACITY,
        ]);
        map.setPaintProperty("search-highlight-line", "line-width", [
          "case",
          hideSelected,
          0,
          showFiscalManzana ? 2.5 : 1.5,
        ]);
        map.setPaintProperty("search-highlight-line", "line-opacity", [
          "case",
          hideSelected,
          0,
          0.92,
        ]);
        if (!hasLayer(map, "search-highlight-labels")) {
          map.addLayer({
            id: "search-highlight-labels",
            type: "symbol",
            source: "search-highlights",
            layout: {
              "text-field": ["get", "clave"],
              "text-font": SEARCH_LABEL_FONT,
              "text-size": 12,
              "text-letter-spacing": 0.04,
              "text-allow-overlap": true,
              "text-ignore-placement": true,
            },
            paint: {
              "text-color": "#111111",
              "text-halo-color": "#ffffff",
              "text-halo-width": 2.5,
              "text-opacity": [
                "case",
                hideSelected,
                0,
                1,
              ],
            },
          });
        } else {
          map.setPaintProperty("search-highlight-labels", "text-opacity", [
            "case",
            hideSelected,
            0,
            1,
          ]);
        }
      }
      restackWmsLayers(map, geonodeLayers);
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [searchHighlights, activeSearchClave, activeHighlight, mapReady, fiscalThematic, geonodeLayers]);

  function updateClaveMarker(map: maplibregl.Map, clave: string, geometry: GeoJSON.Geometry) {
    claveMarkerRef.current?.remove();
    claveMarkerRef.current = null;

    const center = centroidFromGeometry(geometry);
    if (!center || Math.abs(center[0]) > 180 || Math.abs(center[1]) > 90) return;

    const el = document.createElement("div");
    el.className = "cm-map-clave-label";
    el.textContent = clave;
    claveMarkerRef.current = new maplibregl.Marker({
      element: el,
      anchor: "center",
    })
      .setLngLat(center as [number, number])
      .addTo(map);
  }

  function clearActiveHighlight(map: maplibregl.Map) {
    claveMarkerRef.current?.remove();
    claveMarkerRef.current = null;
    if (hasLayer(map, "active-highlight-line")) {
      map.removeLayer("active-highlight-line");
      map.removeLayer("active-highlight-halo");
      map.removeLayer("active-highlight-fill");
      map.removeSource("active-highlight");
    }
  }

  function ensureActiveHighlightLayers(
    map: maplibregl.Map,
    fc: GeoJSON.FeatureCollection,
    fill: string
  ) {
    if (!map.getSource("active-highlight")) {
      map.addSource("active-highlight", { type: "geojson", data: fc });
      map.addLayer({
        id: "active-highlight-fill",
        type: "fill",
        source: "active-highlight",
        paint: {
          "fill-color": fill,
          "fill-opacity": SELECTED_MAP_FILL_OPACITY,
        },
      });
      map.addLayer({
        id: "active-highlight-halo",
        type: "line",
        source: "active-highlight",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": SELECTED_MAP_HALO,
          "line-width": SELECTED_MAP_HALO_WIDTH,
          "line-opacity": 1,
        },
      });
      map.addLayer({
        id: "active-highlight-line",
        type: "line",
        source: "active-highlight",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": SELECTED_MAP_LINE,
          "line-width": SELECTED_MAP_LINE_WIDTH,
          "line-opacity": 1,
        },
      });
      return;
    }

    (map.getSource("active-highlight") as maplibregl.GeoJSONSource).setData(fc);
    map.setPaintProperty("active-highlight-fill", "fill-color", fill);
    map.setPaintProperty("active-highlight-fill", "fill-opacity", SELECTED_MAP_FILL_OPACITY);
    map.setPaintProperty("active-highlight-halo", "line-color", SELECTED_MAP_HALO);
    map.setPaintProperty("active-highlight-halo", "line-width", SELECTED_MAP_HALO_WIDTH);
    map.setPaintProperty("active-highlight-line", "line-color", SELECTED_MAP_LINE);
    map.setPaintProperty("active-highlight-line", "line-width", SELECTED_MAP_LINE_WIDTH);
    map.setPaintProperty("active-highlight-line", "line-opacity", 1);
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const clearActive = () => {
      clearActiveHighlight(map);
    };

    const applyActive = () => {
      if (!activeHighlight?.geometry) {
        clearActive();
        return;
      }

      const fill = FISCAL_MAP_FILL_RGB[activeHighlight.fiscal];
      const claveNorm = normalizeCadastralCode(activeHighlight.clave);
      const fc: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              clave: activeHighlight.clave,
              clave_norm: claveNorm,
              fiscal: activeHighlight.fiscal,
            },
            geometry: activeHighlight.geometry,
          },
        ],
      };

      ensureActiveHighlightLayers(map, fc, fill);
      updateClaveMarker(map, activeHighlight.clave, activeHighlight.geometry);
      restackWmsLayers(map, geonodeLayers);
    };

    if (map.isStyleLoaded()) applyActive();
    else map.once("load", applyActive);
    /* Reintentos: el estilo puede no estar listo justo al seleccionar. */
    const t1 = window.setTimeout(applyActive, 200);
    const t2 = window.setTimeout(applyActive, 600);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      claveMarkerRef.current?.remove();
      claveMarkerRef.current = null;
    };
  }, [activeHighlight, mapReady, geonodeLayers]);

  useEffect(() => {
    return () => {
      claveMarkerRef.current?.remove();
      claveMarkerRef.current = null;
    };
  }, []);

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

    /* Encuadre del predio seleccionado (más arriba, sin tapar con la tabla). */
    if (activeHighlight?.geometry && fitPadding) {
      const bbox = bboxFromGeometry(activeHighlight.geometry);
      if (validBounds(bbox)) {
        map.fitBounds(bbox, {
          padding: fitPadding,
          maxZoom: 18,
          duration: 700,
        });
        map.once("moveend", () => {
          if (map.getZoom() < PREDIOS_WMS_NEAR_ZOOM) {
            map.easeTo({ zoom: PREDIOS_WMS_NEAR_ZOOM, duration: 450 });
            map.once("moveend", () => onPredioWmsProximity?.(true));
          } else {
            onPredioWmsProximity?.(true);
          }
        });
        return;
      }
    }

    const mySeq = ++fitSeqRef.current;
    const runFit = () => {
      if (mySeq !== fitSeqRef.current) return;
      if (activeHighlight?.geometry) return;
      if (searchHighlights?.features?.length) {
        const bbox = bboxFromFeatureCollection(searchHighlights);
        if (validBounds(bbox)) {
          map.fitBounds(bbox, {
            padding: fitPadding ?? 60,
            maxZoom: 17.5,
            duration: 700,
          });
          map.once("moveend", () => {
            onPredioWmsProximity?.(map.getZoom() >= PREDIOS_WMS_NEAR_ZOOM);
          });
        }
      }
    };

    scheduleMapFit(map, runFit);
  }, [searchHighlights, activeHighlight, mapFitNonce, mapReady, fitPadding, onPredioWmsProximity]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !onPredioWmsProximity) return;

    const onZoom = () => {
      const hasContext =
        Boolean(activeHighlight?.geometry) ||
        Boolean(searchHighlights?.features?.length);
      if (!hasContext) return;
      onPredioWmsProximity(map.getZoom() >= PREDIOS_WMS_NEAR_ZOOM);
    };

    map.on("zoomend", onZoom);
    if (activeHighlight?.geometry || searchHighlights?.features?.length) {
      onPredioWmsProximity(map.getZoom() >= PREDIOS_WMS_NEAR_ZOOM);
    }
    return () => {
      map.off("zoomend", onZoom);
    };
  }, [activeHighlight, searchHighlights, mapReady, onPredioWmsProximity]);

  return (
    <div className="map-root">
      {showLayerControl && geonodeLayers.length > 0 && (
        <div className="layer-control">
          <span className="layer-control-title">Capas GeoNode</span>
          {geonodeLayers.map((gl) => (
            <label key={gl.id} className="layer-toggle">
              <input
                type="checkbox"
                checked={visibleLayers[gl.id] ?? false}
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
