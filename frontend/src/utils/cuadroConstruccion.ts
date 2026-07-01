/**
 * Cuadro de construcción UTM — paridad SGC maduro (41-ficha-preview.js).
 * Cálculo en cliente (WGS84 → EPSG:32611), sin depender de PostGIS.
 */

const METRIC_SRID = 32611;

type Pt = [number, number];

function ringFromGeometry(geom: GeoJSON.Geometry): GeoJSON.Position[] | null {
  if (geom.type === "Polygon") {
    const ring = geom.coordinates[0];
    if (!ring?.length) return null;
    const out = [...ring];
    if (out.length > 1) {
      const f = out[0];
      const l = out[out.length - 1];
      if (f[0] === l[0] && f[1] === l[1]) out.pop();
    }
    return out;
  }
  if (geom.type === "MultiPolygon") {
    let best: GeoJSON.Position[] | null = null;
    let bestN = 0;
    for (const poly of geom.coordinates) {
      const ring = poly[0];
      const n = ring?.length ?? 0;
      if (n > bestN) {
        bestN = n;
        best = ring ? [...ring] : null;
      }
    }
    if (best && best.length > 1) {
      const f = best[0];
      const l = best[best.length - 1];
      if (f[0] === l[0] && f[1] === l[1]) best.pop();
    }
    return best;
  }
  return null;
}

/** Proyección WGS84 → UTM 11N (fórmula estándar, sin dependencias). */
function wgs84ToUtm11(lon: number, lat: number): Pt {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const zone = 11;
  const lon0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const e2 = 2 * f - f * f;
  const ePrime2 = e2 / (1 - e2);
  const n =
    a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
  const t = Math.tan(latRad) ** 2;
  const c = ePrime2 * Math.cos(latRad) ** 2;
  const aa = Math.cos(latRad) * (lonRad - lon0);
  const m =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * latRad -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) *
        Math.sin(2 * latRad) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * latRad) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * latRad));
  const x =
    k0 *
      n *
      (aa +
        ((1 - t + c) * aa ** 3) / 6 +
        ((5 - 18 * t + t ** 2 + 72 * c - 58 * ePrime2) * aa ** 5) / 120) +
    500000;
  const y =
    k0 *
    (m +
      n *
        Math.tan(latRad) *
        ((aa ** 2) / 2 +
          ((5 - t + 9 * c + 4 * c ** 2) * aa ** 4) / 24 +
          ((61 - 58 * t + t ** 2 + 600 * c - 330 * ePrime2) * aa ** 6) / 720));
  return [x, y];
}

function polygonArea(ring: Pt[]): number {
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += ring[i][0] * ring[j][1];
    area -= ring[j][0] * ring[i][1];
  }
  return Math.abs(area) / 2;
}

function polygonPerimeter(ring: Pt[]): number {
  let p = 0;
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    p += Math.hypot(ring[j][0] - ring[i][0], ring[j][1] - ring[i][1]);
  }
  return p;
}

export interface CuadroVertex {
  vertice: string;
  lado: string;
  dist_m: number;
  angulo_deg: number;
  este: number;
  norte: number;
}

export interface CuadroConstruccionResult {
  srid: number;
  area_m2: number | null;
  perimetro_m: number | null;
  vertices: CuadroVertex[];
  error?: string;
}

export function buildCuadroConstruccionUtm(
  geometry: GeoJSON.Geometry
): CuadroConstruccionResult {
  const ring = ringFromGeometry(geometry);
  if (!ring || ring.length < 3) {
    return {
      srid: METRIC_SRID,
      area_m2: null,
      perimetro_m: null,
      vertices: [],
      error: "Geometría sin anillo válido para cuadro UTM",
    };
  }

  const utmRing: Pt[] = ring.map(([lon, lat]) => wgs84ToUtm11(lon, lat));
  const area = polygonArea(utmRing);
  const perimetro = polygonPerimeter(utmRing);
  const n = utmRing.length;
  const vertices: CuadroVertex[] = [];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [x1, y1] = utmRing[i];
    const [x2, y2] = utmRing[j];
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const ang = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
    vertices.push({
      vertice: `P${i + 1}`,
      lado: `P${i + 1}-P${j + 1}`,
      dist_m: Math.round(dist * 100) / 100,
      angulo_deg: Math.round(ang * 100) / 100,
      este: Math.round(x1 * 1000) / 1000,
      norte: Math.round(y1 * 1000) / 1000,
    });
  }

  return {
    srid: METRIC_SRID,
    area_m2: Math.round(area * 100) / 100,
    perimetro_m: Math.round(perimetro * 100) / 100,
    vertices,
  };
}
