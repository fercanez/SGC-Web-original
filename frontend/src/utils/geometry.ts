/** Centro aproximado de un polígono GeoJSON (para centrar el mapa). */
export function centroidFromGeometry(
  geom: GeoJSON.Geometry | null | undefined
): [number, number] | null {
  if (!geom) return null;

  const ringFrom = (coords: GeoJSON.Position[][]): GeoJSON.Position[] | null => {
    const ring = coords[0];
    return ring?.length ? ring : null;
  };

  let ring: GeoJSON.Position[] | null = null;
  if (geom.type === "Polygon") {
    ring = ringFrom(geom.coordinates);
  } else if (geom.type === "MultiPolygon") {
    ring = geom.coordinates[0] ? ringFrom(geom.coordinates[0]) : null;
  }
  if (!ring?.length) return null;

  let lng = 0;
  let lat = 0;
  const n = ring.length > 1 ? ring.length - 1 : ring.length;
  for (let i = 0; i < n; i += 1) {
    lng += ring[i][0];
    lat += ring[i][1];
  }
  return [lng / n, lat / n];
}

function extendBbox(
  pos: GeoJSON.Position,
  box: { minLng: number; minLat: number; maxLng: number; maxLat: number }
) {
  const lng = pos[0];
  const lat = pos[1];
  if (lng < box.minLng) box.minLng = lng;
  if (lat < box.minLat) box.minLat = lat;
  if (lng > box.maxLng) box.maxLng = lng;
  if (lat > box.maxLat) box.maxLat = lat;
}

function walkPositions(
  coords: GeoJSON.Position | GeoJSON.Position[] | GeoJSON.Position[][],
  box: { minLng: number; minLat: number; maxLng: number; maxLat: number }
) {
  if (typeof coords[0] === "number") {
    extendBbox(coords as GeoJSON.Position, box);
    return;
  }
  for (const c of coords as GeoJSON.Position[] | GeoJSON.Position[][]) {
    walkPositions(c, box);
  }
}

/** Coordenadas plausibles para MapLibre (EPSG:4326, lon/lat). */
export function isWgs84Geometry(geom: GeoJSON.Geometry | null | undefined): boolean {
  const bbox = bboxFromGeometry(geom);
  if (!bbox) return false;
  const [[west, south], [east, north]] = bbox;
  if (
    !Number.isFinite(west) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(north)
  ) {
    return false;
  }
  if (Math.abs(west) > 180 || Math.abs(east) > 180) return false;
  if (Math.abs(south) > 90 || Math.abs(north) > 90) return false;
  if (east - west > 45 || north - south > 45) return false;
  return true;
}

/** Esquina SW y NE para fitBounds de MapLibre. */
export function bboxFromGeometry(
  geom: GeoJSON.Geometry | null | undefined
): [[number, number], [number, number]] | null {
  if (!geom) return null;
  const box = {
    minLng: Infinity,
    minLat: Infinity,
    maxLng: -Infinity,
    maxLat: -Infinity,
  };

  if (geom.type === "Polygon" || geom.type === "MultiPolygon") {
    walkPositions(geom.coordinates, box);
  } else {
    return null;
  }

  if (!Number.isFinite(box.minLng)) return null;
  return [
    [box.minLng, box.minLat],
    [box.maxLng, box.maxLat],
  ];
}

/** Límites de varias geometrías (búsqueda de manzana). */
export function bboxFromFeatureCollection(
  fc: GeoJSON.FeatureCollection | null | undefined
): [[number, number], [number, number]] | null {
  if (!fc?.features?.length) return null;
  const box = {
    minLng: Infinity,
    minLat: Infinity,
    maxLng: -Infinity,
    maxLat: -Infinity,
  };
  for (const f of fc.features) {
    if (!f.geometry) continue;
    walkPositions(
      (f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates,
      box
    );
  }
  if (!Number.isFinite(box.minLng)) return null;
  return [
    [box.minLng, box.minLat],
    [box.maxLng, box.maxLat],
  ];
}

/** Opciones de zoom al resaltar un predio (evita acercamiento excesivo). */
export function fitOptionsForGeometry(
  geom: GeoJSON.Geometry | null | undefined
): { padding: number; maxZoom: number } {
  const bbox = bboxFromGeometry(geom);
  if (!bbox) return { padding: 96, maxZoom: 16 };
  const [[west, south], [east, north]] = bbox;
  const span = Math.max(Math.abs(east - west), Math.abs(north - south));
  if (span < 0.00025) return { padding: 140, maxZoom: 18 };
  if (span < 0.001) return { padding: 110, maxZoom: 17 };
  if (span < 0.005) return { padding: 96, maxZoom: 16 };
  return { padding: 80, maxZoom: 15 };
}

export function normalizeCadastralCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function formatMoney(
  value: string | number | null | undefined,
  currency = "MXN"
): string {
  if (value == null || value === "") return "—";
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
}
