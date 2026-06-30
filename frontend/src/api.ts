import { getLoginPath, isLoginPath } from "./config/appBase";
import { getApiUrl } from "./config/apiUrl";
import { clearToken, getToken } from "./auth/storage";
import type { UserInfo } from "./types/auth";
import type { PublicConfig } from "./types/config";

export interface ParcelSummary {
  id: string;
  cadastral_code: string;
  predial_account: string | null;
  colony: string | null;
  address: string | null;
  area_m2: number | null;
  land_use: string | null;
  status: string;
  cadastral_value: number | null;
}

export interface PartySummary {
  id: string;
  document_id: string;
  full_name: string;
  party_type: string;
}

export interface OwnershipRow {
  id: string;
  right_type: string;
  share_percent: number;
  party: { id: string; full_name: string; document_id: string } | null;
}

export type GeoJSONFeatureCollection = GeoJSON.FeatureCollection;

export type UserRow = UserInfo;
export interface RoleRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  permissions: string[];
}

async function parseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  const detail = (body as { detail?: string | { msg: string }[] }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join(", ");
  return `Error ${res.status}`;
}

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${getApiUrl()}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    if (!isLoginPath()) {
      window.location.href = getLoginPath();
    }
    throw new Error("Sesión expirada");
  }
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  return res.json() as Promise<T>;
}

export function getParcels(): Promise<ParcelSummary[]> {
  return fetchJson("/api/v1/parcels");
}

export function getParcelsGeoJSON(): Promise<GeoJSONFeatureCollection> {
  return fetchJson("/api/v1/parcels/geojson");
}

export function getParties(): Promise<PartySummary[]> {
  return fetchJson("/api/v1/parties");
}

