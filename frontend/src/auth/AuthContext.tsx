import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getApiUrl } from "../config/apiUrl";
import { clearToken, getToken, setToken } from "./storage";
import type { UserInfo } from "../types/auth";

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

  const fetchMe = useCallback(async (token: string) => {
    const res = await fetch(`${getApiUrl()}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
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
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMe(token)
      .then(setUser)
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [fetchMe]);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await fetch(`${getApiUrl()}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { detail?: string }).detail ||
            "Usuario o contraseña incorrectos"
        );
      }
      const data = (await res.json()) as { access_token: string };
      setToken(data.access_token);
      const me = await fetchMe(data.access_token);
      setUser(me);
    },
    [fetchMe]
  );

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const hasPermission = useCallback(
    (code: string) => user?.permissions.includes(code) ?? false,
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
