import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getHomePath, getLoginPath, isLoginPath } from "../config/appBase";
import { getApiUrl } from "../config/apiUrl";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { clearToken, getToken, setToken } from "./storage";
import type { UserInfo } from "../types/auth";

const AUTH_ERROR_KEY = "sgc_auth_error";

interface AuthContextValue {
  user: UserInfo | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (code: string) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const bootstrapAbort = useRef<AbortController | null>(null);

  const fetchMe = useCallback(async (token: string, signal?: AbortSignal) => {
    const res = await fetchWithTimeout(
      `${getApiUrl()}/v1/auth/me`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      }
    );
    if (!res.ok) throw new Error("Sesión inválida");
    return (await res.json()) as UserInfo;
  }, []);

  const refreshUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      return;
    }
    const me = await fetchMe(token);
    setUser(me);
  }, [fetchMe]);

  useEffect(() => {
    bootstrapAbort.current?.abort();
    const controller = new AbortController();
    bootstrapAbort.current = controller;

    const token = getToken();
    if (!token) {
      setLoading(false);
      return () => controller.abort();
    }

    const tokenAtStart = token;
    fetchMe(token, controller.signal)
      .then((me) => {
        if (controller.signal.aborted) return;
        if (getToken() !== tokenAtStart) return;
        setUser(me);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (getToken() !== tokenAtStart) return;
        clearToken();
        setUser(null);
        const message =
          err instanceof Error ? err.message : "Sesión inválida";
        sessionStorage.setItem(AUTH_ERROR_KEY, message);
        if (!isLoginPath()) {
          window.location.replace(getLoginPath());
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [fetchMe]);

  const login = useCallback(async (username: string, password: string) => {
    bootstrapAbort.current?.abort();

    const res = await fetchWithTimeout(
      `${getApiUrl()}/v1/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const detail = (err as { detail?: string }).detail;
      if (res.status >= 500) {
        throw new Error(
          detail ||
            `Error del servidor (${res.status}). Revise journalctl -u sgc-web-api.`
        );
      }
      throw new Error(detail || "Usuario o contraseña incorrectos");
    }
    const data = (await res.json()) as { access_token: string };
    setToken(data.access_token);
    window.location.replace(getHomePath());
  }, []);

  const logout = useCallback(() => {
    bootstrapAbort.current?.abort();
    clearToken();
    setUser(null);
    window.location.replace(getLoginPath());
  }, []);

  const hasPermission = useCallback(
    (code: string) => user?.permissions?.includes(code) ?? false,
    [user]
  );

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      hasPermission,
      refreshUser,
    }),
    [user, loading, login, logout, hasPermission, refreshUser]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
