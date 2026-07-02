import type maplibregl from "maplibre-gl";
import { getCadastralAtPoint } from "../api";
import { getApiUrl } from "../config/apiUrl";
import type { GeonodeLayer, PublicConfig } from "../types/config";
import { prediosLayerIds } from "../config/mapLayers";
import { fetchPredioClaveAtPointWfs } from "./predioWfs";

const PICK_LAYERS = [
  "search-highlight-fill",
  "parcels-fill",
  "active-highlight-fill",
] as const;

export function extractClaveFromProps(
  props: Record<string, unknown> | null | undefined
): string {
  if (!props) return "";
  return String(
    props.clave ??
      props.clave_catastral ??
      props.clavecatas ??
      props.claveorig ??
      props.cadastral_code ??
      props.CLAVE_CATASTRAL ??
      props.ClaveCatas ??
      props.cvecatastral ??
      ""
  )
    .trim()
    .toUpperCase();
}

function hasLayer(map: maplibregl.Map, id: string): boolean {
  try {
    return Boolean(map.getLayer(id));
  } catch {
    return false;
  }
}

function pickPrediosLayer(layers: GeonodeLayer[]): GeonodeLayer | null {
  const ids = prediosLayerIds(layers);
  if (!ids.length) return null;
  return layers.find((l) => l.id === ids[0]) ?? null;
}

function claveFromRenderedFeatures(
  map: maplibregl.Map,
  point: maplibregl.Point
): string | null {
  const layers = PICK_LAYERS.filter((id) => hasLayer(map, id));
  if (!layers.length) return null;

  const features = map.queryRenderedFeatures(point, { layers });
  for (const f of features) {
    const clave = extractClaveFromProps(
      f.properties as Record<string, unknown> | undefined
    );
    if (clave) return clave;
  }
  return null;
}

async function claveFromApiAtPoint(
  lngLat: maplibregl.LngLatLike,
  config?: PublicConfig | null
): Promise<string | null> {
  const ll =
    typeof lngLat === "object" && lngLat !== null && "lng" in lngLat
      ? lngLat
      : null;
  if (!ll) return null;
  try {
    const hit = await getCadastralAtPoint(ll.lng, ll.lat);
    if (hit?.clave_catastral) return hit.clave_catastral.trim().toUpperCase();
  } catch {
    /* API caída — respaldo WFS directo */
  }
  return fetchPredioClaveAtPointWfs(ll.lng, ll.lat, config);
}

async function claveFromWmsGetFeatureInfo(
  map: maplibregl.Map,
  point: maplibregl.Point,
  wmsPath: string,
  layerName: string
): Promise<string | null> {
  const canvas = map.getCanvas();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width < 1 || height < 1) return null;

  const scaleX = canvas.width / width;
  const scaleY = canvas.height / height;
  const x = Math.floor(point.x * scaleX);
  const y = Math.floor(point.y * scaleY);

  const bounds = map.getBounds();
  const bbox = [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth(),
  ].join(",");

  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetFeatureInfo",
    LAYERS: layerName,
    QUERY_LAYERS: layerName,
    STYLES: "",
    BBOX: bbox,
    WIDTH: String(canvas.width),
    HEIGHT: String(canvas.height),
    X: String(x),
    Y: String(y),
    SRS: "EPSG:4326",
    INFO_FORMAT: "application/json",
    FEATURE_COUNT: "10",
  });

  const url = `${getApiUrl()}${wmsPath}?${params.toString()}`;
  try {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) return null;
    const data = (await resp.json()) as GeoJSON.FeatureCollection;
    for (const f of data.features ?? []) {
      const clave = extractClaveFromProps(
        f.properties as Record<string, unknown> | undefined
      );
      if (clave) return clave;
    }
  } catch {
    /* sin respuesta WMS */
  }
  return null;
}

/** Identifica clave catastral en un clic (vectores → API intersecta → WMS). */
export async function identifyPredioClaveAtPoint(
  map: maplibregl.Map,
  point: maplibregl.Point,
  lngLat: maplibregl.LngLat,
  options: {
    wmsPath: string;
    geonodeLayers: GeonodeLayer[];
    allowWms?: boolean;
    config?: PublicConfig | null;
  }
): Promise<string | null> {
  const fromVector = claveFromRenderedFeatures(map, point);
  if (fromVector) return fromVector;

  const fromApi = await claveFromApiAtPoint(lngLat, options.config);
  if (fromApi) return fromApi;

  if (options.allowWms === false) return null;

  const prediosLayer = pickPrediosLayer(options.geonodeLayers);
  if (!prediosLayer) return null;

  const visibleId = `geonode-${prediosLayer.id}`;
  if (!hasLayer(map, visibleId)) return null;

  return claveFromWmsGetFeatureInfo(
    map,
    point,
    options.wmsPath,
    prediosLayer.layer
  );
}

export function mapShowsSelectablePredio(
  map: maplibregl.Map,
  point: maplibregl.Point,
  zoom: number
): boolean {
  const layers = PICK_LAYERS.filter((id) => hasLayer(map, id));
  if (layers.length && map.queryRenderedFeatures(point, { layers }).length > 0) {
    return true;
  }
  return zoom >= 14;
}

export function prediosWmsLayerForIdentify(
  layers: GeonodeLayer[]
): GeonodeLayer | null {
  return pickPrediosLayer(layers);
}

export { PICK_LAYERS };
