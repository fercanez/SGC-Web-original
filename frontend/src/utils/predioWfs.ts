import type { PublicConfig } from "../types/config";
import { isWgs84Geometry } from "./geometry";

const DEFAULT_LAYER = "geonode:prediosmxli";

function wfsPathForLayer(layer: string): string {
  const workspace = layer.includes(":") ? layer.split(":")[0] : "catastro_bc";
  return `/geoserver/${workspace}/wfs`;
}

function baseUrl(config?: PublicConfig): string {
  return (
    config?.construcciones?.base_url ??
    import.meta.env.VITE_GEONODE_URL ??
    (typeof window !== "undefined" ? window.location.origin : "")
  ).replace(/\/$/, "");
}

function webMercatorToWgs84(x: number, y: number): [number, number] {
  const lng = (x / 20037508.34) * 180;
  const latRad = Math.atan(Math.sinh((y / 20037508.34) * Math.PI));
  const lat = (latRad * 180) / Math.PI;
  return [lng, lat];
}

function mapCoords(
  coords: unknown,
  transform: (x: number, y: number) => [number, number]
): unknown {
  if (!Array.isArray(coords)) return coords;
  if (coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
    return transform(coords[0], coords[1]);
  }
  return coords.map((c) => mapCoords(c, transform));
}

function normalizePredioGeometry(geom: GeoJSON.Geometry): GeoJSON.Geometry | null {
  if (geom.type === "GeometryCollection") return null;
  if (isWgs84Geometry(geom)) return geom;

  const sample = JSON.stringify(geom).slice(0, 120);
  if (!/1[0-9]{7}/.test(sample)) return null;

  const mapped = mapCoords(
    (geom as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates,
    webMercatorToWgs84
  );
  const out =
    geom.type === "Polygon"
      ? ({ type: "Polygon", coordinates: mapped } as GeoJSON.Polygon)
      : ({ type: "MultiPolygon", coordinates: mapped } as GeoJSON.MultiPolygon);
  return isWgs84Geometry(out) ? out : null;
}

function pickPredioGeometry(
  fc: GeoJSON.FeatureCollection,
  clave: string
): GeoJSON.Geometry | null {
  const norm = clave.trim().toUpperCase();
  for (const f of fc.features ?? []) {
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const cand = [
      props.clavecatas,
      props.claveorig,
      props.clave_catastral,
      props.cvecatastral,
    ]
      .map((v) => String(v ?? "").trim().toUpperCase())
      .filter(Boolean);
    if (cand.length && !cand.some((c) => c === norm)) continue;
    const geom = f.geometry;
    if (!geom || geom.type === "GeometryCollection") continue;
    const normalized = normalizePredioGeometry(geom);
    if (normalized) return normalized;
  }
  const first = fc.features?.[0]?.geometry;
  if (first && first.type !== "GeometryCollection") {
    return normalizePredioGeometry(first);
  }
  return null;
}

/** WFS directo en el punto del clic (respaldo si la API falla). */
export async function fetchPredioClaveAtPointWfs(
  lon: number,
  lat: number,
  config?: PublicConfig | null
): Promise<string | null> {
  const layer = config?.source?.layer ?? DEFAULT_LAYER;
  const base = baseUrl(config ?? undefined);
  if (!base || !layer) return null;

  const wfsPath = wfsPathForLayer(layer);
  const lonS = lon.toFixed(8);
  const latS = lat.toFixed(8);
  const filters = [
    `INTERSECTS(geom, SRID=4326;POINT(${lonS} ${latS}))`,
    `INTERSECTS(the_geom, SRID=4326;POINT(${lonS} ${latS}))`,
    `DWITHIN(geom, POINT(${lonS} ${latS}), 0.00008, degrees)`,
  ];

  const attempts: { version: string; extra: string }[] = [
    { version: "1.1.0", extra: `typeName=${encodeURIComponent(layer)}&maxFeatures=5` },
    { version: "2.0.0", extra: `typeNames=${encodeURIComponent(layer)}&count=5` },
  ];

  for (const cqlRaw of filters) {
    const cql = encodeURIComponent(cqlRaw);
    for (const srs of ["EPSG:4326", "EPSG:3857"]) {
      for (const { version, extra } of attempts) {
        const url =
          `${base}${wfsPath}?service=WFS&version=${version}&request=GetFeature` +
          `&${extra}&outputFormat=application%2Fjson&srsName=${encodeURIComponent(srs)}` +
          `&CQL_FILTER=${cql}`;
        try {
          const resp = await fetch(url, { cache: "no-store" });
          if (!resp.ok) continue;
          const fc = (await resp.json()) as GeoJSON.FeatureCollection;
          for (const f of fc.features ?? []) {
            const props = (f.properties ?? {}) as Record<string, unknown>;
            const cand = [
              props.clavecatas,
              props.claveorig,
              props.clave_catastral,
              props.cvecatastral,
            ]
              .map((v) => String(v ?? "").trim().toUpperCase())
              .filter(Boolean);
            if (cand[0]) return cand[0];
          }
        } catch {
          /* siguiente intento */
        }
      }
    }
  }
  return null;
}

/** Paridad SGC maduro: WFS público catastro_bc:predios_oficial por clave. */
export async function fetchPredioWfsMaduro(
  clave: string,
  config?: PublicConfig | null
): Promise<GeoJSON.Geometry | null> {
  const layer = config?.source?.layer ?? DEFAULT_LAYER;
  const base = baseUrl(config ?? undefined);
  if (!base || !layer) return null;

  const safe = clave.trim().toUpperCase().replace(/'/g, "''");
  const cql = encodeURIComponent(`clavecatas='${safe}' OR claveorig='${safe}'`);
  const wfsPath = wfsPathForLayer(layer);

  const attempts: { version: string; extra: string }[] = [
    {
      version: "1.1.0",
      extra: `typeName=${encodeURIComponent(layer)}&maxFeatures=5`,
    },
    {
      version: "2.0.0",
      extra: `typeNames=${encodeURIComponent(layer)}&count=5`,
    },
  ];

  for (const srs of ["EPSG:4326", "EPSG:3857"]) {
    for (const { version, extra } of attempts) {
      const url =
        `${base}${wfsPath}?service=WFS&version=${version}&request=GetFeature` +
        `&${extra}&outputFormat=application%2Fjson&srsName=${encodeURIComponent(srs)}` +
        `&CQL_FILTER=${cql}`;
      try {
        const resp = await fetch(url, { cache: "no-store" });
        if (!resp.ok) continue;
        const fc = (await resp.json()) as GeoJSON.FeatureCollection;
        const geom = pickPredioGeometry(fc, clave);
        if (geom) return geom;
      } catch {
        /* siguiente intento */
      }
    }
  }
  return null;
}
