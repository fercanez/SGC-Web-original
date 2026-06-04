import { getApiUrl } from "../config/apiUrl";

/**
 * URL de teselas WMS para MapLibre.
 * IMPORTANTE: {bbox-epsg-3857} NO debe URL-encodearse (MapLibre lo sustituye en runtime).
 */
export function buildGeonodeWmsTileUrl(
  proxyPath: string,
  layerName: string
): string {
  const base = `${getApiUrl()}${proxyPath}`;
  const layer = encodeURIComponent(layerName);
  return (
    `${base}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap` +
    `&FORMAT=image/png&TRANSPARENT=true&STYLES=` +
    `&LAYERS=${layer}&SRS=EPSG:3857` +
    `&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`
  );
}

export const OSM_RASTER_SOURCE = {
  type: "raster" as const,
  tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
  tileSize: 256,
  attribution: "© OpenStreetMap",
};

/** Imagen satélite (sustituto de Google Hybrid sin API key). */
export const SATELLITE_RASTER_SOURCE = {
  type: "raster" as const,
  tiles: [
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  ],
  tileSize: 256,
  attribution: "© Esri",
};
