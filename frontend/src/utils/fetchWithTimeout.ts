const DEFAULT_TIMEOUT_MS = 25_000;

export class FetchTimeoutError extends Error {
  constructor(timeoutMs: number, cause?: unknown) {
    const base =
      `El servidor no respondió en ${Math.round(timeoutMs / 1000)} segundos. ` +
      "Verifique en el servidor: " +
      "`sudo systemctl status sgc-web-api` y " +
      "`curl -s http://127.0.0.1:9100/api/v1/health/live`.";
    const hint =
      cause instanceof TypeError
        ? " No hay conexión con la API (revisar Apache/proxy o que el servicio esté activo)."
        : "";
    super(base + hint);
    this.name = "FetchTimeoutError";
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  if (init.signal) {
    if (init.signal.aborted) {
      controller.abort();
    } else {
      init.signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new FetchTimeoutError(timeoutMs, err);
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
