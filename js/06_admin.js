/* ============================================================
   v22 - Administración institucional de usuarios
============================================================ */
let adminUsuariosCache = [];

function setAdminMensaje(texto, tipo = "") {
  const el = document.getElementById("adminMensaje");
  if (!el) return;
  el.innerText = texto || "";
  el.className = "admin-mensaje " + tipo;
}

async function fetchAdmin(url, options = {}) {
  const token = obtenerTokenInstitucional();

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    ...(options.headers || {})
  };

  return fetch(`${API}${url}`, {
    ...options,
    headers
  });
}

function formatearFechaAdmin(fecha) {
  if (!fecha) return "-";
  try {
    return new Date(fecha).toLocaleString("es-MX");
  } catch (e) {
    return fecha;
  }
}

async function cargarUsuariosAdmin() {
  const cont = document.getElementById("adminUsuariosTabla");
  if (!cont) return;

  cont.innerHTML = "<div style='padding:10px;'>Cargando usuarios...</div>";

  try {
    const r = await fetchAdmin("/admin/usuarios");

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || "No se pudieron cargar usuarios");
    }

    const data = await r.json();
    adminUsuariosCache = data.usuarios || [];

    pintarUsuariosAdmin(adminUsuariosCache);

  } catch (e) {
    console.error(e);
    cont.innerHTML = `<div style="padding:10px;color:#991b1b;">${e.message}</div>`;
  }
}

function filtrarUsuariosAdmin() {
  const filtro = (document.getElementById("adminFiltroUsuarios")?.value || "").toUpperCase();

  const filtrados = adminUsuariosCache.filter(u =>
    Object.values(u).some(v => String(v ?? "").toUpperCase().includes(filtro))
  );

  pintarUsuariosAdmin(filtrados);
}

function pintarUsuariosAdmin(usuarios) {
  const cont = document.getElementById("adminUsuariosTabla");
  if (!cont) return;

  const total = usuarios.length;
  const activos = usuarios.filter(u => u.activo).length;
  const inactivos = total - activos;

  const setTxt = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.innerText = Number(v || 0).toLocaleString("es-MX");
  };

  setTxt("adminTotalUsuarios", total);
  setTxt("adminUsuariosActivos", activos);
  setTxt("adminUsuariosInactivos", inactivos);

  if (usuarios.length === 0) {
    cont.innerHTML = "<div style='padding:10px;'>Sin usuarios.</div>";
    return;
  }

  let html = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Usuario</th>
          <th>Nombre</th>
          <th>Rol</th>
          <th>Estado</th>
          <th>Último acceso</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
  `;

  usuarios.forEach(u => {
    const estado = u.activo
      ? '<span class="badge-admin-activo">ACTIVO</span>'
      : '<span class="badge-admin-inactivo">INACTIVO</span>';

    const rol = u.rol_principal || (Array.isArray(u.roles) ? u.roles.join(", ") : "");

    html += `
      <tr>
        <td><b>${u.usuario || ""}</b></td>
        <td>${u.nombre_completo || ""}</td>
        <td>${rol || ""}</td>
        <td>${estado}</td>
        <td>${formatearFechaAdmin(u.ultimo_acceso)}</td>
        <td>
          <button type="button" onclick="editarUsuarioAdmin(${u.id})">✏️ Editar</button>
          <button type="button" onclick="resetPasswordAdmin(${u.id})">🔑 Reset</button>
          <button type="button" onclick="toggleActivoAdmin(${u.id}, ${u.activo ? "true" : "false"})">
            ${u.activo ? "⛔ Desactivar" : "✅ Activar"}
          </button>
        </td>
      </tr>
    `;
  });

  html += "</tbody></table>";
  cont.innerHTML = html;
}

async function cargarAuditoriaAdmin() {
  if (!puede("ver_auditoria")) {
    const cont = document.getElementById("adminAuditoriaTabla");
    if (cont) cont.innerHTML = "<div style='padding:10px;color:#991b1b;'>Sin permisos para ver auditoría.</div>";
    return;
  }

  const cont = document.getElementById("adminAuditoriaTabla");
  if (!cont) return;

  cont.innerHTML = "<div style='padding:10px;'>Cargando auditoría...</div>";

  try {
    const r = await fetchAdmin("/admin/auditoria?limite=200");

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || "No se pudo cargar auditoría");
    }

    const data = await r.json();
    const rows = data.auditoria || [];

    if (rows.length === 0) {
      cont.innerHTML = "<div style='padding:10px;'>Sin movimientos.</div>";
      return;
    }

    let html = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Usuario</th>
            <th>Acción</th>
            <th>Módulo</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
    `;

    rows.forEach(a => {
      html += `
        <tr>
          <td>${formatearFechaAdmin(a.fecha)}</td>
          <td>${a.usuario || ""}</td>
          <td>${a.accion || ""}</td>
          <td>${a.modulo || ""}</td>
          <td>${a.detalle || ""}</td>
        </tr>
      `;
    });

    html += "</tbody></table>";
    cont.innerHTML = html;

  } catch (e) {
    console.error(e);
    cont.innerHTML = `<div style="padding:10px;color:#991b1b;">${e.message}</div>`;
  }
}

