import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  createUser,
  listRoles,
  listUsers,
  updateRolePermissions,
  type RoleRow,
  type UserRow,
} from "../api";

export default function AdminUsersPage() {
  const { user, hasPermission } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [form, setForm] = useState({
    username: "",
    password: "",
    full_name: "",
    email: "",
    role_code: "operador",
  });

  const canWrite = hasPermission("users.write");
  const canRoles = hasPermission("roles.manage");

  async function reload() {
    const [u, r] = await Promise.all([listUsers(), listRoles()]);
    setUsers(u);
    setRoles(r);
  }

  useEffect(() => {
    reload().catch((e) =>
      setError(e instanceof Error ? e.message : "Error al cargar usuarios")
    );
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setError(null);
    setMessage(null);
    try {
      await createUser({
        username: form.username,
        password: form.password,
        full_name: form.full_name,
        email: form.email || undefined,
        role_code: form.role_code,
      });
      setMessage("Usuario creado");
      setForm({
        username: "",
        password: "",
        full_name: "",
        email: "",
        role_code: "operador",
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el usuario");
    }
  }

  async function onSaveRolePermissions(role: RoleRow) {
    if (!canRoles || role.code === "admin") return;
    setError(null);
    try {
      await updateRolePermissions(role.code, role.permissions);
      setMessage(`Permisos actualizados para ${role.name}`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar permisos");
    }
  }

  function togglePerm(role: RoleRow, perm: string) {
    setRoles((prev) =>
      prev.map((r) =>
        r.code === role.code
          ? {
              ...r,
              permissions: r.permissions.includes(perm)
                ? r.permissions.filter((p) => p !== perm)
                : [...r.permissions, perm],
            }
          : r
      )
    );
  }

  return (
    <div className="admin-page">
      <header className="header">
        <div>
          <h1>Administración</h1>
          <p className="header-sub">Usuarios, roles y permisos</p>
        </div>
        <Link to="/" className="header-link">
          Volver al mapa
        </Link>
      </header>

      <div className="admin-content">
        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}

        <section className="admin-card">
          <h2>Usuarios ({users.length})</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>{u.full_name}</td>
                  <td>{u.role.name}</td>
                  <td>{u.is_active ? "Activo" : "Inactivo"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {canWrite && (
          <section className="admin-card">
            <h2>Nuevo usuario</h2>
            <form className="admin-form" onSubmit={onCreate}>
              <input
                placeholder="Usuario"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
              <input
                placeholder="Nombre completo"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                required
              />
              <input
                type="email"
                placeholder="Correo (opcional)"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <input
                type="password"
                placeholder="Contraseña"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={6}
              />
              <select
                value={form.role_code}
                onChange={(e) => setForm({ ...form, role_code: e.target.value })}
              >
                {roles.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
              <button type="submit">Crear usuario</button>
            </form>
          </section>
        )}

        {canRoles && (
          <section className="admin-card">
            <h2>Roles y permisos</h2>
            <p className="admin-note">
              Sesión actual: {user?.username} ({user?.role.code})
            </p>
            {roles.map((role) => (
              <div key={role.code} className="role-block">
                <h3>
                  {role.name} <code>{role.code}</code>
                </h3>
                {role.code === "admin" ? (
                  <p className="admin-note">Rol protegido (todos los permisos).</p>
                ) : (
                  <>
                    <div className="perm-grid">
                      {[
                        "dashboard.view",
                        "parcels.read",
                        "parcels.write",
                        "parties.read",
                        "parties.write",
                        "users.read",
                        "users.write",
                        "roles.manage",
                      ].map((perm) => (
                        <label key={perm} className="perm-check">
                          <input
                            type="checkbox"
                            checked={role.permissions.includes(perm)}
                            onChange={() => togglePerm(role, perm)}
                          />
                          {perm}
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => onSaveRolePermissions(role)}
                    >
                      Guardar permisos
                    </button>
                  </>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
