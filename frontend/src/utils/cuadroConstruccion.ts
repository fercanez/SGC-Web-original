/**
 * Cuadro de construcción UTM — paridad SGC maduro (06-construcciones-medicion.js).
 * La geometría de entrada es WGS84 (EPSG:4326) del WFS de predios; se proyecta a UTM 11N
 * y se simplifica antes de generar P1..Pn (sin modificar el contorno real del mapa).
 */

const METRIC_SRID = 32611;

type Pt = [number, number];

/** Valores idénticos a POPUP_CONSTR_SIMPLIFICAR_CUADRO del SGC maduro. */
const SIMPLIFY_CUADRO = {
  activo: true,
  distanciaMinima: 0.03,
  desviacionLateral: 0.08,
  cambioDireccionGrados: 5.0,
  minimoVertices: 4,
};

function coordsEqual(a: GeoJSON.Position, b: GeoJSON.Position, eps = 1e-9): boolean {
  return Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;
}

function ringFromGeometry(geom: GeoJSON.Geometry): GeoJSON.Position[] | null {
  if (geom.type === "Polygon") {
    const ring = geom.coordinates[0];
    if (!ring?.length) return null;
    const out = [...ring];
    if (out.length > 1 && coordsEqual(out[0], out[out.length - 1])) out.pop();
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
    if (best && best.length > 1 && coordsEqual(best[0], best[best.length - 1])) {
      best.pop();
    }
    return best;
  }
  return null;
}

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
  const n = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
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

function utm11ToWgs84(x: number, y: number): [number, number] {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const zone = 11;
  const lon0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const e2 = 2 * f - f * f;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const xAdj = x - 500000;
  const m = y / k0;
  const mu =
    m /
    (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sinPhi = Math.sin(phi1);
  const cosPhi = Math.cos(phi1);
  const tanPhi = Math.tan(phi1);
  const n1 = a / Math.sqrt(1 - e2 * sinPhi ** 2);
  const t1 = tanPhi ** 2;
  const c1 = (e2 / (1 - e2)) * cosPhi ** 2;
  const r1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinPhi ** 2, 1.5);
  const d = xAdj / (n1 * k0);
  const latRad =
    phi1 -
    ((n1 * tanPhi) / r1) *
      ((d ** 2) / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * (e2 / (1 - e2))) * d ** 4) /
          24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * (e2 / (1 - e2)) - 3 * c1 ** 2) *
          d ** 6) /
          720);
  const lonRad =
    lon0 +
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * (e2 / (1 - e2)) + 24 * t1 ** 2) *
        d ** 5) /
        120) /
      cosPhi;
  return [(lonRad * 180) / Math.PI, (latRad * 180) / Math.PI];
}

