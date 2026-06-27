import { useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { getHomePath, redirectToLogin } from "../config/appBase";

export default function ProtectedRoute({
  children,
  permission,
}: {
  children: React.ReactNode;
  permission?: string;
}) {
  const { user, loading, hasPermission } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      redirectToLogin();
    }
  }, [loading, user]);

  if (loading) {
    return (
      <div className="cm-muted-inline" style={{ padding: "2rem", textAlign: "center" }}>
        <p>Cargando sesión…</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (permission && !hasPermission(permission)) {
    window.location.replace(getHomePath());
    return null;
  }

  return <>{children}</>;
}
