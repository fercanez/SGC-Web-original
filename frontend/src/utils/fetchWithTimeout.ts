const DEFAULT_TIMEOUT_MS = 25_000;

export class FetchTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(
      `El servidor no respondió en ${Math.round(timeoutMs / 1000)} segundos. ` +
        "Verifique que sgc-web-api esté activo e intente de nuevo."
    );
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
      throw new FetchTimeoutError(timeoutMs);
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
