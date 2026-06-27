import {
  getCadastralMapGeometry,
  getParcel,
  type PredioAlfanumericoRecord,
} from "../api";
import {
  fiscalStatusFromAdeudos,
  type FiscalStatus,
} from "./fiscal";
import { normalizeCadastralCode } from "./geometry";

const FALLBACK_MAX = 40;
const FALLBACK_CHUNK = 5;

export function fiscalMapFromItems(
  items: PredioAlfanumericoRecord[]
): Map<string, FiscalStatus> {
  const map = new Map<string, FiscalStatus>();
  for (const r of items) {
    map.set(
      normalizeCadastralCode(r.clave_catastral),
      fiscalStatusFromAdeudos(r.adeudo_2026, r.adeudo_total)
    );
  }
  return map;
}

export function applyFiscalToFeatures(
  features: GeoJSON.Feature[],
  fiscalByClave: Map<string, FiscalStatus>
): GeoJSON.Feature[] {
  return features.map((f) => {
    const clave = normalizeCadastralCode(String(f.properties?.clave ?? ""));
    const fiscal =
      fiscalByClave.get(clave) ??
      (f.properties?.fiscal as FiscalStatus | undefined) ??
      "sin_dato";
    return {
      ...f,
      properties: {
        ...f.properties,
        clave,
        clave_norm: clave,
        fiscal,
      },
    };
  });
}

export function buildHighlightCollection(
  features: GeoJSON.Feature[]
): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features };
}

export function findGeometryInSearch(
  fc: GeoJSON.FeatureCollection | null | undefined,
  clave: string
): GeoJSON.Geometry | null {
  if (!fc?.features?.length) return null;
  const norm = normalizeCadastralCode(clave);
  const feat = fc.features.find((f) => {
    const c = String(f.properties?.clave ?? "");
    return c === clave || normalizeCadastralCode(c) === norm;
  });
  const geom = feat?.geometry;
  if (!geom || geom.type === "GeometryCollection") return null;
  return geom as GeoJSON.Geometry;
}

/** Geometría desde parcels.geom (API /parcels/{id}), sin WFS. */
export async function fetchGeometriesFromParcels(
  items: PredioAlfanumericoRecord[]
): Promise<GeoJSON.Feature[]> {
  const fiscalByClave = fiscalMapFromItems(items);
  const slice = items.filter((r) => r.parcel_id).slice(0, 40);
  const features: GeoJSON.Feature[] = [];

  for (let i = 0; i < slice.length; i += 5) {
    const chunk = slice.slice(i, i + 5);
    const results = await Promise.all(
      chunk.map(async (r) => {
        if (!r.parcel_id) return null;
        try {
          const p = await getParcel(r.parcel_id);
          if (!p.geometry) return null;
          const clave = normalizeCadastralCode(r.clave_catastral);
          return {
            type: "Feature" as const,
            properties: {
              clave,
              clave_norm: clave,
              fiscal: fiscalByClave.get(clave) ?? "sin_dato",
            },
            geometry: p.geometry,
          };
        } catch {
          return null;
        }
      })
    );
    for (const f of results) {
      if (f) features.push(f);
    }
  }

  return features;
}

export async function resolveParcelGeometry(
  record: PredioAlfanumericoRecord
): Promise<GeoJSON.Geometry | null> {
  if (!record.parcel_id) return null;
  try {
    const p = await getParcel(record.parcel_id);
    return p.geometry ?? null;
  } catch {
    return null;
  }
}

/** Si el batch del servidor falla, pide geometría predio por predio. */
export async function fetchMapGeometriesFallback(
  items: PredioAlfanumericoRecord[]
): Promise<GeoJSON.Feature[]> {
  const slice = items.slice(0, FALLBACK_MAX);
  const fiscalByClave = fiscalMapFromItems(slice);
  const features: GeoJSON.Feature[] = [];

  for (let i = 0; i < slice.length; i += FALLBACK_CHUNK) {
    const chunk = slice.slice(i, i + FALLBACK_CHUNK);
    const results = await Promise.all(
      chunk.map(async (r) => {
        try {
          const geo = await getCadastralMapGeometry(r.clave_catastral);
          if (!geo?.geometry) return null;
          const clave = normalizeCadastralCode(r.clave_catastral);
          return {
            type: "Feature" as const,
            properties: {
              clave,
              clave_norm: clave,
              fiscal: fiscalByClave.get(clave) ?? "sin_dato",
            },
            geometry: geo.geometry,
          };
        } catch {
          return null;
        }
      })
    );
    for (const f of results) {
      if (f) features.push(f);
    }
  }

  return features;
}
