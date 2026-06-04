/** Estado fiscal: NULL o 0 = sin adeudo (verde); solo valores > 0 = con adeudo. */

export type FiscalStatus = "sin_adeudo" | "con_adeudo";

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
  const a26 = adeudoAmount(adeudo2026);
  const aTot = adeudoAmount(adeudoTotal);
  if (a26 > 0 || aTot > 0) return "con_adeudo";
  return "sin_adeudo";
}

export function fiscalLabel(status: FiscalStatus): string {
  return status === "con_adeudo" ? "Con adeudo" : "Sin adeudo";
}

export function fiscalRowClass(status: FiscalStatus): string {
  return status === "con_adeudo" ? "row-fiscal-debt" : "row-fiscal-ok";
}

export function fiscalChipClass(status: FiscalStatus): string {
  return status === "con_adeudo" ? "cm-fiscal-debt" : "cm-fiscal-ok";
}

export function fiscalClaveClass(status: FiscalStatus): string {
  return status === "con_adeudo" ? "cm-clave-debt" : "cm-clave-ok";
}

/** Colores MapLibre (fill / line) */
export const FISCAL_MAP_FILL: Record<FiscalStatus, string> = {
  sin_adeudo: "#3ddc68",
  con_adeudo: "#ef4444",
};

export const FISCAL_MAP_LINE: Record<FiscalStatus, string> = {
  sin_adeudo: "#16a34a",
  con_adeudo: "#c62828",
};

/** Contorno del predio seleccionado (sobre el relleno fiscal). */
export const SELECTED_MAP_LINE = "#0b3d91";
export const SELECTED_MAP_LINE_WIDTH = 4;
