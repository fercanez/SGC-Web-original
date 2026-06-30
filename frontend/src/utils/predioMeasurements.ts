/** Cotas y vértices del contorno (paridad SGC maduro / ficha-preview). */

export interface PredioMeasurementsOptions {
  /** Distancia de cotas al borde del predio (metros). */
  cotaOffsetMeters?: number;
  /** Distancia de etiquetas P1…Pn al vértice (metros). */
  vertexOffsetMeters?: number;
}

const DEFAULT_COTA_OFFSET_M = 8;
const DEFAULT_VERTEX_OFFSET_M = 3;

/** Metros por píxel en Web Mercator (EPSG:3857). */
export function metersPerPixelAtLat(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

/** Offset en metros para mantener ~`pixels` de separación visual al zoom actual. */
export function cotaOffsetMetersForZoom(
  lat: number,
  zoom: number,
  pixels = 16
): number {
  const meters = metersPerPixelAtLat(lat, zoom) * pixels;
  return Math.max(1.5, Math.min(72, meters));
}

function ringFromGeometry(geom: GeoJSON.Geometry): GeoJSON.Position[] | null {
  if (geom.type === "Polygon") {
    const ring = geom.coordinates[0];
    return ring?.length ? ring : null;
  }
  if (geom.type === "MultiPolygon") {
    let best: GeoJSON.Position[] | null = null;
    let bestN = 0;
    for (const poly of geom.coordinates) {
      const ring = poly[0];
      const n = ring?.length ?? 0;
      if (n > bestN) {
        bestN = n;
        best = ring;
      }
    }
    return best;
  }
  return null;
}

function haversineMeters(a: GeoJSON.Position, b: GeoJSON.Position): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function ringCentroid(ring: GeoJSON.Position[]): [number, number] {
  let lng = 0;
  let lat = 0;
  const n = ring.length > 1 ? ring.length - 1 : ring.length;
  for (let i = 0; i < n; i++) {
    lng += ring[i][0];
    lat += ring[i][1];
  }
  return [lng / n, lat / n];
}

function outwardOffset(
  p: GeoJSON.Position,
  q: GeoJSON.Position,
  c: [number, number],
  meters: number
): [number, number] {
  const mid: [number, number] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if (nx * (mid[0] - c[0]) + ny * (mid[1] - c[1]) < 0) {
    nx *= -1;
    ny *= -1;
  }
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((mid[1] * Math.PI) / 180);
  return [
    mid[0] + (nx * meters) / mPerDegLon,
    mid[1] + (ny * meters) / mPerDegLat,
  ];
}

function vertexLabelPoint(
  p: GeoJSON.Position,
  c: [number, number],
  meters: number
): [number, number] {
  const vx = p[0] - c[0];
  const vy = p[1] - c[1];
  const len = Math.hypot(vx, vy) || 1;
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((p[1] * Math.PI) / 180);
  return [
    p[0] + ((vx / len) * meters) / mPerDegLon,
    p[1] + ((vy / len) * meters) / mPerDegLat,
  ];
}

function lonLatToMercatorMeters(lon: number, lat: number): [number, number] {
  const r = 6378137;
  const x = (lon * Math.PI * r) / 180;
  const y = r * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return [x, y];
}

function edgeTextRotateDeg(a: GeoJSON.Position, b: GeoJSON.Position): number {
  const [x1, y1] = lonLatToMercatorMeters(a[0], a[1]);
  const [x2, y2] = lonLatToMercatorMeters(b[0], b[1]);
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.hypot(dx, dy) < 1e-6) return 0;
  const theta = (Math.atan2(dy, dx) * 180) / Math.PI;
  let rotate = -theta;
  while (rotate > 90) rotate -= 180;
  while (rotate < -90) rotate += 180;
  return rotate;
}

export function buildPredioMeasurementsGeoJSON(
  geometry: GeoJSON.Geometry | null | undefined,
  options: PredioMeasurementsOptions = {}
): GeoJSON.FeatureCollection {
  if (!geometry) {
    return { type: "FeatureCollection", features: [] };
  }
  const raw = ringFromGeometry(geometry);
  if (!raw || raw.length < 3) {
    return { type: "FeatureCollection", features: [] };
  }

  const cotaOffset = options.cotaOffsetMeters ?? DEFAULT_COTA_OFFSET_M;
  const vertexOffset = options.vertexOffsetMeters ?? DEFAULT_VERTEX_OFFSET_M;

  const ring = [...raw];
  if (ring.length > 1) {
    const f = ring[0];
    const l = ring[ring.length - 1];
    if (f[0] === l[0] && f[1] === l[1]) ring.pop();
  }

  const c = ringCentroid(ring);
  const features: GeoJSON.Feature[] = [];

  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const dist = haversineMeters(p, q);
    const labelPt = outwardOffset(p, q, c, cotaOffset);
    const vertPt = vertexLabelPoint(p, c, vertexOffset);

    features.push({
      type: "Feature",
      properties: { kind: "edge" },
      geometry: {
        type: "LineString",
        coordinates: [p, q],
      },
    });
    features.push({
      type: "Feature",
      properties: {
        kind: "cota",
        label: `${dist.toFixed(2)} m`,
        bearing: edgeTextRotateDeg(p, q),
      },
      geometry: { type: "Point", coordinates: labelPt },
    });
    features.push({
      type: "Feature",
      properties: { kind: "vertex-dot" },
      geometry: { type: "Point", coordinates: p },
    });
    features.push({
      type: "Feature",
      properties: { kind: "vertex-label", label: `P${i + 1}` },
      geometry: { type: "Point", coordinates: vertPt },
    });
  }

  return { type: "FeatureCollection", features };
}

export function segmentosClaveCatastral(clave: string): {
  manzana: string;
  lote: string;
  fraccion: string;
} {
  const c = clave.trim().toUpperCase();
  const m = c.match(/^([A-Z]{1,3})(\d+)$/);
  if (!m) return { manzana: "—", lote: "—", fraccion: "—" };
  const numeros = m[2];
  const manzana = numeros.slice(0, 3) || "—";
  const lote = numeros.slice(3, 6) || "—";
  const fraccionRaw = numeros.slice(6);
  const fraccion = fraccionRaw
    ? fraccionRaw.replace(/^0+/, "") || fraccionRaw
    : "—";
  return { manzana, lote, fraccion };
}