function dist2d(a: Pt, b: Pt): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function utmSnapKey(p: Pt): string {
  return `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
}

function distPointLine(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-12) return dist2d(p, a);
  return (
    Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / Math.sqrt(len2)
  );
}

function directionChangeDeg(a: Pt, b: Pt, c: Pt): number {
  const v1x = b[0] - a[0];
  const v1y = b[1] - a[1];
  const v2x = c[0] - b[0];
  const v2y = c[1] - b[1];
  const l1 = Math.hypot(v1x, v1y);
  const l2 = Math.hypot(v2x, v2y);
  if (l1 <= 1e-12 || l2 <= 1e-12) return 0;
  let cos = (v1x * v2x + v1y * v2y) / (l1 * l2);
  cos = Math.max(-1, Math.min(1, cos));
  return (Math.acos(cos) * 180) / Math.PI;
}

function polygonArea(ring: Pt[]): number {
  if (ring.length < 3) return 0;
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
    p += dist2d(ring[i], ring[(i + 1) % ring.length]);
  }
  return p;
}

/** Duplicados consecutivos o microsegmentos (metros UTM). */
function dedupConsecutiveUtm(coords: Pt[], minDist: number): Pt[] {
  const out: Pt[] = [];
  for (const c of coords) {
    if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    if (!out.length || dist2d(out[out.length - 1], c) >= minDist) {
      out.push(c);
    }
  }
  if (out.length > 2 && dist2d(out[0], out[out.length - 1]) < minDist) {
    out.pop();
  }
  return out;
}

/** Duplicados por coordenada UTM redondeada a mm (paridad popupConstrSnapClaveVertice). */
function dedupByUtmSnapKey(coords: Pt[]): Pt[] {
  const out: Pt[] = [];
  const seen = new Set<string>();
  for (const c of coords) {
    const key = utmSnapKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  if (out.length > 2 && utmSnapKey(out[0]) === utmSnapKey(out[out.length - 1])) {
    out.pop();
  }
  return out;
}

/**
 * Paridad popupConstrSimplificarCoordsCuadro — solo para cuadro/etiquetas,
 * no altera la geometría cartográfica original.
 */
export function simplifyUtmRingForCuadro(coordsEntrada: Pt[]): Pt[] {
  const cfg = SIMPLIFY_CUADRO;
  let coords = coordsEntrada
    .filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map((c) => [c[0], c[1]] as Pt);

  if (!cfg.activo || coords.length <= cfg.minimoVertices) {
    return dedupByUtmSnapKey(dedupConsecutiveUtm(coords, cfg.distanciaMinima));
  }

  coords = dedupConsecutiveUtm(coords, cfg.distanciaMinima);
  coords = dedupByUtmSnapKey(coords);
  if (coords.length <= cfg.minimoVertices) return coords;

  const areaOriginal = polygonArea(coords);
  const depurada = [...coords];

  let cambio = true;
  let guard = 0;
  while (cambio && guard < 20 && coords.length > cfg.minimoVertices) {
    cambio = false;
    guard++;
    const siguiente: Pt[] = [];
    const n = coords.length;

    for (let i = 0; i < n; i++) {
      const prev = coords[(i - 1 + n) % n];
      const curr = coords[i];
      const next = coords[(i + 1) % n];
      const dPrev = dist2d(prev, curr);
      const dNext = dist2d(curr, next);
      const desviacion = distPointLine(curr, prev, next);
      const cambioDir = directionChangeDeg(prev, curr, next);
      const esRedundante =
        dPrev < cfg.distanciaMinima ||
        dNext < cfg.distanciaMinima ||
        (desviacion <= cfg.desviacionLateral &&
          cambioDir <= cfg.cambioDireccionGrados);

      if (esRedundante && n - 1 >= cfg.minimoVertices) {
        cambio = true;
        continue;
      }
      siguiente.push(curr);
    }

    if (siguiente.length < cfg.minimoVertices) break;
    coords = siguiente;
  }

  coords = dedupConsecutiveUtm(coords, cfg.distanciaMinima);
  coords = dedupByUtmSnapKey(coords);

  const areaNueva = polygonArea(coords);
  const difArea = Math.abs(areaOriginal - areaNueva);
  const toleranciaArea = Math.max(0.5, areaOriginal * 0.002);

  if (areaOriginal > 0 && difArea > toleranciaArea) {
    return dedupByUtmSnapKey(
      dedupConsecutiveUtm(depurada, cfg.distanciaMinima)
    );
  }

  return coords;
}

function utmRingFromGeometry(geom: GeoJSON.Geometry): Pt[] | null {
  const ring = ringFromGeometry(geom);
  if (!ring || ring.length < 3) return null;
  return ring.map(([lon, lat]) => wgs84ToUtm11(lon, lat));
}

export function geometryForCuadroDisplay(
  geometry: GeoJSON.Geometry
): GeoJSON.Polygon | null {
  const utm = utmRingFromGeometry(geometry);
  if (!utm) return null;
  const simplified = simplifyUtmRingForCuadro(utm);
  if (simplified.length < 3) return null;
  const wgs = simplified.map(([x, y]) => utm11ToWgs84(x, y));
  return {
    type: "Polygon",
    coordinates: [[...wgs, wgs[0]]],
  };
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

function verticesFromUtmRing(ring: Pt[]): CuadroVertex[] {
  const minD = SIMPLIFY_CUADRO.distanciaMinima;
  const raw: Omit<CuadroVertex, "vertice" | "lado">[] = [];

  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    const dist = dist2d(ring[i], ring[j]);
    if (dist < minD) continue;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const ang = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
    raw.push({
      dist_m: Math.round(dist * 100) / 100,
      angulo_deg: Math.round(ang * 100) / 100,
      este: Math.round(x1 * 1000) / 1000,
      norte: Math.round(y1 * 1000) / 1000,
    });
  }

  return raw.map((v, idx) => {
    const n = idx + 1;
    const next = idx + 1 < raw.length ? idx + 2 : 1;
    return {
      ...v,
      vertice: `P${n}`,
      lado: `P${n}-P${next}`,
    };
  });
}

export function buildCuadroConstruccionUtm(
  geometry: GeoJSON.Geometry
): CuadroConstruccionResult {
  const utmRaw = utmRingFromGeometry(geometry);
  if (!utmRaw || utmRaw.length < 3) {
    return {
      srid: METRIC_SRID,
      area_m2: null,
      perimetro_m: null,
      vertices: [],
      error: "Geometría sin anillo válido para cuadro UTM",
    };
  }

  const utmRing = simplifyUtmRingForCuadro(utmRaw);
  const vertices = verticesFromUtmRing(utmRing);

  return {
    srid: METRIC_SRID,
    area_m2: Math.round(polygonArea(utmRing) * 100) / 100,
    perimetro_m: Math.round(polygonPerimeter(utmRing) * 100) / 100,
    vertices,
  };
}

export function buildCuadroFromMeasurePoints(
  points: GeoJSON.Position[]
): CuadroConstruccionResult | null {
  if (points.length < 3) return null;
  const utmPts = points.map(([lon, lat]) => wgs84ToUtm11(lon, lat));
  const ring = simplifyUtmRingForCuadro(utmPts);
  if (ring.length < 3) return null;

  const vertices = verticesFromUtmRing(ring);
  return {
    srid: METRIC_SRID,
    area_m2: Math.round(polygonArea(ring) * 100) / 100,
    perimetro_m: Math.round(polygonPerimeter(ring) * 100) / 100,
    vertices,
  };
}

/** Área y perímetro UTM de un polígono dibujado (medición libre, sin simplificar). */
export function measurePolygonUtmMetrics(
  points: GeoJSON.Position[]
): { area_m2: number; perimetro_m: number } | null {
  if (points.length < 3) return null;
  const utm = points.map(([lon, lat]) => wgs84ToUtm11(lon, lat));
  return {
    area_m2: Math.round(polygonArea(utm) * 100) / 100,
    perimetro_m: Math.round(polygonPerimeter(utm) * 100) / 100,
  };
}
