/**
 * URL base de la API.
 * En el navegador usamos el mismo origen (host:5173); Vite reenvía /api → backend.
 */
export function getApiUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.host}`;
  }
  const fromEnv = import.meta.env.VITE_API_URL?.trim();
  return fromEnv?.replace(/\/$/, "") || "http://127.0.0.1:8000";
}
