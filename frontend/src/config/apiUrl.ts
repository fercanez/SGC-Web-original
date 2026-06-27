/**
 * URL base de la API.
 *
 * En producción SGC-Web consume la API publicada
 * por Apache en:
 *
 *   https://fcnarqnodo.hopto.org/sgc-web-api/
 *
 * Por eso devolvemos siempre /sgc-web-api.
 */
export function getApiUrl(): string {
  return "/sgc-web-api";
}
