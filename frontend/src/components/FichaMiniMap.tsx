import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildGeonodeWmsTileUrl, getBaseMapRasterSource } from "../map/wms";
import { bboxFromGeometry, centroidFromGeometry } from "../utils/geometry";
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
  wmsStackOrder,
} from "../config/mapLayers";
import type { GeonodeLayer } from "../types/config";

interface Props {
  clave: string;
  geometry: GeoJSON.Geometry | null;
  geonodeLayers: GeonodeLayer[];
  wmsPath: string;
}

function hasLayer(map: maplibregl.Map, id: string): boolean {
  try {
    return Boolean(map.getLayer(id));
  } catch {
    return false;
  }
}

function restackMiniMapLayers(map: maplibregl.Map, layers: GeonodeLayer[]) {
  const stackIds = wmsStackOrder(layers).map((l) => `geonode-${l.id}`);
  const highlightIds = [
    "highlight-fill",
    "highlight-halo",
    "highlight-line",
  ];
  let anchor: string | undefined;
  for (const id of highlightIds) {
    if (hasLayer(map, id)) {
      anchor = id;
      break;
    }
  }
  for (let i = stackIds.length - 1; i >= 0; i--) {
    const layerId = stackIds[i];
    if (!hasLayer(map, layerId)) continue;
    try {
      if (anchor) map.moveLayer(layerId, anchor);
      else map.moveLayer(layerId);
    } catch {
      /* ya en posición */
    }
    anchor = layerId;
  }
  for (const id of highlightIds) {
    if (hasLayer(map, id)) {
      try {
        map.moveLayer(id);
      } catch {
        /* */
      }
    }
  }
}

export default function FichaMiniMap({
  clave,
  geometry,
  geonodeLayers,
  wmsPath,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(0);

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

  useEffect(() => {
    setVisibleLayers(initialVisible);
    setLayerOpacity(initialOpacity);
  }, [initialVisible, initialOpacity, clave]);

  const layerKey = geonodeLayers.map((l) => l.layer).join("|");

  useEffect(() => {
    if (!containerRef.current || !geometry) return;

    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { clave },
          geometry,
        },
      ],
    };

    const sources: Record<string, maplibregl.SourceSpecification> = {
      basemap: getBaseMapRasterSource("googleHybrid"),
      highlight: { type: "geojson", data: fc },
    };
    const layers: maplibregl.LayerSpecification[] = [
      { id: "basemap", type: "raster", source: "basemap" },
    ];

    for (const gl of wmsStackOrder(geonodeLayers)) {
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
          "fill-color": "rgba(0, 0, 255, 0.12)",
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
        },
      }
    );

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: { version: 8, sources, layers },
      center: centroidFromGeometry(geometry) ?? [-115.468278, 32.624639],
      zoom: 17,
      attributionControl: false,
      interactive: true,
    });

    mapRef.current = map;
    const onReady = () => {
      setMapReady((n) => n + 1);
      const bbox = bboxFromGeometry(geometry);
      if (bbox) {
        map.fitBounds(bbox, { padding: 32, maxZoom: 19, duration: 0 });
      }
      restackMiniMapLayers(map, geonodeLayers);
    };
    map.once("load", onReady);
    if (map.isStyleLoaded()) onReady();

    return () => {
      map.off("load", onReady);
      map.remove();
      mapRef.current = null;
    };
  }, [clave, geometry, layerKey, wmsPath, geonodeLayers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const apply = () => {
      for (const gl of geonodeLayers) {
        const layerId = `geonode-${gl.id}`;
        if (!hasLayer(map, layerId)) continue;
        const op = visibleLayers[gl.id]
          ? (layerOpacity[gl.id] ?? 1)
          : 0;
        map.setPaintProperty(layerId, "raster-opacity", op);
      }
      restackMiniMapLayers(map, geonodeLayers);
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [visibleLayers, layerOpacity, geonodeLayers, mapReady]);

  function toggleLayer(id: string, on: boolean) {
    setVisibleLayers((prev) => {
      const next = { ...prev, [id]: on };
      setLayerOpacity((op) =>
        capColoniasOpacityWithPredios(next, op, geonodeLayers)
      );
      return next;
    });
  }

  if (!geometry) {
    return (
      <div className="ficha-mini-map ficha-mini-map--empty">
        <p>Sin geometría cartográfica para este predio.</p>
      </div>
    );
  }

  return (
    <div className="ficha-mini-map-wrap">
      <div
        ref={containerRef}
        className="ficha-mini-map"
        aria-label="Localización cartográfica"
      />
      {geonodeLayers.length > 0 && (
        <div className="ficha-mini-map-layers" aria-label="Capas WMS">
          {geonodeLayers.map((gl) => {
            const pct = Math.round((layerOpacity[gl.id] ?? 1) * 100);
            return (
              <label key={gl.id} className="ficha-mini-layer-item">
                <input
                  type="checkbox"
                  checked={visibleLayers[gl.id] ?? false}
                  onChange={(e) => toggleLayer(gl.id, e.target.checked)}
                />
                <span>{gl.title}</span>
                {visibleLayers[gl.id] && (
                  <span className="ficha-mini-layer-pct">{pct}%</span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
