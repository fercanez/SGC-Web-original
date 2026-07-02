import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import CadastralMap from "../components/CadastralMap";
import CadastralSidebar, {
  type BaseMapId,
  type SearchFields,
  type SidebarSection,
} from "../components/CadastralSidebar";
import FichaCatastralModal from "../components/FichaCatastralModal";
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
  getCadastralRecord,
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
  normalizeCadastralCode,
} from "../utils/geometry";
import { gestionCatastralMapPadding } from "../utils/mapViewport";
import { fetchPredioWfsMaduro } from "../utils/predioWfs";
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
import {
  applyPrediosWmsProximity,
  buildInitialOpacity,
  buildInitialOrder,
  buildInitialVisibility,
  capColoniasOpacityWithPredios,
} from "../config/mapLayers";
import type { GeonodeLayer, PublicConfig } from "../types/config";

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
  const navigate = useNavigate();
  const { user, logout, hasPermission } = useAuth();
  const [sidebarSection, setSidebarSection] =
    useState<SidebarSection>("consulta");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [resultsFilter, setResultsFilter] = useState("");
  const [resultsCompact, setResultsCompact] = useState(true);
  const [searchFields, setSearchFields] = useState<SearchFields>(emptySearch);
  const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>(
    {}
  );
  const [layerOpacity, setLayerOpacity] = useState<Record<string, number>>({});
  const [layerOrder, setLayerOrder] = useState<string[]>([]);
  const [baseMap, setBaseMap] = useState<BaseMapId>("googleHybrid");
  const [showCartoPanel, setShowCartoPanel] = useState(true);
  const [fiscalThematic, setFiscalThematic] = useState(true);
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
  const [geometryWfsLayer, setGeometryWfsLayer] = useState<string | null>(null);
  const [geometryLoading, setGeometryLoading] = useState(false);
  const [searchHighlights, setSearchHighlights] =
    useState<GeoJSON.FeatureCollection | null>(null);
  const [mapHighlightsLoading, setMapHighlightsLoading] = useState(false);
  const [mapFitNonce, setMapFitNonce] = useState(0);
  const [fichaOpen, setFichaOpen] = useState(false);
  const loadSeqRef = useRef(0);
  const padronSelectSeqRef = useRef(0);
  const layersSyncedKeyRef = useRef("");
  const predioWmsNearRef = useRef(false);
  const visibleLayersRef = useRef(visibleLayers);
  const layerOpacityRef = useRef(layerOpacity);
  const geonodeLayersRef = useRef<GeonodeLayer[]>([]);

  useEffect(() => {
    visibleLayersRef.current = visibleLayers;
  }, [visibleLayers]);

  useEffect(() => {
    layerOpacityRef.current = layerOpacity;
  }, [layerOpacity]);

  const handlePredioWmsProximity = useCallback(
    (near: boolean) => {
      if (predioWmsNearRef.current === near) return;
      predioWmsNearRef.current = near;
      const layers = config?.geonode.layers ?? [];
      if (!layers.length) return;
      const next = applyPrediosWmsProximity(
        visibleLayersRef.current,
        layerOpacityRef.current,
        layers,
        near
      );
      setVisibleLayers(next.visible);
      setLayerOpacity(next.opacity);
      if (near) setFiscalThematic(true);
    },
    [config?.geonode.layers]
  );

  const handleVisibleLayersChange = useCallback(
    (next: Record<string, boolean>) => {
      const layers = config?.geonode.layers ?? [];
      setVisibleLayers(next);
      setLayerOpacity((o) => capColoniasOpacityWithPredios(next, o, layers));
    },
    [config?.geonode.layers]
  );

  const handleLayerOpacityChange = useCallback(
    (id: string, value: number) => {
      const layers = config?.geonode.layers ?? [];
      setLayerOpacity((o) => {
        const next = { ...o, [id]: value };
        return capColoniasOpacityWithPredios(visibleLayersRef.current, next, layers);
      });
    },
    [config?.geonode.layers]
  );

  const loadSearchMapHighlights = useCallback(
    async (items: PredioAlfanumericoRecord[]) => {
      if (items.length < 1) {
        setSearchHighlights(null);
        return null;
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
        if (features.length < 1) {
          const fallback = await fetchMapGeometriesFallback(items);
          if (fallback.length > features.length) features = fallback;
        }
        if (features.length < 1) {
          const fromParcels = await fetchGeometriesFromParcels(items);
          if (fromParcels.length > features.length) features = fromParcels;
        }
        if (features.length === 0) {
          setSearchHighlights(null);
          setSearchError(
            "No se pudieron dibujar los predios en el mapa. Verifique la API y GeoNode."
          );
          return null;
        }
        const collection = buildHighlightCollection(features);
        setSearchHighlights(collection);
        setFiscalThematic(true);
        setMapFitNonce((n) => n + 1);

        const layers = geonodeLayersRef.current;
        if (layers.length) {
          predioWmsNearRef.current = true;
          const wms = applyPrediosWmsProximity(
            visibleLayersRef.current,
            layerOpacityRef.current,
            layers,
            true
          );
          setVisibleLayers(wms.visible);
          setLayerOpacity(wms.opacity);
        }
        return collection;
      } finally {
        setMapHighlightsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (padron) return;
    predioWmsNearRef.current = false;
    const layers = config?.geonode.layers ?? [];
    if (!layers.length) return;
    const next = applyPrediosWmsProximity(
      visibleLayersRef.current,
      layerOpacityRef.current,
      layers,
      false
    );
    setVisibleLayers(next.visible);
    setLayerOpacity(next.opacity);
  }, [padron, config?.geonode.layers]);

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

    const syncKey = layers.map((l) => `${l.id}:${l.layer}`).join("|");
    if (layersSyncedKeyRef.current === syncKey) return;

    layersSyncedKeyRef.current = syncKey;
    setVisibleLayers(buildInitialVisibility(layers));
    setLayerOpacity(buildInitialOpacity(layers));
    setLayerOrder(buildInitialOrder(layers));
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
          setHighlightLabel(padron?.clave_catastral ?? parcel.cadastral_code);
        }
      })
      .catch(() => {});
  }, [selectedId, padron?.parcel_id, padron?.clave_catastral, parcels]);

  const geonodeLayerCount = config?.geonode.layers?.length ?? 0;
  const selected = parcels.find((p) => p.id === selectedId);
  const cartographyMatchesPadron =
    padron &&
    selected &&
    normalizeCadastralCode(selected.cadastral_code) ===
      normalizeCadastralCode(
        padron.clave_catastral_norm ?? padron.clave_catastral
      );
  const padronFiscal = padron
    ? fiscalStatusFromAdeudos(padron.adeudo_2026, padron.adeudo_total)
    : "sin_dato";
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
  const dibujadoEnMapa = Boolean(padron && activeMapHighlight?.geometry);
  const fichaMapGeometry = activeMapHighlight?.geometry ?? highlightGeometry ?? null;
  const fichaMapClave =
    activeMapHighlight?.clave ??
    highlightLabel ??
    padron?.clave_catastral ??
    null;
  const fichaGeometryLoading = geometryLoading && !fichaMapGeometry;
  const muniLabel =
    config?.municipality.full_name ?? "Mexicali, Baja California";
  const currency = config?.locale.currency ?? "MXN";

  function applyHighlightGeometry(
    geom: GeoJSON.Geometry,
    clave: string,
    source: string,
    wfsLayer?: string | null
  ) {
    setHighlightGeometry(geom);
    setHighlightLabel(clave);
    setGeometrySource(source);
    setGeometryWfsLayer(wfsLayer ?? null);
    setMapFitNonce((n) => n + 1);
  }

  async function selectPadronRecord(record: PredioAlfanumericoRecord) {
    const selectSeq = ++padronSelectSeqRef.current;
    const stale = () => selectSeq !== padronSelectSeqRef.current;

    predioWmsNearRef.current = false;
    const activeRecord = record;
    setPadron(activeRecord);
    setFichaOpen(true);
    setSearchError(null);
    if (searchTotal > 0) setResultsPanelMode("open");
    setSidebarSection("consulta");
    setFiscalThematic(true);
    if (searchResults.length >= 1) {
      await loadSearchMapHighlights(searchResults);
    }
    setMapFlyTo(null);
    setSelectedId(null);
    setHighlightGeometry(null);
    setHighlightLabel(null);
    setGeometryWfsLayer(null);
    setGeometryLoading(true);

    let linkMismatch = false;

    if (record.parcel_id) {
      try {
        const linked = await getParcel(record.parcel_id);
        if (stale()) return;
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
      if (stale()) return;
      const wfsDirect =
        mapGeo?.geometry
          ? null
          : await fetchPredioWfsMaduro(activeRecord.clave_catastral, config);
      if (stale()) return;
      const parcelGeom =
        mapGeo?.geometry || wfsDirect
          ? null
          : await resolveParcelGeometry(activeRecord);
      const localGeom =
        mapGeo?.geometry || wfsDirect || parcelGeom
          ? null
          : findGeometryInSearch(searchHighlights, activeRecord.clave_catastral);

      if (mapGeo?.geometry) {
        if (stale()) return;
        applyHighlightGeometry(
          mapGeo.geometry,
          activeRecord.clave_catastral,
          mapGeo.source ?? "geonode_wfs",
          mapGeo.wfs_layer
        );
        if (mapGeo.note) setSearchError(mapGeo.note);
      } else if (wfsDirect) {
        if (stale()) return;
        applyHighlightGeometry(
          wfsDirect,
          activeRecord.clave_catastral,
          "wfs_direct"
        );
      } else if (parcelGeom) {
        if (stale()) return;
        applyHighlightGeometry(
          parcelGeom,
          activeRecord.clave_catastral,
          "database_parcel"
        );
      } else if (localGeom) {
        if (stale()) return;
        applyHighlightGeometry(
          localGeom,
          activeRecord.clave_catastral,
          "search_batch"
        );
      } else {
        const fallbackFeatures = await fetchMapGeometriesFallback([activeRecord]);
        const fbGeom = fallbackFeatures[0]?.geometry ?? null;
        if (fbGeom) {
          if (stale()) return;
          applyHighlightGeometry(
            fbGeom,
            activeRecord.clave_catastral,
            "wfs_fallback"
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
              "Predio en padrón sin polígono en cartografía. Verifique GEONODE_USER/GEONODE_PASSWORD en el servidor y GEONODE_SOURCE_LAYER=catastro_bc:predios_oficial."
            );
          }
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
      if (!stale()) setGeometryLoading(false);
    }
  }

  async function handleMapPredioSelect(clave: string) {
    const norm = normalizeCadastralCode(clave);
    if (!norm) return;

    const fromSearch = searchResults.find(
      (r) =>
        normalizeCadastralCode(r.clave_catastral_norm ?? r.clave_catastral) ===
        norm
    );
    if (fromSearch) {
      await selectPadronRecord(fromSearch);
      return;
    }

    try {
      const record = await getCadastralRecord(norm);
      await selectPadronRecord(record);
    } catch {
      setSearchError(
        `No se encontró el predio ${norm} en el padrón alfanumérico.`
      );
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
        setFiscalThematic(true);
        await loadSearchMapHighlights(res.items);
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
  const mapFitPadding = useMemo(
    () =>
      gestionCatastralMapPadding({
        sidebarOpen,
        resultsVisible: showResultsTable,
        resultsCompact,
      }),
    [sidebarOpen, showResultsTable, resultsCompact]
  );
  const totalPredios =
    catalogSummary?.predios_alfanumerico ?? parcels.length;
  const coverage = catalogSummary?.coverage_percent;
  const geonodeLayers = config?.geonode.layers ?? [];

  useEffect(() => {
    geonodeLayersRef.current = geonodeLayers;
  }, [geonodeLayers]);

  return (
    <div className="app app-catastro">
      <header className="cm-topbar">
        <div className="cm-brand">
          <button
            type="button"
            className="cm-btn-modulos"
            onClick={() => navigate("/")}
            title="Volver al selector de módulos"
          >
            ← Módulos
          </button>
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

      <div className={`cm-stage ${sidebarOpen ? "cm-stage--sidebar-open" : ""}`}>
        <section className="cm-map-layer">
          <CadastralMap
            geojson={geojson}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onPredioSelect={handleMapPredioSelect}
            onPickMiss={() =>
              setSearchError(
                "No se identificó ningún predio en ese punto. Acérquese más o active la capa Predios WMS."
              )
            }
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
            fiscalThematic={fiscalThematic}
            fitPadding={mapFitPadding}
            onPredioWmsProximity={handlePredioWmsProximity}
          />
        </section>

        <CadastralSidebar
          section={sidebarSection}
          onSectionChange={setSidebarSection}
          compactMode
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
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
          onVisibleLayersChange={handleVisibleLayersChange}
          layerOpacity={layerOpacity}
          onLayerOpacityChange={handleLayerOpacityChange}
          layerOrder={layerOrder}
          onLayerOrderChange={setLayerOrder}
          baseMap={baseMap}
          onBaseMapChange={setBaseMap}
          showCartoPanel={showCartoPanel}
          onShowCartoPanelChange={setShowCartoPanel}
          fiscalThematic={fiscalThematic}
          onFiscalThematicChange={setFiscalThematic}
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

        {!sidebarOpen && (
          <button
            type="button"
            className="cm-sidebar-reopen"
            onClick={() => setSidebarOpen(true)}
            title="Mostrar panel de trabajo"
            aria-label="Mostrar panel de trabajo"
          >
            <span className="cm-sidebar-reopen-icon" aria-hidden>
              ☰
            </span>
            <span>Panel</span>
          </button>
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
      </div>

      {padron && (
        <FichaCatastralModal
          open={fichaOpen}
          padron={padron}
          geometry={fichaMapGeometry}
          geometryClave={fichaMapClave}
          geometryLoading={fichaGeometryLoading}
          geometrySource={geometrySource}
          geometryWfsLayer={geometryWfsLayer}
          dibujadoEnMapa={dibujadoEnMapa}
          currency={currency}
          geonodeLayers={geonodeLayers}
          wmsPath={config?.geonode.wms_proxy_path ?? "/api/v1/geonode/wms"}
          construccionesConfig={config?.construcciones}
          searchResults={searchResults}
          onNavigate={selectPadronRecord}
          onPredioPick={handleMapPredioSelect}
          onClose={() => setFichaOpen(false)}
        />
      )}
    </div>
  );
}
