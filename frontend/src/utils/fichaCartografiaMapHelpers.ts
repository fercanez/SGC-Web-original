import type { ConstruccionCartograficaItem } from "../api";
import { geometryForCuadroDisplay } from "./cuadroConstruccion";
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
import { buildFreeMeasureLayersGeoJSON, type MeasureMode } from "../utils/mapSnap";

export function buildCuadroMeasurementsGeoJSON(
  geometry: GeoJSON.Geometry,
  zoom: number
): GeoJSON.FeatureCollection {
  const displayGeom = geometryForCuadroDisplay(geometry) ?? geometry;
  const center = centroidFromGeometry(displayGeom);
  const lat = center?.[1] ?? 32.624639;
  return buildPredioMeasurementsGeoJSON(displayGeom, {
    cotaOffsetMeters: cotaOffsetMetersForZoom(lat, zoom, 16),
    vertexOffsetMeters: cotaOffsetMetersForZoom(lat, zoom, 10),
  });
}

export function buildFreeMeasureDisplayGeoJSON(
  points: GeoJSON.Position[],
  mode: MeasureMode,
  _zoom: number
): GeoJSON.FeatureCollection {
  return buildFreeMeasureLayersGeoJSON(points, mode);
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
  const rowCuadro = numCuadroRows > 7 ? 0.105 : 0.125;
  const rowConstr = 0.11;
  let reservado = 3.05;
  reservado += numCuadroRows * rowCuadro + numConstrRows * rowConstr;
  if (forPrint) reservado = Math.max(2.95, reservado - 0.06);
  const altoUtil = 13.72;
  let mapIn = Math.max(2.85, Math.min(4.65, altoUtil - reservado));
  if (forPrint) mapIn = Math.max(2.75, mapIn - 0.04);
  return Math.round(mapIn * 100) / 100;
}
