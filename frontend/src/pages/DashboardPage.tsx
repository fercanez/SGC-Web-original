import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import CadastralMap from "../components/CadastralMap";
import CadastralSidebar, {
  type BaseMapId,
  type SearchFields,
  type SidebarSection,
} from "../components/CadastralSidebar";
import PredioInfoPanel, {
  type PredioInfoTab,
} from "../components/PredioInfoPanel";
import ResultadosCatastrales, {
  type ResultsPanelMode,
} from "../components/ResultadosCatastrales";
import {
  getCatalogSummary,
  listUsers,
  getConfig,
  getGeonodeStatus,
  getHealth,
  getCadastralMapGeometry,
  refreshCadastralFiscal,
  getParcel,
  getParcelOwnerships,
  getParcels,
  getParcelsGeoJSON,
  getFiscalStatus,
  getSourceStatus,
  postBatchMapGeometries,
  searchCadastralAdvanced,
  syncAdeudosFromGeonode,
  syncFromGeonode,
  type CatalogSummary,
  type SearchCombinar,
  type GeoJSONFeatureCollection,
  type GeonodeStatus,
  type OwnershipRow,
  type ParcelSummary,
  type PredioAlfanumericoRecord,
  type FiscalStatus,
  type SourceStatus,
  type SyncResult,
} from "../api";
import {
  centroidFromGeometry,
  normalizeCadastralCode,
} from "../utils/geometry";
import {
  applyFiscalToFeatures,
  buildHighlightCollection,
  fetchGeometriesFromParcels,
  fetchMapGeometriesFallback,
  findGeometryInSearch,
  fiscalMapFromItems,
  resolveParcelGeometry,
} from "../utils/mapHighlights";
import { fiscalStatusFromAdeudos } from "../utils/fiscal";
import type { PublicConfig } from "../types/config";

const emptySearch = (): SearchFields => ({
  clave: "",
  apellido: "",
  calle: "",
  numof: "",
  colonia: "",
});

function hasSearchCriteria(f: SearchFields): boolean {
  if (f.clave.trim().length >= 2) return true;
  if (f.apellido.trim().length >= 2) return true;
  if (f.calle.trim().length >= 2) return true;
  if (f.colonia.trim().length >= 2) return true;
  if (f.numof.trim().length >= 1) return true;
  return false;
}

