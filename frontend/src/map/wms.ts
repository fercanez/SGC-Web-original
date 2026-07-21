import { getApiUrl } from "../config/apiUrl";
import type { BaseMapId } from "../components/CadastralSidebar";

/**
 * URL de teselas WMS para MapLibre.
 * IMPORTANTE: {bbox-epsg-3857} NO debe URL-encodearse (MapLibre lo sustituye en runtime).
 */
export function buildGeonodeWmsTileUrl(
  proxyPath: string,
  layerName: string
): string {
  const base = proxyPath.startsWith("/") ? proxyPath : `${getApiUrl()}/${proxyPath}`;
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

export const ESRI_SATELLITE_RASTER_SOURCE = {
  type: "raster" as const,
  tiles: [
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  ],
  tileSize: 256,
  attribution: "© Esri",
};

/** Google Satellite (misma URL que SGC maduro). */
export const GOOGLE_SATELLITE_RASTER_SOURCE = {
  type: "raster" as const,
  tiles: ["https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"],
  tileSize: 256,
  attribution: "© Google",
};

/** Google Hybrid — satélite + etiquetas (default institucional). */
export const GOOGLE_HYBRID_RASTER_SOURCE = {
  type: "raster" as const,
  tiles: ["https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"],
  tileSize: 256,
  attribution: "© Google",
};

/** @deprecated usar getBaseMapRasterSource */
export const SATELLITE_RASTER_SOURCE = ESRI_SATELLITE_RASTER_SOURCE;

export function getBaseMapRasterSource(id: BaseMapId) {
  switch (id) {
    case "googleHybrid":
      return GOOGLE_HYBRID_RASTER_SOURCE;
    case "googleSat":
      return GOOGLE_SATELLITE_RASTER_SOURCE;
    case "esri":
      return ESRI_SATELLITE_RASTER_SOURCE;
    case "osm":
      return OSM_RASTER_SOURCE;
    default:
      return GOOGLE_HYBRID_RASTER_SOURCE;
  }
}

export const BASE_MAP_OPTIONS: { id: BaseMapId; label: string }[] = [
  { id: "osm", label: "OpenStreetMap" },
  { id: "esri", label: "ESRI Satellite" },
  { id: "googleSat", label: "Google Satellite" },
  { id: "googleHybrid", label: "Google Hybrid" },
];

/** Requerido si el estilo incluye capas symbol con text-field (cotas, vértices). */
export const MAPLIBRE_GLYPHS_URL =
  "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";