export function getParcelOwnerships(id: string): Promise<OwnershipRow[]> {
  return fetchJson(`/api/v1/parcels/${id}/ownerships`);
}
export interface PredioPropietarioItem {
  id_predio_propietario: number;
  id_persona: number;
  nombre_completo: string;
  rfc: string | null;
  porcentaje_propiedad: number;
  tipo_titularidad: string;
  vigente: boolean;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

export interface PredioPropietariosResponse {
  clave_catastral: string;
  total_participacion: number;
  items: PredioPropietarioItem[];
}

export function getPredioPropietarios(
  clave: string
): Promise<PredioPropietariosResponse> {
  return fetchJson(
    `/api/v1/cadastral/${encodeURIComponent(clave.trim())}/propietarios`
  );
}

export interface PredioFolioRealResponse {
  clave_catastral: string;
  folio_real: string | null;
}

export function getPredioFolioReal(
  clave: string
): Promise<PredioFolioRealResponse> {
  return fetchJson(
    `/api/v1/cadastral/${encodeURIComponent(clave.trim())}/folio-real`
  );
}

export interface PredioAlfanumericoRecord {
  id: string;
  parcel_id: string | null;
  clave_catastral: string;
  clave_catastral_norm: string | null;
  nombre_completo: string | null;
  delegacion: string | null;
  colonia: string | null;
  calle: string | null;
  numof: string | null;
  numint: string | null;
  letra: string | null;
  zonah: string | null;
  valor2026: string | number | null;
  sup_documental: string | number | null;
  sup_fisica: string | number | null;
  condominio: string | null;
  adeudo_2026: string | number | null;
  adeudo_total: string | number | null;
  sup_const: string | number | null;
  id_tasa: string | number | null;
  descripcion_uso: string | null;
  porcentaje_tasa: string | number | null;
  imported_at: string;
  updated_at: string;
}

export interface CadastralSearchResult {
  query: string;
  items: PredioAlfanumericoRecord[];
  total: number;
}

export type SearchCombinar = "todos" | "cualquiera";

export interface CadastralAdvancedSearchParams {
  clave?: string;
  apellido?: string;
  /** Alias legacy del formulario */
  nombre?: string;
  calle?: string;
  numof?: string;
  colonia?: string;
  combinar?: SearchCombinar;
  page?: number;
  page_size?: number;
}

export interface CadastralAdvancedSearchResult {
  items: PredioAlfanumericoRecord[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  combinar?: SearchCombinar;
  criteria: {
    clave: string | null;
    apellido: string | null;
    calle: string | null;
    numof: string | null;
    colonia: string | null;
  };
}

export interface ParcelGeoJSON extends ParcelSummary {
  geometry: GeoJSON.Geometry | null;
  source_layer?: string | null;
  source_fid?: string | null;
  synced_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export function searchCadastral(
  q: string,
  limit = 25
): Promise<CadastralSearchResult> {
  const qs = new URLSearchParams({ q: q.trim(), limit: String(limit) });
  return fetchJson(`/api/v1/cadastral/search?${qs}`);
}

function filterItemsLocal(
  items: PredioAlfanumericoRecord[],
  params: CadastralAdvancedSearchParams
): PredioAlfanumericoRecord[] {
  const up = (s: string) => s.trim().toUpperCase();
  const clave = params.clave?.trim().toUpperCase();
  const apellido = (params.apellido ?? params.nombre)?.trim().toUpperCase();
  const calle = params.calle?.trim().toUpperCase();
  const colonia = params.colonia?.trim().toUpperCase();
  const numof = params.numof?.trim();
  const combinar = params.combinar ?? "todos";

  const checks: ((r: PredioAlfanumericoRecord) => boolean)[] = [];
  if (clave && clave.length >= 2) {
    checks.push((r) => {
      const k = (r.clave_catastral_norm ?? r.clave_catastral).toUpperCase();
      if (clave.includes("_") || clave.includes("*") || clave.includes("%")) {
        const like = clave.replace(/\*/g, "%");
        const re = new RegExp(
          "^" + like.replace(/%/g, ".*").replace(/_/g, ".") + "$",
          "i"
        );
        return re.test(k) || re.test(r.clave_catastral);
      }
      return k.startsWith(clave) || r.clave_catastral.toUpperCase().startsWith(clave);
    });
  }
  if (apellido && apellido.length >= 2) {
    checks.push((r) => up(r.nombre_completo ?? "").includes(apellido));
  }
  if (calle && calle.length >= 2) {
    checks.push((r) => up(r.calle ?? "").includes(calle));
  }
  if (colonia && colonia.length >= 2) {
    checks.push((r) => up(r.colonia ?? "").includes(colonia));
  }
  if (numof) {
    checks.push((r) => (r.numof ?? "").includes(numof));
  }
  if (!checks.length) return items;

  return items.filter((r) =>
    combinar === "cualquiera"
      ? checks.some((fn) => fn(r))
      : checks.every((fn) => fn(r))
  );
}

async function searchCadastralLegacyFallback(
  params: CadastralAdvancedSearchParams
): Promise<CadastralAdvancedSearchResult> {
  const term =
    params.clave?.trim() ||
    params.apellido?.trim() ||
    params.nombre?.trim() ||
    params.colonia?.trim() ||
    params.calle?.trim() ||
    "";
  const page = params.page ?? 1;
  const pageSize = params.page_size ?? 500;
  const legacy = await searchCadastral(term, Math.min(pageSize, 500));
  let items = filterItemsLocal(legacy.items, params);
  const total = items.length;
  const start = (page - 1) * pageSize;
  items = items.slice(start, start + pageSize);
  const totalPages = Math.ceil(total / pageSize) || 0;
  return {
    items,
    total,
    page,
    page_size: pageSize,
    total_pages: totalPages,
    combinar: params.combinar ?? "todos",
    criteria: {
      clave: params.clave?.trim() || null,
      apellido: (params.apellido ?? params.nombre)?.trim() || null,
      calle: params.calle?.trim() || null,
      numof: params.numof?.trim() || null,
      colonia: params.colonia?.trim() || null,
    },
  };
}

export async function searchCadastralAdvanced(
  params: CadastralAdvancedSearchParams
): Promise<CadastralAdvancedSearchResult> {
  const qs = new URLSearchParams();
  if (params.clave?.trim()) qs.set("clave", params.clave.trim());
  const titular = (params.apellido ?? params.nombre)?.trim();
  if (titular) {
    qs.set("apellido", titular);
    qs.set("nombre", titular);
  }
  if (params.calle?.trim()) qs.set("calle", params.calle.trim());
  if (params.numof?.trim()) qs.set("numof", params.numof.trim());
  if (params.colonia?.trim()) qs.set("colonia", params.colonia.trim());
  if (params.combinar) qs.set("combinar", params.combinar);
  qs.set("page", String(params.page ?? 1));
  qs.set("page_size", String(params.page_size ?? 500));
  try {
    return await fetchJson(`/api/v1/cadastral/search/advanced?${qs}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
      return searchCadastralLegacyFallback(params);
    }
    throw err;
  }
}

export function getCadastralRecord(
  clave: string
): Promise<PredioAlfanumericoRecord> {
  return fetchJson(
    `/api/v1/cadastral/${encodeURIComponent(clave.trim())}`
  );
}

export interface FiscalRefreshResponse {
  record: PredioAlfanumericoRecord;
  fiscal: {
    found: boolean;
    source_layer?: string | null;
    adeudo_2026?: string | number | null;
    adeudo_total?: string | number | null;
    note?: string | null;
    sample_property_keys?: string[];
  };
}

/** Consulta adeudos en GeoServer y actualiza el padrón si hay datos. */
export function refreshCadastralFiscal(
  clave: string
): Promise<FiscalRefreshResponse> {
  return fetchJson(
    `/api/v1/cadastral/${encodeURIComponent(clave.trim())}/fiscal/refresh`,
    { method: "POST" }
  );
}

export interface CadastralMapGeometry {
  clave_catastral: string;
  geometry: GeoJSON.Geometry;
  source: "geonode_wfs" | "database_sync" | string | null;
  wfs_feature_count?: number;
  database_cadastral_code?: string | null;
  note?: string | null;
}

/** Geometría alineada con GeoServer WMS (WFS en vivo). null si no hay polígono. */
export async function getCadastralMapGeometry(
  clave: string
): Promise<CadastralMapGeometry | null> {
  const norm = clave.trim();
  if (!norm) return null;

  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(
    `${getApiUrl()}/api/v1/cadastral/${encodeURIComponent(norm)}/map-geometry`,
    { headers }
  );
  if (res.status === 401) {
    clearToken();
    if (!isLoginPath()) {
      window.location.href = getLoginPath();
    }
    throw new Error("Sesión expirada");
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const data = (await res.json()) as CadastralMapGeometry;
  return data.geometry ? data : null;
}

export interface BatchMapGeometriesResponse {
  type: "FeatureCollection";
  features: GeoJSON.Feature[];
  requested: number;
  drawn: number;
  failed: number;
  max_items: number;
}

/** Polígonos de una búsqueda con propiedad fiscal (sin_adeudo | con_adeudo). */
export function postBatchMapGeometries(
  claves: string[],
  maxItems = 80
): Promise<BatchMapGeometriesResponse> {
  return fetchJson("/api/v1/cadastral/map-geometries/batch", {
    method: "POST",
    body: JSON.stringify({ claves, max_items: maxItems }),
  });
}

export function getParcel(id: string): Promise<ParcelGeoJSON> {
  return fetchJson(`/api/v1/parcels/${id}`);
}

export function getHealth(): Promise<{ status: string; database: string }> {
  return fetchJson("/api/v1/health");
}

export function getConfig(): Promise<PublicConfig> {
  return fetchJson("/api/v1/config");
}

export interface GeonodeStatus {
  ok: boolean;
  configured: boolean;
  credentials_configured: boolean;
  message: string;
  http_status?: number | null;
}

export function getGeonodeStatus(): Promise<GeonodeStatus> {
  return fetchJson("/api/v1/geonode/status");
}

export interface SourceStatus {
  ok: boolean;
  configured: boolean;
  credentials_configured: boolean;
  message: string;
  source_layer?: string | null;
  title?: string;
  sample_property_keys?: string[];
}

export interface SyncResult {
  source_layer: string;
  created: number;
  updated: number;
  skipped: number;
  fetched: number;
  synced_total: number;
  dry_run: boolean;
}

export function getSourceStatus(): Promise<SourceStatus> {
  return fetchJson("/api/v1/source/status");
}

export interface CatalogSummary {
  predios_alfanumerico: number;
  predios_linked: number;
  coverage_percent: number;
  delegaciones: number;
  colonias: number;
  titulares: number;
  valuaciones: number;
}

export function getCatalogSummary(): Promise<CatalogSummary> {
  return fetchJson("/api/v1/catalogs/summary");
}

export function syncFromGeonode(params?: {
  max_features?: number;
  dry_run?: boolean;
}): Promise<SyncResult> {
  const qs = new URLSearchParams();
  if (params?.max_features != null) {
    qs.set("max_features", String(params.max_features));
  }
  if (params?.dry_run) qs.set("dry_run", "true");
  const query = qs.toString();
  return fetchJson(`/api/v1/source/sync${query ? `?${query}` : ""}`, {
    method: "POST",
  });
}

export interface AdeudoSyncResult {
  source_layer: string;
  fetched: number;
  updated: number;
  unchanged: number;
  skipped_no_clave: number;
  skipped_no_padron: number;
  skipped_no_adeudo: number;
  predios_con_adeudo: number;
  dry_run: boolean;
  ejercicio: number;
}

export interface FiscalStatus {
  ok: boolean;
  configured: boolean;
  credentials_configured: boolean;
  message: string;
  adeudo_layer?: string | null;
  sample_property_keys?: string[];
}

export function getFiscalStatus(): Promise<FiscalStatus> {
  return fetchJson("/api/v1/fiscal/status");
}

export function syncAdeudosFromGeonode(params?: {
  max_features?: number;
  dry_run?: boolean;
}): Promise<AdeudoSyncResult> {
  const qs = new URLSearchParams();
  if (params?.max_features != null) {
    qs.set("max_features", String(params.max_features));
  }
  if (params?.dry_run) qs.set("dry_run", "true");
  const query = qs.toString();
  return fetchJson(`/api/v1/fiscal/sync${query ? `?${query}` : ""}`, {
    method: "POST",
  });
}

export function listUsers(): Promise<UserRow[]> {
  return fetchJson("/api/v1/users");
}

export function listRoles(): Promise<RoleRow[]> {
  return fetchJson("/api/v1/roles");
}

export function createUser(payload: {
  username: string;
  password: string;
  full_name: string;
  email?: string;
  role_code: string;
}): Promise<UserRow> {
  return fetchJson("/api/v1/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateRolePermissions(
  roleCode: string,
  permissions: string[]
): Promise<RoleRow> {
  return fetchJson(`/api/v1/roles/${roleCode}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ permissions }),
  });
}
export interface ExpedienteInfo {
  id: number;
  clave_catastral: string;
  estado: string;
  fecha_creacion: string;
  fecha_actualizacion: string;
  observaciones: string | null;
}

export function getExpediente(
  clave: string
): Promise<ExpedienteInfo> {
  return fetchJson(
    `/api/v1/expediente/${encodeURIComponent(clave.trim())}`
  );
}

export interface ExpedienteHistorialItem {
  id: number;
  expediente_id: number;
  clave_catastral: string;
  tipo_evento: string;
  descripcion: string | null;
  usuario: string | null;
  fecha_evento: string;
}

export function getExpedienteHistorial(
  clave: string
): Promise<ExpedienteHistorialItem[]> {
  return fetchJson(
    `/api/v1/expediente/${encodeURIComponent(clave.trim())}/historial`
  );
}

export interface MovimientoSGC {
  id: number;
  folio: string;
  clave_catastral: string;
  tipo_movimiento: string;
  estado: string;
  descripcion: string | null;
  usuario_captura: string | null;
  fecha_captura: string | null;
}

export function getMovimientosSGC(clave: string): Promise<MovimientoSGC[]> {
  return fetchJson(
    `/api/v1/movimientos/${encodeURIComponent(clave.trim())}`
  );
}
export interface MovimientoCreatePayload {
  clave_catastral: string;
  tipo_movimiento: string;
  descripcion?: string | null;
  usuario_captura?: string | null;
}

export function createMovimientoSGC(
  payload: MovimientoCreatePayload
): Promise<MovimientoSGC> {
  return fetchJson("/api/v1/movimientos", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export interface MovimientoEstadoPayload {
  estado: string;
  usuario?: string | null;
  observaciones?: string | null;
}

export function cambiarEstadoMovimientoSGC(
  id: number,
  payload: MovimientoEstadoPayload
): Promise<MovimientoSGC> {
  return fetchJson(`/api/v1/movimientos/${id}/estado`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
