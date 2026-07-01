import type { ConstruccionCartograficaItem } from "../api";
import type { GeonodeLayer, PublicConfig } from "../types/config";

const DEFAULT_LAYER = "geonode:construccionesmxli";

export function resolveConstruccionesWfsConfig(
  cfg: PublicConfig["construcciones"] | undefined,
  geonodeLayers: GeonodeLayer[] = []
): NonNullable<PublicConfig["construcciones"]> {
  const fromLayer = geonodeLayers.find((l) =>
    /construcc/i.test(l.layer) || /construcc/i.test(l.id)
  );
  const baseUrl =
    cfg?.base_url ??
    import.meta.env.VITE_GEONODE_URL ??
    (typeof window !== "undefined" ? window.location.origin : null);

  return {
    enabled: cfg?.enabled ?? Boolean(fromLayer ?? DEFAULT_LAYER),
    layer: cfg?.layer ?? fromLayer?.layer ?? DEFAULT_LAYER,
    title: cfg?.title ?? fromLayer?.title ?? "Construcciones WMS",
    wms_id:
      cfg?.wms_id ??
      (cfg?.layer ?? fromLayer?.layer ?? DEFAULT_LAYER).replace(":", "_"),
    wfs_path: cfg?.wfs_path ?? "/geoserver/geonode/wfs",
    base_url: baseUrl,
  };
}

/** Paridad SGC maduro: WFS público geonode:construccionesmxli */
export async function fetchConstruccionesWfsMaduro(
  clave: string,
  cfg: PublicConfig["construcciones"] | undefined,
  geonodeLayers: GeonodeLayer[] = []
): Promise<ConstruccionCartograficaItem[]> {
  const resolved = resolveConstruccionesWfsConfig(cfg, geonodeLayers);
  if (!resolved.layer) return [];

  const base = (resolved.base_url ?? "").replace(/\/$/, "");
  if (!base) return [];

  const safe = clave.trim().toUpperCase().replace(/'/g, "''");
  const cql = encodeURIComponent(`clavecatas='${safe}' OR claveorig='${safe}'`);
  const wfsPath = resolved.wfs_path ?? "/geoserver/geonode/wfs";
  const url =
    `${base}${wfsPath}?service=WFS&version=1.1.0&request=GetFeature` +
    `&typeName=${encodeURIComponent(resolved.layer)}` +
    `&outputFormat=application%2Fjson&srsName=EPSG%3A3857` +
    `&CQL_FILTER=${cql}&maxFeatures=100`;

  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) return [];

  const geojson = (await resp.json()) as GeoJSON.FeatureCollection;
  return (geojson.features ?? []).map((f) => {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const num = (k: string) => {
      const v = p[k];
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      clave_const: (p.claveconst ?? p.clave_const ?? null) as string | number | null,
      niveles: (p.niveles ?? null) as string | number | null,
      sup_inc_m2: num("suphor") ?? num("sup_inc") ?? num("superficie"),
      tipo: (p.tipo ?? null) as string | null,
      perimetro_m: num("perimetro") ?? num("perimetro_m"),
      geometry: f.geometry ?? null,
    };
  });
}

function sanitizeConstruccionesMessage(message: string | null): string | null {
  if (!message) return null;
  if (/client error|http|cuenta_pred|400|401|403|geoserver/i.test(message)) {
    return "Sin construcciones en la capa WFS para esta clave.";
  }
  return message;
}

export { sanitizeConstruccionesMessage };