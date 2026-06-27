

/* ============================================================
   v26h - FIX GLOBAL escapeHtml
   Evita error "escapeHtml is not defined" sin tocar login.
============================================================ */
if (typeof window.escapeHtml !== "function") {
  window.escapeHtml = function(valor) {
    return String(valor ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  };
}

if (typeof window.movimientoEscapeHtml !== "function") {
  window.movimientoEscapeHtml = window.escapeHtml;
}



/* --- v21: Login institucional JWT --- */
const TOKEN_KEY_CATASTRO = "catastro_bc_token";
const USER_KEY_CATASTRO = "catastro_bc_usuario";

function obtenerTokenInstitucional() {
  return localStorage.getItem(TOKEN_KEY_CATASTRO) || "";
}

function obtenerUsuarioSesion() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY_CATASTRO) || "null");
  } catch (e) {
    return null;
  }
}


/* ============================================================
   v26d - Helper de autenticación institucional robusto
============================================================ */
function authHeaders(extra = {}) {
  let token = "";

  try {
    if (typeof obtenerTokenInstitucional === "function") {
      token = obtenerTokenInstitucional() || "";
    }
  } catch (e) {}

  if (!token) {
    token =
      localStorage.getItem("catastro_token") ||
      localStorage.getItem("TOKEN_CATASTRO") ||
      localStorage.getItem("tokenCatastro") ||
      localStorage.getItem("token") ||
      sessionStorage.getItem("catastro_token") ||
      sessionStorage.getItem("TOKEN_CATASTRO") ||
      sessionStorage.getItem("tokenCatastro") ||
      sessionStorage.getItem("token") ||
      "";
  }

  return {
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    ...extra
  };
}

function authJsonHeaders(extra = {}) {
  return authHeaders({
    "Content-Type": "application/json",
    ...extra
  });
}

function guardarSesionInstitucional(data) {
  localStorage.setItem(TOKEN_KEY_CATASTRO, data.access_token);
  localStorage.setItem(USER_KEY_CATASTRO, JSON.stringify({
    usuario: data.usuario,
    nombre: data.nombre,
    rol: data.rol,
    permisos: data.permisos || [],
    expira_minutos: data.expira_minutos
  }));
}

function limpiarSesionInstitucional() {
  localStorage.removeItem(TOKEN_KEY_CATASTRO);
  localStorage.removeItem(USER_KEY_CATASTRO);
}

function mostrarLoginInstitucional() {
  const overlay = document.getElementById("loginOverlay");
  const barra = document.getElementById("barraSesion");
  if (overlay) overlay.classList.remove("oculto");
  if (barra) barra.classList.add("oculto");
}

function mostrarSistemaInstitucional(usuario) {
  const overlay = document.getElementById("loginOverlay");
  const barra = document.getElementById("barraSesion");

  if (overlay) overlay.classList.add("oculto");

  if (barra) {
    barra.classList.remove("oculto");
    document.getElementById("sesionNombre").innerText = usuario?.nombre || usuario?.usuario || "Usuario";
    document.getElementById("sesionRol").innerText = usuario?.rol ? `Rol: ${usuario.rol}` : "";
  }

  aplicarPermisosVisuales(usuario?.rol || "consulta");

  if (String(usuario?.rol || "").toLowerCase() === "admin") {
    setTimeout(() => {
      if (typeof cargarUsuariosAdmin === "function") cargarUsuariosAdmin();
      if (typeof cargarAuditoriaAdmin === "function") cargarAuditoriaAdmin();
    }, 400);
  }
}

function setLoginMensaje(texto, tipo = "") {
  const msg = document.getElementById("loginMensaje");
  if (!msg) return;
  msg.innerText = texto || "";
  msg.className = "login-mensaje " + tipo;
}

async function loginInstitucional() {
  const usuario = document.getElementById("loginUsuario")?.value.trim();
  const password = document.getElementById("loginPassword")?.value || "";
  const btn = document.getElementById("btnLogin");

  if (!usuario || !password) {
    setLoginMensaje("Captura usuario y contraseña.", "error");
    return;
  }

  try {
    if (btn) {
      btn.disabled = true;
      btn.innerText = "Validando...";
    }

    setLoginMensaje("Validando acceso institucional...", "info");

    const r = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, password })
    });

    const data = await r.json();

    if (!r.ok) {
      throw new Error(data.detail || "Usuario o contraseña incorrectos.");
    }

    guardarSesionInstitucional(data);
    setLoginMensaje("Acceso correcto.", "ok");
    mostrarSistemaInstitucional(data);

  } catch (e) {
    console.error("Error login:", e);
    limpiarSesionInstitucional();
    setLoginMensaje(e.message || "No se pudo iniciar sesión.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = "Ingresar";
    }
  }
}

