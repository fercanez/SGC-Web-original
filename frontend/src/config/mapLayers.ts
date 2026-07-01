import type { GeonodeLayer } from "../types/config";

export type LayerRole =
  | "colonias"
  | "predios"
  | "construcciones"
  | "codigos"
  | "limite"
  | "fiscal"
  | "other";

/** Orden en panel Capas (arriba → abajo). En el mapa, el último de la lista queda encima. */
const ROLE_ORDER: LayerRole[] = [
  "colonias",
  "codigos",
  "predios",
  "construcciones",
  "limite",
  "fiscal",
  "other",
];

/** Identifica el rol de capa (paridad con SGC maduro / GeoServer). */
export function layerRole(layer: GeonodeLayer): LayerRole {
  const key = `${layer.id} ${layer.layer} ${layer.title}`.toLowerCase();
  if (key.includes("codigo") || key.includes("postal")) return "codigos";
  if (key.includes("predio")) return "predios";
  if (key.includes("construcc")) return "construcciones";
  if (key.includes("colonia")) return "colonias";
  if (key.includes("limite") || key.includes("municipal")) return "limite";
  if (key.includes("fiscal") || key.includes("adeudo")) return "fiscal";
  return "other";
}

/** Vista inicial Gestión Catastral: solo colonias encendidas. */
export function defaultLayerVisible(role: LayerRole): boolean {
  return role === "colonias";
}

/** Tope de opacidad de colonias cuando predios WMS está encendido. */
export const COLONIAS_MAX_OPACITY_WITH_PREDIOS = 0.7;

export function defaultLayerOpacity(role: LayerRole): number {
  switch (role) {
    case "colonias":
      return COLONIAS_MAX_OPACITY_WITH_PREDIOS;
    case "predios":
      return 1;
    case "construcciones":
      return 0.85;
    case "codigos":
      return 1;
    case "limite":
      return 0.55;
    default:
      return 0.85;
  }
}

export function buildInitialVisibility(
  layers: GeonodeLayer[]
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const l of layers) {
    out[l.id] = defaultLayerVisible(layerRole(l));
  }
  return out;
}

export function buildInitialOpacity(
  layers: GeonodeLayer[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of layers) {
    out[l.id] = defaultLayerOpacity(layerRole(l));
  }
  return out;
}

export function buildInitialOrder(layers: GeonodeLayer[]): string[] {
  return wmsStackOrder(layers).map((l) => l.id);
}

/** Apilado en mapa: colonias abajo, predios arriba (independiente del orden del panel). */
export function wmsStackOrder(layers: GeonodeLayer[]): GeonodeLayer[] {
  return [...layers].sort(
    (a, b) =>
      ROLE_ORDER.indexOf(layerRole(a)) - ROLE_ORDER.indexOf(layerRole(b))
  );
}

export function wmsStackIds(layers: GeonodeLayer[]): string[] {
  return wmsStackOrder(layers).map((l) => l.id);
}

/** Zoom mínimo para encender predios WMS al consultar un predio. */
export const PREDIOS_WMS_NEAR_ZOOM = 16;
export const PREDIOS_WMS_NEAR_OPACITY = 0.75;

export function construccionesLayerIds(layers: GeonodeLayer[]): string[] {
  return layers.filter((l) => layerRole(l) === "construcciones").map((l) => l.id);
}

export function prediosLayerIds(layers: GeonodeLayer[]): string[] {
  return layers.filter((l) => layerRole(l) === "predios").map((l) => l.id);
}

export function coloniasLayerIds(layers: GeonodeLayer[]): string[] {
  return layers.filter((l) => layerRole(l) === "colonias").map((l) => l.id);
}

export function prediosWmsActive(
  visible: Record<string, boolean>,
  layers: GeonodeLayer[]
): boolean {
  return prediosLayerIds(layers).some((id) => visible[id]);
}

