/** Estado fiscal: NULL o 0 = sin adeudo (verde); solo valores > 0 = con adeudo. */

export type FiscalStatus = "sin_adeudo" | "con_adeudo" | "sin_dato";

export function parseAdeudo(
  value: string | number | null | undefined
): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/** Monto efectivo: NULL / vacío se trata como 0. */
export function adeudoAmount(
  value: string | number | null | undefined
): number {
  const n = parseAdeudo(value);
  return n == null ? 0 : n;
}

export function fiscalStatusFromAdeudos(
  adeudo2026: string | number | null | undefined,
  adeudoTotal?: string | number | null | undefined
): FiscalStatus {
  const has2026 = adeudo2026 != null && adeudo2026 !== "";
  const hasTotal = adeudoTotal != null && adeudoTotal !== "";
  if (!has2026 && !hasTotal) return "sin_dato";

  const a26 = adeudoAmount(adeudo2026);
  const aTot = adeudoAmount(adeudoTotal);
  if (a26 > 0 || aTot > 0) return "con_adeudo";
  return "sin_adeudo";
}

export function fiscalLabel(status: FiscalStatus): string {
  if (status === "con_adeudo") return "Con adeudo";
  if (status === "sin_dato") return "Sin dato fiscal";
  return "Sin adeudo";
}

export function fiscalRowClass(status: FiscalStatus): string {
  if (status === "con_adeudo") return "row-fiscal-debt";
  if (status === "sin_dato") return "row-fiscal-unknown";
  return "row-fiscal-ok";
}

export function fiscalChipClass(status: FiscalStatus): string {
  if (status === "con_adeudo") return "cm-fiscal-debt";
  if (status === "sin_dato") return "cm-fiscal-unknown";
  return "cm-fiscal-ok";
}

export function fiscalClaveClass(status: FiscalStatus): string {
  if (status === "con_adeudo") return "cm-clave-debt";
  if (status === "sin_dato") return "cm-clave-unknown";
  return "cm-clave-ok";
}

/** Colores MapLibre (fill / line) */
export const FISCAL_MAP_FILL: Record<FiscalStatus, string> = {
  sin_adeudo: "rgba(21,128,61,0.20)",
  con_adeudo: "rgba(198,40,40,0.22)",
  sin_dato: "rgba(234,179,8,0.25)",
};

export const FISCAL_MAP_LINE: Record<FiscalStatus, string> = {
  sin_adeudo: "#15803d",
  con_adeudo: "#c62828",
  sin_dato: "#ca8a04",
};

/** Relleno sólido para MapLibre (sin alpha en el color; se controla con fill-opacity). */
export const FISCAL_MAP_FILL_RGB: Record<FiscalStatus, string> = {
  sin_adeudo: "#16a34a",
  con_adeudo: "#dc2626",
  sin_dato: "#d97706",
};

/** Contorno del predio seleccionado — paridad SGC maduro (doble trazo sólido). */
export const SELECTED_MAP_LINE = "#0000ff";
export const SELECTED_MAP_LINE_WIDTH = 4;
export const SELECTED_MAP_HALO = "rgba(0, 0, 255, 0.28)";
export const SELECTED_MAP_HALO_WIDTH = 11;
export const SELECTED_MAP_FILL_OPACITY = 0.42;
export const SEARCH_MANZANA_FILL_OPACITY = 0.58;
