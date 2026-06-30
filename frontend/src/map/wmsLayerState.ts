import type maplibregl from "maplibre-gl";
import type { GeonodeLayer } from "../types/config";

function hasLayer(map: maplibregl.Map, id: string): boolean {
  try {
    return Boolean(map.getLayer(id));
  } catch {
    return false;
  }
}

/** Aplica opacidad de capas WMS GeoNode (evita quedar en 0 tras crear el mapa). */
export function applyGeonodeRasterOpacity(
  map: maplibregl.Map,
  geonodeLayers: GeonodeLayer[],
  visible: Record<string, boolean>,
  opacity: Record<string, number>
): void {
  for (const gl of geonodeLayers) {
    const layerId = `geonode-${gl.id}`;
    if (!hasLayer(map, layerId)) continue;
    const op = visible[gl.id] ? (opacity[gl.id] ?? 1) : 0;
    try {
      map.setLayoutProperty(layerId, "visibility", "visible");
      map.setPaintProperty(layerId, "raster-opacity", op);
    } catch {
      /* mapa destruido */
    }
  }
  try {
    map.triggerRepaint();
  } catch {
    /* */
  }
}

/** Reaplica opacidad WMS tras load/idle (paridad fix toggle manual en ficha). */
export function scheduleGeonodeRasterOpacity(
  map: maplibregl.Map,
  geonodeLayers: GeonodeLayer[],
  visible: Record<string, boolean>,
  opacity: Record<string, number>
): void {
  const run = () =>
    applyGeonodeRasterOpacity(map, geonodeLayers, visible, opacity);

  if (map.isStyleLoaded()) {
    run();
    window.setTimeout(run, 80);
    window.setTimeout(run, 350);
    map.once("idle", run);
  } else {
    map.once("load", () =>
      scheduleGeonodeRasterOpacity(map, geonodeLayers, visible, opacity)
    );
  }
}
