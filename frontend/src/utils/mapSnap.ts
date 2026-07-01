/** Puntos de snap y medición libre (ficha Construcción). */

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
  if (points.length < 2 || mode === "off") {
    return { type: "FeatureCollection", features: [] };
  }
  if (mode === "line") {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { kind: "measure" },
          geometry: { type: "LineString", coordinates: points },
        },
      ],
    };
  }
  if (points.length >= 3) {
    const ring = [...points, points[0]];
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { kind: "measure" },
          geometry: { type: "Polygon", coordinates: [ring] },
        },
      ],
    };
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { kind: "measure" },
        geometry: { type: "LineString", coordinates: points },
      },
    ],
  };
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
