/** Puntos de snap y medición libre (ficha Construcción). */

import { measurePolygonUtmMetrics } from "./cuadroConstruccion";

export type MeasureMode = "off" | "line" | "polygon";

function ringVertices(geometry: GeoJSON.Geometry): GeoJSON.Position[] {
  if (geometry.type === "Polygon") {
    const ring = geometry.coordinates[0] ?? [];
    if (ring.length > 1) {
      const f = ring[0];
      const l = ring[ring.length - 1];
      if (f[0] === l[0] && f[1] === l[1]) return ring.slice(0, -1);
    }
    return ring;
  }
  if (geometry.type === "MultiPolygon") {
    let best: GeoJSON.Position[] = [];
    for (const poly of geometry.coordinates) {
      const ring = poly[0] ?? [];
      if (ring.length > best.length) best = ring;
    }
    if (best.length > 1) {
      const f = best[0];
      const l = best[best.length - 1];
      if (f[0] === l[0] && f[1] === l[1]) return best.slice(0, -1);
    }
    return best;
  }
  if (geometry.type === "Point") {
    return [geometry.coordinates];
  }
  return [];
}

export function collectSnapPoints(
  geometries: (GeoJSON.Geometry | null | undefined)[]
): GeoJSON.Position[] {
  const seen = new Set<string>();
  const out: GeoJSON.Position[] = [];
  for (const g of geometries) {
    if (!g) continue;
    for (const p of ringVertices(g)) {
      const key = `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

function haversineMeters(a: GeoJSON.Position, b: GeoJSON.Position): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function snapToNearestVertex(
  lngLat: GeoJSON.Position,
  snapPoints: GeoJSON.Position[],
  thresholdMeters = 10
): GeoJSON.Position {
  if (!snapPoints.length) return lngLat;
  let best = snapPoints[0];
  let bestD = haversineMeters(lngLat, best);
  for (let i = 1; i < snapPoints.length; i++) {
    const d = haversineMeters(lngLat, snapPoints[i]);
    if (d < bestD) {
      bestD = d;
      best = snapPoints[i];
    }
  }
  return bestD <= thresholdMeters ? best : lngLat;
}

export function measureGeoJSON(
  points: GeoJSON.Position[],
  mode: MeasureMode
): GeoJSON.FeatureCollection {
  return buildFreeMeasureLayersGeoJSON(points, mode);
}

function midpoint(a: GeoJSON.Position, b: GeoJSON.Position): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function edgeTextRotateDeg(a: GeoJSON.Position, b: GeoJSON.Position): number {
  const r = 6378137;
  const x1 = (a[0] * Math.PI * r) / 180;
  const y1 = r * Math.log(Math.tan(Math.PI / 4 + (a[1] * Math.PI) / 360));
  const x2 = (b[0] * Math.PI * r) / 180;
  const y2 = r * Math.log(Math.tan(Math.PI / 4 + (b[1] * Math.PI) / 360));
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.hypot(dx, dy) < 1e-6) return 0;
  let rotate = -(Math.atan2(dy, dx) * 180) / Math.PI;
  while (rotate > 90) rotate -= 180;
  while (rotate < -90) rotate += 180;
  return rotate;
}

function ringCentroid(points: GeoJSON.Position[]): [number, number] {
  let lng = 0;
  let lat = 0;
  for (const p of points) {
    lng += p[0];
    lat += p[1];
  }
  return [lng / points.length, lat / points.length];
}

/** Capas free-measure: vértices, aristas, cotas y resumen de área (polígono). */
export function buildFreeMeasureLayersGeoJSON(
  points: GeoJSON.Position[],
  mode: MeasureMode
): GeoJSON.FeatureCollection {
  if (!points.length || mode === "off") {
    return { type: "FeatureCollection", features: [] };
  }

  const features: GeoJSON.Feature[] = [];

  for (const p of points) {
    features.push({
      type: "Feature",
      properties: { kind: "vertex-dot" },
      geometry: { type: "Point", coordinates: p },
    });
  }

  const segments: [GeoJSON.Position, GeoJSON.Position][] = [];
  if (mode === "line") {
    for (let i = 0; i < points.length - 1; i++) {
      segments.push([points[i], points[i + 1]]);
    }
  } else if (mode === "polygon") {
    if (points.length >= 2) {
      for (let i = 0; i < points.length - 1; i++) {
        segments.push([points[i], points[i + 1]]);
      }
    }
    if (points.length >= 3) {
      segments.push([points[points.length - 1], points[0]]);
      const ring = [...points, points[0]];
      features.push({
        type: "Feature",
        properties: { kind: "fill" },
        geometry: { type: "Polygon", coordinates: [ring] },
      });
    }
  }

  for (const [p, q] of segments) {
    const dist = haversineMeters(p, q);
    features.push({
      type: "Feature",
      properties: { kind: "edge" },
      geometry: { type: "LineString", coordinates: [p, q] },
    });
    features.push({
      type: "Feature",
      properties: {
        kind: "cota",
        label: `${dist.toFixed(2)} m`,
        bearing: edgeTextRotateDeg(p, q),
      },
      geometry: { type: "Point", coordinates: midpoint(p, q) },
    });
  }

  if (mode === "polygon" && points.length >= 3) {
    const metrics = measurePolygonUtmMetrics(points);
    if (metrics) {
      features.push({
        type: "Feature",
        properties: {
          kind: "area-summary",
          label: `Área: ${metrics.area_m2.toFixed(2)} m²\nPerím.: ${metrics.perimetro_m.toFixed(2)} m`,
          area_m2: metrics.area_m2,
          perimetro_m: metrics.perimetro_m,
        },
        geometry: { type: "Point", coordinates: ringCentroid(points) },
      });
    }
  }

  return { type: "FeatureCollection", features };
}

export function mergeConstruccionLayer(
  layers: { id: string; layer: string; title: string }[],
  construcciones?: {
    enabled?: boolean;
    layer?: string | null;
    title?: string;
    wms_id?: string | null;
  }
): { id: string; layer: string; title: string }[] {
  if (!construcciones?.enabled || !construcciones.layer || !construcciones.wms_id) {
    return layers;
  }
  if (layers.some((l) => l.layer === construcciones.layer)) return layers;
  return [
    ...layers,
    {
      id: construcciones.wms_id,
      layer: construcciones.layer,
      title: construcciones.title ?? "Construcciones WMS",
    },
  ];
}
