import type { ConstruccionCartograficaItem } from "../api";
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
import { centroidFromGeometry } from "../utils/geometry";
import {
  buildPredioMeasurementsGeoJSON,
  cotaOffsetMetersForZoom,
} from "../utils/predioMeasurements";
import { measureGeoJSON, type MeasureMode } from "../utils/mapSnap";

export function buildCuadroMeasurementsGeoJSON(
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

export function buildFreeMeasureDisplayGeoJSON(
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
      base.features.push({
        type: "Feature",
        properties: { kind: "edge" },
        geometry: { type: "LineString", coordinates: [points[i], points[i + 1]] },
      });
    }
  }
  return base;
}

export function construccionesVectorFeatureCollection(
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

export function buildCartografiaPrintVisibility(geonodeLayers: GeonodeLayer[]) {
  const vis = buildInitialVisibility(geonodeLayers);
  for (const id of prediosLayerIds(geonodeLayers)) vis[id] = true;
  for (const id of construccionesLayerIds(geonodeLayers)) vis[id] = true;
  vis["construcciones-vector"] = true;
  vis["measure-free"] = true;
  vis["cuadro"] = true;
  return vis;
}

export function buildCartografiaPrintOpacity(
  geonodeLayers: GeonodeLayer[],
  visible: Record<string, boolean>
) {
  const op = buildInitialOpacity(geonodeLayers);
  for (const l of geonodeLayers) {
    if (layerRole(l) === "predios") op[l.id] = PREDIOS_WMS_NEAR_OPACITY;
  }
  op["construcciones-vector"] = 1;
  op["measure-free"] = 1;
  op["cuadro"] = 1;
  return capColoniasOpacityWithPredios(visible, op, geonodeLayers);
}

export function anguloGradosADms(ang: number): string {
  const d = Math.floor(ang);
  const mFloat = (ang - d) * 60;
  const m = Math.floor(mFloat);
  const s = (mFloat - m) * 60;
  return `${d}°${m}'${s.toFixed(0)}"`;
}

/** Altura del mapa en pulgadas para caber en Oficio 8.5×14 (paridad 42-ficha-cartografia.js). */
export function computeCartografiaMapHeightIn(
  numCuadroRows: number,
  numConstrRows: number,
  forPrint = false
): number {
  let reservado = 3.35;
  reservado += numCuadroRows * 0.135 + numConstrRows * 0.125;
  if (forPrint) reservado = Math.max(3.1, reservado - 0.08);
  const altoUtil = 13.85;
  let mapIn = Math.max(3.35, Math.min(5.9, altoUtil - reservado));
  if (forPrint) mapIn = Math.max(3.2, mapIn - 0.05);
  return Math.round(mapIn * 100) / 100;
}
