export interface GeonodeLayer {
  id: string;
  layer: string;
  title: string;
}

export interface PublicConfig {
  municipality: {
    name: string;
    state: string;
    full_name: string;
    state_code: string;
    municipality_code: string;
  };
  map: {
    center: [number, number];
    zoom: number;
    geographic_srid: number;
    metric_srid: number;
  };
  cadastral: {
    pattern: string;
    example: string;
    help: string;
  };
  geonode: {
    enabled: boolean;
    use_proxy: boolean;
    auth_required: boolean;
    credentials_configured: boolean;
    wms_proxy_path: string;
    status_path: string;
    layers: GeonodeLayer[];
    fallback_osm: boolean;
  };
  locale: {
    language: string;
    currency: string;
  };
  source: {
    enabled: boolean;
    layer: string | null;
    title: string;
    srid: number;
    status_path: string;
    sync_path: string;
    info_path: string;
  };
}