/** Limita colonias al 70% mientras predios WMS esté visible. */
export function capColoniasOpacityWithPredios(
  visible: Record<string, boolean>,
  opacity: Record<string, number>,
  layers: GeonodeLayer[]
): Record<string, number> {
  if (!prediosWmsActive(visible, layers)) return opacity;

  const next = { ...opacity };
  for (const id of coloniasLayerIds(layers)) {
    if (!visible[id]) continue;
    const current = next[id] ?? defaultLayerOpacity("colonias");
    if (current > COLONIAS_MAX_OPACITY_WITH_PREDIOS) {
      next[id] = COLONIAS_MAX_OPACITY_WITH_PREDIOS;
    }
  }
  return next;
}

export function applyLayerStateWithPrediosCap(
  visible: Record<string, boolean>,
  opacity: Record<string, number>,
  layers: GeonodeLayer[]
): { visible: Record<string, boolean>; opacity: Record<string, number> } {
  return {
    visible,
    opacity: capColoniasOpacityWithPredios(visible, opacity, layers),
  };
}

/** Enciende/apaga predios WMS solo al acercarse (no al listar búsqueda). */
export function applyPrediosWmsProximity(
  visible: Record<string, boolean>,
  opacity: Record<string, number>,
  layers: GeonodeLayer[],
  near: boolean
): { visible: Record<string, boolean>; opacity: Record<string, number> } {
  const nextV = { ...visible };
  const nextO = { ...opacity };
  for (const id of prediosLayerIds(layers)) {
    if (near) {
      nextV[id] = true;
      nextO[id] = PREDIOS_WMS_NEAR_OPACITY;
    } else {
      nextV[id] = false;
    }
  }
  return applyLayerStateWithPrediosCap(nextV, nextO, layers);
}

/** @deprecated usar applyPrediosWmsProximity al acercar zoom */
export function activatePredioConsultaLayers(
  visible: Record<string, boolean>,
  layers: GeonodeLayer[]
): Record<string, boolean> {
  const next = { ...visible };
  for (const l of layers) {
    const role = layerRole(l);
    if (role === "predios" || role === "fiscal") {
      next[l.id] = true;
    }
  }
  return next;
}

export function mergeLayerOrder(
  layers: GeonodeLayer[],
  prevOrder: string[]
): string[] {
  const ids = layers.map((l) => l.id);
  const idSet = new Set(ids);
  const kept = prevOrder.filter((id) => idSet.has(id));
  for (const id of ids) {
    if (!kept.includes(id)) kept.push(id);
  }
  return kept.length === ids.length ? kept : buildInitialOrder(layers);
}

/** Incorpora capas nuevas del config sin perder preferencias del usuario. */
export function syncMapLayersFromConfig(
  layers: GeonodeLayer[],
  prev: {
    visible: Record<string, boolean>;
    opacity: Record<string, number>;
    order: string[];
  }
): {
  visible: Record<string, boolean>;
  opacity: Record<string, number>;
  order: string[];
} {
  const ids = new Set(layers.map((l) => l.id));
  const visible = { ...prev.visible };
  const opacity = { ...prev.opacity };

  for (const l of layers) {
    if (visible[l.id] === undefined) {
      visible[l.id] = defaultLayerVisible(layerRole(l));
    }
    if (opacity[l.id] === undefined) {
      opacity[l.id] = defaultLayerOpacity(layerRole(l));
    }
  }

  for (const id of Object.keys(visible)) {
    if (!ids.has(id)) delete visible[id];
  }
  for (const id of Object.keys(opacity)) {
    if (!ids.has(id)) delete opacity[id];
  }

  return {
    visible,
    opacity,
    order: mergeLayerOrder(layers, prev.order),
  };
}

export function layerAccentClass(role: LayerRole): string {
  switch (role) {
    case "colonias":
      return "cm-layer-accent-colonias";
    case "predios":
      return "cm-layer-accent-predios";
    case "construcciones":
      return "cm-layer-accent-construcciones";
    case "codigos":
      return "cm-layer-accent-codigos";
    case "fiscal":
      return "cm-layer-accent-fiscal";
    case "limite":
      return "cm-layer-accent-limite";
    default:
      return "cm-layer-accent-other";
  }
}