async function validarSesionInstitucional() {
  const token = obtenerTokenInstitucional();

  if (!token) {
    mostrarLoginInstitucional();
    return false;
  }

  try {
    const r = await fetch(`${API}/me`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!r.ok) {
      throw new Error("Sesión expirada");
    }

    const data = await r.json();

    const usuario = {
      usuario: data.usuario,
      nombre: data.nombre,
      rol: data.rol,
      permisos: data.permisos || []
    };

    localStorage.setItem(USER_KEY_CATASTRO, JSON.stringify(usuario));
    mostrarSistemaInstitucional(usuario);
    return true;

  } catch (e) {
    console.warn("Sesión inválida:", e);
    limpiarSesionInstitucional();
    mostrarLoginInstitucional();
    return false;
  }
}

function cerrarSesionInstitucional() {
  limpiarSesionInstitucional();
  mostrarLoginInstitucional();
}

function aplicarPermisosVisuales(rol) {
  const rolNorm = String(rol || "").trim().toLowerCase();
  const esAdmin = rolNorm === "admin";
  const puedeHerramientas = ["admin", "cartografia", "catastro", "supervisor"].includes(rolNorm);
  const puedeMovimientos = ["admin", "supervisor", "catastro"].includes(rolNorm);

  document.querySelectorAll(".solo-admin").forEach(el => {
    el.style.display = esAdmin ? "" : "none";
  });

  document.querySelectorAll(".requiere-herramientas").forEach(el => {
    el.style.display = puedeHerramientas ? "" : "none";
  });

  document.querySelectorAll(".requiere-movimientos").forEach(el => {
    el.style.display = puedeMovimientos ? "" : "none";
  });

  if (typeof aplicarACLVisual === "function") {
    aplicarACLVisual(rolNorm);
  }

  const tabAdmin = document.getElementById("tabAdministracion");
  if (tabAdmin && tabAdmin.classList.contains("active")) {
    tabAdmin.style.display = "";
  }
}

function prepararEventosLoginInstitucional() {
  const usuario = document.getElementById("loginUsuario");
  const pass = document.getElementById("loginPassword");

  [usuario, pass].forEach(el => {
    if (!el) return;
    el.addEventListener("keyup", e => {
      if (e.key === "Enter") loginInstitucional();
    });
  });
}



/* ============================================================
   v24 - ACL institucional de permisos por rol
============================================================ */
const ACL_CATASTRO = {
  admin: { administrar_usuarios:true, ver_auditoria:true, editar_cartografia:true, editar_catastro:true, editar_fiscal:true, medir:true, exportar_pdf:true, exportar_excel:true },
  supervisor: { administrar_usuarios:false, ver_auditoria:true, editar_cartografia:true, editar_catastro:true, editar_fiscal:true, medir:true, exportar_pdf:true, exportar_excel:true },
  cartografia: { administrar_usuarios:false, ver_auditoria:false, editar_cartografia:true, editar_catastro:false, editar_fiscal:false, medir:true, exportar_pdf:true, exportar_excel:true },
  catastro: { administrar_usuarios:false, ver_auditoria:false, editar_cartografia:false, editar_catastro:true, editar_fiscal:false, medir:true, exportar_pdf:true, exportar_excel:true },
  fiscalizacion: { administrar_usuarios:false, ver_auditoria:false, editar_cartografia:false, editar_catastro:false, editar_fiscal:true, medir:false, exportar_pdf:true, exportar_excel:true },
  consulta: { administrar_usuarios:false, ver_auditoria:false, editar_cartografia:false, editar_catastro:false, editar_fiscal:false, medir:false, exportar_pdf:true, exportar_excel:true }
};

function rolActualInstitucional() {
  const u = obtenerUsuarioSesion();
  return String(u?.rol || "consulta").trim().toLowerCase();
}

function permisosRol(rol = null) {
  const rolNorm = String(rol || rolActualInstitucional() || "consulta").trim().toLowerCase();
  return ACL_CATASTRO[rolNorm] || ACL_CATASTRO.consulta;
}

function puede(permiso, rol = null) {
  return permisosRol(rol)[permiso] === true;
}

function requerirPermiso(permiso, mensaje = "No tienes permisos para realizar esta acción.") {
  if (!puede(permiso)) {
    alert(mensaje);
    return false;
  }
  return true;
}

function aplicarACLVisual(rol = null) {
  const rolNorm = String(rol || rolActualInstitucional() || "consulta").trim().toLowerCase();
  [
    [".perm-admin-usuarios", "administrar_usuarios"],
    [".perm-ver-auditoria", "ver_auditoria"],
    [".perm-editar-cartografia", "editar_cartografia"],
    [".perm-editar-catastro", "editar_catastro"],
    [".perm-editar-fiscal", "editar_fiscal"],
    [".perm-medir", "medir"],
    [".perm-exportar-pdf", "exportar_pdf"],
    [".perm-exportar-excel", "exportar_excel"]
  ].forEach(([selector, permiso]) => {
    document.querySelectorAll(selector).forEach(el => {
      el.style.display = puede(permiso, rolNorm) ? "" : "none";
    });
  });
}