async function crearUsuarioAdmin() {
  if (!requerirPermiso("administrar_usuarios", "Solo ADMIN puede crear usuarios.")) return;

  const usuario = document.getElementById("adminNuevoUsuario")?.value.trim();
  const nombre = document.getElementById("adminNuevoNombre")?.value.trim();
  const password = document.getElementById("adminNuevoPassword")?.value || "";
  const rol = document.getElementById("adminNuevoRol")?.value || "consulta";

  if (!usuario || !nombre || !password) {
    setAdminMensaje("Captura usuario, nombre y contraseña.", "error");
    return;
  }

  try {
    setAdminMensaje("Creando usuario...", "ok");

    const r = await fetchAdmin("/admin/usuarios", {
      method: "POST",
      body: JSON.stringify({
        usuario,
        nombre_completo: nombre,
        password,
        rol
      })
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      throw new Error(data.detail || "No se pudo crear usuario");
    }

    document.getElementById("adminNuevoUsuario").value = "";
    document.getElementById("adminNuevoNombre").value = "";
    document.getElementById("adminNuevoPassword").value = "";
    document.getElementById("adminNuevoRol").value = "consulta";

    setAdminMensaje("Usuario creado correctamente.", "ok");
    await cargarUsuariosAdmin();
    await cargarAuditoriaAdmin();

  } catch (e) {
    console.error(e);
    setAdminMensaje(e.message, "error");
  }
}

async function editarUsuarioAdmin(id) {
  if (!requerirPermiso("administrar_usuarios", "Solo ADMIN puede editar usuarios.")) return;

  const u = adminUsuariosCache.find(x => Number(x.id) === Number(id));
  if (!u) return;

  const nombre = prompt("Nombre completo:", u.nombre_completo || "");
  if (nombre === null) return;

  const rolActual = u.rol_principal || "consulta";
  const rol = prompt("Rol (admin, supervisor, catastro, cartografia, fiscalizacion, consulta):", rolActual);
  if (rol === null) return;

  try {
    const r = await fetchAdmin(`/admin/usuarios/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        nombre_completo: nombre,
        rol: rol
      })
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      throw new Error(data.detail || "No se pudo actualizar usuario");
    }

    setAdminMensaje("Usuario actualizado correctamente.", "ok");
    await cargarUsuariosAdmin();
    await cargarAuditoriaAdmin();

  } catch (e) {
    console.error(e);
    setAdminMensaje(e.message, "error");
  }
}

async function resetPasswordAdmin(id) {
  if (!requerirPermiso("administrar_usuarios", "Solo ADMIN puede resetear contraseñas.")) return;

  const password = prompt("Nueva contraseña:");
  if (!password) return;

  try {
    const r = await fetchAdmin(`/admin/usuarios/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password })
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      throw new Error(data.detail || "No se pudo actualizar contraseña");
    }

    setAdminMensaje("Contraseña actualizada correctamente.", "ok");
    await cargarAuditoriaAdmin();

  } catch (e) {
    console.error(e);
    setAdminMensaje(e.message, "error");
  }
}

async function toggleActivoAdmin(id, activoActual) {
  if (!requerirPermiso("administrar_usuarios", "Solo ADMIN puede activar o desactivar usuarios.")) return;

  try {
    const r = await fetchAdmin(`/admin/usuarios/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        activo: !activoActual
      })
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      throw new Error(data.detail || "No se pudo cambiar estado");
    }

    setAdminMensaje("Estado actualizado correctamente.", "ok");
    await cargarUsuariosAdmin();
    await cargarAuditoriaAdmin();

  } catch (e) {
    console.error(e);
    setAdminMensaje(e.message, "error");
  }
}


window.addEventListener("load", function() {
  prepararEventosLoginInstitucional();
  validarSesionInstitucional();

  registrarEnterBusquedas();
  inicializarFichaDraggable();
  cargarDashboardCartografico();
  inicializarBotonOcultarPanel();
  inicializarAdministradorCapas();
  cargarDashboardFiscal();
  const chkLeyendaInicial = document.getElementById("chkLeyenda");
  const leyendaInicial = document.getElementById("leyendaDinamica");
  const btnLeyendaInicial = document.getElementById("btnMostrarLeyenda");
  if (chkLeyendaInicial && chkLeyendaInicial.checked && leyendaInicial) {
    leyendaInicial.classList.remove("oculto");
    if (btnLeyendaInicial) btnLeyendaInicial.classList.add("oculto");
  }
  actualizarLeyendaDinamica();
});


function asegurarLeyendaFlotanteVisible() {
  const chk = document.getElementById("chkLeyenda");
  const leyenda = document.getElementById("leyendaDinamica");
  const btn = document.getElementById("btnMostrarLeyenda");

  if (chk) chk.checked = true;
  if (leyenda) {
    leyenda.classList.remove("oculto");
    leyenda.classList.remove("minimizada");
    leyenda.style.display = "";
  }
  if (btn) btn.classList.add("oculto");

  if (typeof actualizarLeyendaDinamica === "function") {
    actualizarLeyendaDinamica();
  }
}

setTimeout(asegurarLeyendaFlotanteVisible, 500);
setTimeout(asegurarLeyendaFlotanteVisible, 1500);




