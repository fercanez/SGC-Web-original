/** Base pública de la app (Vite `base`, ej. `/sgc-web/`). */
export function getAppBasePath(): string {
  const base = import.meta.env.BASE_URL || "/";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

/** Ruta absoluta del home (`/sgc-web/`). */
export function getHomePath(): string {
  return `${getAppBasePath()}/`;
}

/** Ruta absoluta del login respetando subpath Apache (`/sgc-web/login`). */
export function getLoginPath(): string {
  return `${getAppBasePath()}/login`;
}

export function isLoginPath(pathname = window.location.pathname): boolean {
  const login = getLoginPath();
  return pathname === login || pathname.startsWith(`${login}/`);
}

/** Evita que React Router mande a `/login` (GeoNode) en lugar de `/sgc-web/login`. */
export function redirectToLogin(): void {
  const target = getLoginPath();
  if (!isLoginPath()) {
    window.location.replace(target);
  }
}
