import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getBaseMapRasterSource } from "../map/wms";
import { bboxFromGeometry, centroidFromGeometry } from "../utils/geometry";
import {
  SELECTED_MAP_FILL_OPACITY,
  SELECTED_MAP_HALO,
  SELECTED_MAP_HALO_WIDTH,
  SELECTED_MAP_LINE,
  SELECTED_MAP_LINE_WIDTH,
} from "../utils/fiscal";

interface Props {
  clave: string;
  geometry: GeoJSON.Geometry | null;
}

export default function FichaMiniMap({ clave, geometry }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

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

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          basemap: getBaseMapRasterSource("googleHybrid"),
          highlight: { type: "geojson", data: fc },
        },
        layers: [
          { id: "basemap", type: "raster", source: "basemap" },
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
          },
        ],
      },
      center: centroidFromGeometry(geometry) ?? [-115.468278, 32.624639],
      zoom: 17,
      attributionControl: false,
      interactive: true,
    });

    mapRef.current = map;
    map.once("load", () => {
      const bbox = bboxFromGeometry(geometry);
      if (bbox) {
        map.fitBounds(bbox, { padding: 28, maxZoom: 19, duration: 0 });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [clave, geometry]);

  if (!geometry) {
    return (
      <div className="ficha-mini-map ficha-mini-map--empty">
        <p>Sin geometría cartográfica para este predio.</p>
      </div>
    );
  }

  return <div ref={containerRef} className="ficha-mini-map" aria-label="Localización cartográfica" />;
}
