/**
 * URL base de la API.
 *
 * Usa VITE_API_URL cuando está definida; si no, cae al backend local.
 */
export function getApiUrl(): string {
  return import.meta.env.VITE_API_URL || "/api";
}
