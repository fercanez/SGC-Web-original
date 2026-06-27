/** Ancho del panel lateral en Gestión Catastral. */
export const CATASTRO_SIDEBAR_WIDTH = 280;

export type MapFitPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/** Padding asimétrico: deja espacio al panel izquierdo y sube el encuadre sobre la tabla. */
export function gestionCatastralMapPadding(options: {
  sidebarOpen: boolean;
  resultsVisible: boolean;
  resultsCompact: boolean;
}): MapFitPadding {
  const left = options.sidebarOpen ? CATASTRO_SIDEBAR_WIDTH + 20 : 20;
  const bottom = options.resultsVisible
    ? options.resultsCompact
      ? 210
      : 360
    : 36;
  return { top: 36, right: 36, left, bottom };
}