export default function DashboardPage() {
  const { user, logout, hasPermission } = useAuth();
  const [sidebarSection, setSidebarSection] =
    useState<SidebarSection>("consulta");
  const [infoTab, setInfoTab] = useState<PredioInfoTab>("identificacion");
  const [resultsFilter, setResultsFilter] = useState("");
  const [resultsCompact, setResultsCompact] = useState(false);
  const [searchFields, setSearchFields] = useState<SearchFields>(emptySearch);
  const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>(
    {}
  );
  const [layerOpacity, setLayerOpacity] = useState<Record<string, number>>({});
  const [layerOrder, setLayerOrder] = useState<string[]>([]);
  const [baseMap, setBaseMap] = useState<BaseMapId>("hybrid");
  const [showCartoPanel, setShowCartoPanel] = useState(true);
  const [showFloatingLegend, setShowFloatingLegend] = useState(true);
  const [adminStats, setAdminStats] = useState<{
    total: number;
    active: number;
  } | null>(null);
  const [catalogSummary, setCatalogSummary] = useState<CatalogSummary | null>(
    null
  );
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [parcels, setParcels] = useState<ParcelSummary[]>([]);
  const [geojson, setGeojson] = useState<GeoJSONFeatureCollection | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ownerships, setOwnerships] = useState<OwnershipRow[]>([]);
  const [health, setHealth] = useState<"ok" | "error" | "loading">("loading");
  const [geonodeStatus, setGeonodeStatus] = useState<GeonodeStatus | null>(
    null
  );
  const [sourceStatus, setSourceStatus] = useState<SourceStatus | null>(null);
  const [fiscalStatus, setFiscalStatus] = useState<FiscalStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncingAdeudos, setSyncingAdeudos] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<PredioAlfanumericoRecord[]>(
    []
  );
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotalPages, setSearchTotalPages] = useState(0);
  const [searchCombinar, setSearchCombinar] =
    useState<SearchCombinar>("todos");
  const [resultsPanelMode, setResultsPanelMode] =
    useState<ResultsPanelMode>("hidden");
  const [padron, setPadron] = useState<PredioAlfanumericoRecord | null>(null);
  const [mapFlyTo, setMapFlyTo] = useState<{
    lng: number;
    lat: number;
    zoom?: number;
  } | null>(null);
  const [highlightGeometry, setHighlightGeometry] =
    useState<GeoJSON.Geometry | null>(null);
  const [highlightLabel, setHighlightLabel] = useState<string | null>(null);
  const [geometrySource, setGeometrySource] = useState<string | null>(null);
  const [geometryLoading, setGeometryLoading] = useState(false);
  const [searchHighlights, setSearchHighlights] =
    useState<GeoJSON.FeatureCollection | null>(null);
  const [mapHighlightsLoading, setMapHighlightsLoading] = useState(false);
  const [mapFitNonce, setMapFitNonce] = useState(0);
  const loadSeqRef = useRef(0);

  const loadSearchMapHighlights = useCallback(
    async (items: PredioAlfanumericoRecord[]) => {
      if (items.length < 2) {
        setSearchHighlights(null);
        return;
      }
      setMapHighlightsLoading(true);
      const fiscalByClave = fiscalMapFromItems(items);
      try {
        const claves = items.map((r) => r.clave_catastral);
        let features: GeoJSON.Feature[] = [];
        try {
          const fc = await postBatchMapGeometries(claves, 80);
          features = applyFiscalToFeatures(fc.features, fiscalByClave);
        } catch {
          features = [];
        }
        if (features.length === 0) {
          features = await fetchMapGeometriesFallback(items);
        }
        if (features.length === 0) {
          features = await fetchGeometriesFromParcels(items);
        }
        if (features.length === 0) {
          setSearchHighlights(null);
          setSearchError(
            "No se pudieron dibujar los predios en el mapa. Verifique la API y GeoNode."
          );
        } else {
          setSearchHighlights(buildHighlightCollection(features));
          setMapFitNonce((n) => n + 1);
        }
      } finally {
        setMapHighlightsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!padron || !searchHighlights?.features.length) return;
    const fiscal = fiscalStatusFromAdeudos(
      padron.adeudo_2026,
      padron.adeudo_total
    );
    const padronClaveNorm = normalizeCadastralCode(padron.clave_catastral);
    setSearchHighlights((prev) => {
      if (!prev) return prev;
      let changed = false;
      const features = prev.features.map((f) => {
        if (
          normalizeCadastralCode(String(f.properties?.clave ?? "")) !==
          padronClaveNorm
        ) {
          return f;
        }
        if (f.properties?.fiscal === fiscal) return f;
        changed = true;
        return {
          ...f,
          properties: { ...f.properties, fiscal },
        };
      });
      return changed ? { ...prev, features } : prev;
    });
  }, [
    padron?.clave_catastral,
    padron?.adeudo_2026,
    padron?.adeudo_total,
    searchHighlights?.features.length,
  ]);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    const stale = () => seq !== loadSeqRef.current;

    try {
      setError(null);
      setHealth("loading");

      const cfg = await getConfig();
      if (stale()) return;
      setConfig(cfg);

      if (cfg.geonode.enabled || cfg.geonode.auth_required) {
        getGeonodeStatus()
          .then((status) => {
            if (!stale()) setGeonodeStatus(status);
          })
          .catch(() => {
            if (stale()) return;
            setGeonodeStatus({
              ok: false,
              configured: true,
              credentials_configured: cfg.geonode.credentials_configured,
              message: "No se pudo verificar el acceso a GeoMexicali",
            });
          });
      } else {
        setGeonodeStatus(null);
      }

      if (cfg.source.enabled) {
        getSourceStatus()
          .then((status) => {
            if (!stale()) setSourceStatus(status);
          })
          .catch(() => {
            if (stale()) return;
            setSourceStatus({
              ok: false,
              configured: true,
              credentials_configured: cfg.geonode.credentials_configured,
              message: "No se pudo verificar el origen vectorial",
              source_layer: cfg.source.layer,
            });
          });
      } else {
        setSourceStatus(null);
      }

      if (cfg.source.enabled) {
        getFiscalStatus()
          .then((status) => {
            if (!stale()) setFiscalStatus(status);
          })
          .catch(() => {
            if (stale()) return;
            setFiscalStatus({
              ok: false,
              configured: false,
              credentials_configured: cfg.geonode.credentials_configured,
              message: "No se pudo verificar la capa de adeudos",
            });
          });
      } else {
        setFiscalStatus(null);
      }

      const h = await getHealth();
      if (stale()) return;
      setHealth(h.database === "ok" ? "ok" : "error");

      // Secuencial: evita agotar el pool de PostgreSQL al entrar/salir
      const p = await getParcels();
      if (stale()) return;
      setParcels(p);

      // Con origen WMS (381k+ predios) no descargar GeoJSON completo; el mapa usa capas GeoNode.
      if (!cfg.source.enabled) {
        try {
          const g = await getParcelsGeoJSON();
          if (stale()) return;
          setGeojson(g);
        } catch {
          if (!stale()) setGeojson(null);
        }
      } else {
        setGeojson(null);
      }

      getCatalogSummary()
        .then((s) => {
          if (!stale()) setCatalogSummary(s);
        })
        .catch(() => {
          if (!stale()) setCatalogSummary(null);
        });

      if (p.length) {
        setSelectedId((prev) => prev ?? p[0].id);
      }
    } catch (e) {
      if (stale()) return;
      setHealth("error");
      setError(e instanceof Error ? e.message : "Error al conectar con la API");
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      loadSeqRef.current += 1;
    };
  }, [load]);

  useEffect(() => {
    const layers = config?.geonode.layers ?? [];
    if (!layers.length) return;
    setVisibleLayers((prev) => {
      const next = { ...prev };
      for (const l of layers) {
        if (next[l.id] === undefined) next[l.id] = true;
      }
      return next;
    });
    setLayerOpacity((prev) => {
      const next = { ...prev };
      for (const l of layers) {
        if (next[l.id] === undefined) next[l.id] = 1;
      }
      return next;
    });
    setLayerOrder((prev) => {
      if (prev.length === layers.length) return prev;
      return layers.map((l) => l.id);
    });
  }, [config?.geonode.layers]);

  useEffect(() => {
    if (sidebarSection !== "admin" || !hasPermission("users.read")) return;
    listUsers()
      .then((users) =>
        setAdminStats({
          total: users.length,
          active: users.filter((u) => u.is_active).length,
        })
      )
      .catch(() => setAdminStats(null));
  }, [sidebarSection, hasPermission("users.read")]);

  useEffect(() => {
    if (!selectedId) {
      setOwnerships([]);
      return;
    }
    getParcelOwnerships(selectedId)
      .then(setOwnerships)
      .catch(() => setOwnerships([]));
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || padron?.parcel_id === selectedId) return;
    const parcel = parcels.find((p) => p.id === selectedId);
    if (!parcel?.cadastral_code) return;
    getCadastralMapGeometry(parcel.cadastral_code)
      .then((mapGeo) => {
        if (mapGeo?.geometry) {
          setHighlightGeometry(mapGeo.geometry);
          setHighlightLabel(parcel.cadastral_code);
        }
      })
      .catch(() => {});
  }, [selectedId, padron?.parcel_id, parcels]);

  const geonodeLayerCount = config?.geonode.layers?.length ?? 0;
  const selected = parcels.find((p) => p.id === selectedId);
  const cartographyMatchesPadron =
    padron &&
    selected &&
    normalizeCadastralCode(selected.cadastral_code) ===
      normalizeCadastralCode(
        padron.clave_catastral_norm ?? padron.clave_catastral
      );
  /** Si hay polígono resaltado para el predio consultado (WFS/BD). */
  const padronEnMapaBusqueda =
    padron &&
    searchHighlights?.features.some(
      (f) => f.properties?.clave === padron.clave_catastral
    );
  const dibujadoEnMapa = !!(
    padron && (highlightGeometry || padronEnMapaBusqueda)
  );
  const padronFiscal = padron
    ? fiscalStatusFromAdeudos(padron.adeudo_2026, padron.adeudo_total)
    : "sin_adeudo";
  const activeMapHighlight = useMemo(() => {
    if (!padron) return null;
    const geometry =
      highlightGeometry ??
      findGeometryInSearch(searchHighlights, padron.clave_catastral);
    if (!geometry) return null;
    return {
      geometry,
      fiscal: padronFiscal,
      clave: padron.clave_catastral,
    };
  }, [padron, highlightGeometry, searchHighlights, padronFiscal]);
  const muniLabel =
    config?.municipality.full_name ?? "Mexicali, Baja California";
  const currency = config?.locale.currency ?? "MXN";

  function applyHighlightGeometry(
    geom: GeoJSON.Geometry,
    clave: string,
    source: string
  ) {
    setHighlightGeometry(geom);
    setHighlightLabel(clave);
    setGeometrySource(source);
    const c = centroidFromGeometry(geom);
    if (c && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90) {
      setMapFlyTo({ lng: c[0], lat: c[1], zoom: 17.5 });
    }
    setMapFitNonce((n) => n + 1);
  }

  async function selectPadronRecord(record: PredioAlfanumericoRecord) {
    const activeRecord = record;
    setPadron(activeRecord);
    setSearchError(null);
    if (searchTotal > 0) setResultsPanelMode("open");
    setSidebarSection("consulta");
    setInfoTab("identificacion");
    setMapFlyTo(null);
    setSelectedId(null);
    setHighlightGeometry(null);
    setHighlightLabel(null);
    setGeometryLoading(true);

    let linkMismatch = false;

    if (record.parcel_id) {
      try {
        const linked = await getParcel(record.parcel_id);
        const sameCode =
          normalizeCadastralCode(linked.cadastral_code) ===
          normalizeCadastralCode(
            record.clave_catastral_norm ?? record.clave_catastral
          );
        if (sameCode) {
          setSelectedId(record.parcel_id);
        } else {
          linkMismatch = true;
          setSelectedId(null);
        }
      } catch {
        linkMismatch = true;
      }
    }

    try {
      /* Geometría con contorno REAL: primero WFS/parcels (detalle completo);
         el batch de la manzana viene simplificado y solo sirve de respaldo. */
      const mapGeo = await getCadastralMapGeometry(
        activeRecord.clave_catastral
      ).catch(() => null);
      const parcelGeom = mapGeo?.geometry
        ? null
        : await resolveParcelGeometry(activeRecord);
      const localGeom =
        mapGeo?.geometry || parcelGeom
          ? null
          : findGeometryInSearch(searchHighlights, activeRecord.clave_catastral);

      if (mapGeo?.geometry) {
        applyHighlightGeometry(
          mapGeo.geometry,
          activeRecord.clave_catastral,
          mapGeo.source ?? "geonode_wfs"
        );
        if (mapGeo.note) setSearchError(mapGeo.note);
      } else if (parcelGeom) {
        applyHighlightGeometry(
          parcelGeom,
          activeRecord.clave_catastral,
          "database_parcel"
        );
      } else if (localGeom) {
        applyHighlightGeometry(
          localGeom,
          activeRecord.clave_catastral,
          "search_batch"
        );
      } else {
        setHighlightGeometry(null);
        setHighlightLabel(null);
        setGeometrySource(null);
        if (linkMismatch) {
          setSearchError(
            `Sin geometría en mapa. El padrón ${activeRecord.clave_catastral} tiene un enlace cartográfico desactualizado; ejecute POST /api/v1/cadastral/link en el servidor.`
          );
        } else if (!activeRecord.parcel_id) {
          setSearchError(
            "Predio en padrón sin polígono en cartografía (sin parcel_id ni WFS)."
          );
        }
      }
    } catch (err) {
      if (!linkMismatch) {
        setSearchError(
          err instanceof Error
            ? err.message
            : "No se pudo cargar la geometría del predio en el mapa."
        );
      } else {
        setSearchError(
          "Enlace cartográfico desactualizado. Ejecute POST /api/v1/cadastral/link en el servidor."
        );
      }
    } finally {
      setGeometryLoading(false);
    }
  }

  async function runAdvancedSearch(page = 1) {
    if (!hasSearchCriteria(searchFields)) {
      setSearchError(
        "Indique al menos un criterio: clave (2+), apellido, calle, colonia (2+) o número oficial."
      );
      return;
    }
    setSearching(true);
    setSearchError(null);
    if (page === 1) {
      setSearchResults([]);
      setSearchHighlights(null);
      setResultsFilter("");
    }
    try {
      const res = await searchCadastralAdvanced({
        clave: searchFields.clave.trim() || undefined,
        apellido: searchFields.apellido.trim() || undefined,
        calle: searchFields.calle.trim() || undefined,
        numof: searchFields.numof.trim() || undefined,
        colonia: searchFields.colonia.trim() || undefined,
        combinar: searchCombinar,
        page,
        page_size: 500,
      });
      setSearchResults(res.items);
      setSearchTotal(res.total);
      setSearchPage(res.page);
      setSearchTotalPages(res.total_pages);
      setResultsPanelMode(res.total > 0 ? "open" : "hidden");

      if (res.total === 1 && res.items[0]) {
        setSearchHighlights(null);
        await selectPadronRecord(res.items[0]);
      } else if (res.total === 0) {
        setPadron(null);
        setSearchHighlights(null);
        setHighlightGeometry(null);
        setHighlightLabel(null);
        const multi =
          [
            searchFields.clave.trim(),
            searchFields.apellido.trim(),
            searchFields.calle.trim(),
            searchFields.colonia.trim(),
            searchFields.numof.trim(),
          ].filter((x) => x.length > 0).length > 1;
        setSearchError(
          multi && searchCombinar === "todos"
            ? "Sin resultados. Con «Todos (AND)» cada campo debe coincidir. Pruebe «Cualquiera (OR)» o use un solo criterio (ej. solo clave ST)."
            : "No se encontró ningún predio con esos criterios."
        );
      } else {
        setPadron(null);
        setHighlightGeometry(null);
        setHighlightLabel(null);
        void loadSearchMapHighlights(res.items);
      }
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Error al buscar en el padrón"
      );
      setPadron(null);
      setResultsPanelMode("hidden");
    } finally {
      setSearching(false);
    }
  }

  async function handlePadronSearch(e?: FormEvent) {
    e?.preventDefault();
    await runAdvancedSearch(1);
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    setError(null);
    try {
      const result: SyncResult = await syncFromGeonode();
      setSyncMessage(
        `Cartografía: ${result.created} nuevos, ${result.updated} actualizados, ${result.skipped} omitidos (${result.synced_total} en total).`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al sincronizar predios");
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncAdeudos() {
    setSyncingAdeudos(true);
    setSyncMessage(null);
    setError(null);
    try {
      const result = await syncAdeudosFromGeonode();
      setSyncMessage(
        `Adeudos: ${result.updated} actualizados, ${result.unchanged} sin cambio, ` +
          `${result.skipped_no_padron} sin padrón, ${result.predios_con_adeudo} con dato fiscal en BD.`
      );
      await load();
      if (padron?.clave_catastral) {
        try {
          const refreshed = await refreshCadastralFiscal(padron.clave_catastral);
          setPadron(refreshed.record);
        } catch {
          /* mantener registro actual */
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al sincronizar adeudos");
    } finally {
      setSyncingAdeudos(false);
    }
  }

  const displayClave =
    padron?.clave_catastral ??
    highlightLabel ??
    (searchFields.clave.trim() || null);
  const resultItems = searchResults;
  const showResultsTable =
    searchTotal > 0 || searchResults.length > 0 || searching;
  const totalPredios =
    catalogSummary?.predios_alfanumerico ?? parcels.length;
  const coverage = catalogSummary?.coverage_percent;
  const geonodeLayers = config?.geonode.layers ?? [];

  return (
    <div className="app app-catastro">
      <header className="cm-topbar">
        <div className="cm-brand">
          <h1>Catastro Mexicali</h1>
          <p>{muniLabel}</p>
        </div>
        <div className="cm-topbar-right">
          {showCartoPanel && (
            <div className="cm-carto-box">
              <span className="cm-carto-label">Control cartográfico</span>
              <div className="cm-carto-stats">
                <span>
                  Total predios:{" "}
                  <strong>
                    {totalPredios
                      ? totalPredios.toLocaleString("es-MX")
                      : "—"}
                  </strong>
                </span>
                {coverage != null && (
                  <span>
                    Cobertura: <strong>{coverage}%</strong>
                  </span>
                )}
              </div>
            </div>
          )}
          <div className="cm-user-box">
            <span>{user?.full_name ?? "Usuario"}</span>
            <span className="cm-role">ROL: {user?.role.name ?? "—"}</span>
            {hasPermission("users.read") && (
              <Link to="/admin/usuarios" className="cm-link-admin">
                Admin
              </Link>
            )}
            <button type="button" className="cm-btn-salir" onClick={logout}>
              Salir
            </button>
          </div>
          <span
            className={`cm-api-dot ${health === "ok" ? "ok" : ""}`}
            title={
              health === "ok"
                ? "API conectada"
                : health === "loading"
                  ? "Conectando…"
                  : "API sin conexión"
            }
          />
        </div>
      </header>

      {(health === "error" || syncMessage || searchError) && (
        <div className="cm-alerts">
          {health === "error" && (
            <p className="cm-alert cm-alert-error" role="alert">
              <strong>Sin conexión a la API.</strong> {error}{" "}
              <button type="button" onClick={() => load()}>
                Reintentar
              </button>
            </p>
          )}
          {syncMessage && (
            <p className="cm-alert cm-alert-ok" role="status">
              {syncMessage}
            </p>
          )}
          {mapHighlightsLoading && (
            <p className="cm-muted small" role="status">
              Cargando predios en el mapa…
            </p>
          )}
          {searchError && health === "ok" && (
            <p className="cm-alert cm-alert-warn" role="alert">
              {searchError}
            </p>
          )}
        </div>
      )}

      <div className="cm-stage">
        <section className="cm-map-layer">
          <CadastralMap
            geojson={geojson}
            selectedId={selectedId}
            onSelect={setSelectedId}
            config={config}
            flyTo={mapFlyTo}
            highlightLabel={highlightLabel}
            highlightFiscal={padronFiscal}
            activeHighlight={activeMapHighlight}
            searchHighlights={searchHighlights}
            mapFitNonce={mapFitNonce}
            activeSearchClave={
              padron ? normalizeCadastralCode(padron.clave_catastral) : null
            }
            visibleLayers={visibleLayers}
            layerOpacity={layerOpacity}
            layerOrder={layerOrder}
            baseMap={baseMap}
          />
        </section>

        <CadastralSidebar
          section={sidebarSection}
          onSectionChange={setSidebarSection}
          showAdmin={hasPermission("users.read")}
          search={searchFields}
          onSearchChange={setSearchFields}
          onSearchSubmit={handlePadronSearch}
          searching={searching}
          searchResults={searchResults}
          searchTotal={searchTotal}
          searchPage={searchPage}
          searchTotalPages={searchTotalPages}
          combinar={searchCombinar}
          onCombinarChange={setSearchCombinar}
          padron={padron}
          onSelectRecord={selectPadronRecord}
          config={config}
          geonodeLayers={geonodeLayers}
          visibleLayers={visibleLayers}
          onVisibleLayersChange={setVisibleLayers}
          layerOpacity={layerOpacity}
          onLayerOpacityChange={(id, v) =>
            setLayerOpacity((o) => ({ ...o, [id]: v }))
          }
          layerOrder={layerOrder}
          onLayerOrderChange={setLayerOrder}
          baseMap={baseMap}
          onBaseMapChange={setBaseMap}
          showCartoPanel={showCartoPanel}
          onShowCartoPanelChange={setShowCartoPanel}
          showFloatingLegend={showFloatingLegend}
          onShowFloatingLegendChange={setShowFloatingLegend}
          sourceStatus={sourceStatus}
          geonodeStatus={geonodeStatus}
          syncing={syncing}
          onSync={handleSync}
          syncingAdeudos={syncingAdeudos}
          onSyncAdeudos={handleSyncAdeudos}
          fiscalStatus={fiscalStatus}
          canSync={hasPermission("parcels.sync")}
          geometrySource={geometrySource}
          adminUserCount={adminStats?.total}
          adminActiveCount={adminStats?.active}
        />

        {displayClave && padron && (
          <PredioInfoPanel
            clave={displayClave}
            padron={padron}
            cartography={cartographyMatchesPadron ? selected ?? null : null}
            cartographyMatches={!!cartographyMatchesPadron}
            dibujadoEnMapa={dibujadoEnMapa}
            geometryLoading={geometryLoading}
            ownerships={ownerships}
            currency={currency}
            tab={infoTab}
            onTabChange={setInfoTab}
            onClose={() => {
              setPadron(null);
              setHighlightGeometry(null);
              setHighlightLabel(null);
              setGeometrySource(null);
            }}
          />
        )}

        {showResultsTable && (
          <ResultadosCatastrales
            items={resultItems}
            activeClave={padron?.clave_catastral ?? null}
            currency={currency}
            onSelect={selectPadronRecord}
            filter={resultsFilter}
            onFilterChange={setResultsFilter}
            compact={resultsCompact}
            onCompactChange={setResultsCompact}
            panelMode={resultsPanelMode}
            onPanelModeChange={setResultsPanelMode}
            total={searchTotal}
            page={searchPage}
            totalPages={searchTotalPages}
            onPageChange={(p) => runAdvancedSearch(p)}
            loading={searching}
          />
        )}

        {showFloatingLegend && (
        <div className="cm-float cm-float-legend">
          <h4>Leyenda</h4>
          <div className="cm-legend-block">
            <span className="cm-legend-title">Fiscal</span>
            <span>
              <i className="swatch sw-green" /> Sin adeudo
            </span>
            <span>
              <i className="swatch sw-red" /> Con adeudo
            </span>
          </div>
          <div className="cm-legend-block">
            <span className="cm-legend-title">Predios</span>
            <span>
              <i className="swatch sw-yellow" /> Predios oficiales (WMS)
            </span>
            <span>
              <i className="swatch sw-blue" /> Predio seleccionado (borde)
            </span>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
