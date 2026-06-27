

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


/* --- v10: administrador de opacidad y orden de capas --- */
const capaOrdenEstado = {
  predios: 30,
  fiscal: 60,
  colonias: 20,
  codigos: 25,
  auditoria: 70
};

function obtenerCapaPorId(id) {
  const candidatos = {
    predios: ["prediosWmsLayer", "prediosLayer", "wmsPrediosLayer", "layerPredios", "prediosWMS"],
    colonias: ["coloniasWmsLayer", "coloniasLayer", "wmsColoniasLayer", "layerColonias"],
    codigos: ["codigosWmsLayer", "codigosLayer", "codigosPostalesWmsLayer", "wmsCodigosLayer", "layerCodigos"],
    auditoria: ["cambiosGeomLayer", "cambiosGeometricosLayer", "auditoriaLayer", "layerCambiosGeom"],
    fiscal: ["vectorLayer", "prediosVectorLayer", "seleccionLayer", "layerVector"]
  };

  for (const nombre of (candidatos[id] || [])) {
    try {
      if (typeof window[nombre] !== "undefined" && window[nombre]) return window[nombre];
      if (eval("typeof " + nombre + " !== 'undefined'")) {
        const lyr = eval(nombre);
        if (lyr) return lyr;
      }
    } catch (e) {}
  }

  // fallback: buscar por nombre interno si fue asignado
  try {
    const layers = map.getLayers().getArray();
    return layers.find(l => l.get && (l.get("layerId") === id || l.get("name") === id)) || null;
  } catch (e) {
    return null;
  }
}

function cambiarOpacidadCapa(id, valor) {
  const opacidad = Number(valor) / 100;
  const capa = obtenerCapaPorId(id);

  const txtMap = {
    predios: "opPrediosTxt",
    fiscal: "opFiscalTxt",
    colonias: "opColoniasTxt",
    codigos: "opCodigosTxt",
    auditoria: "opAuditoriaTxt"
  };

  const txt = document.getElementById(txtMap[id]);
  if (txt) txt.innerText = `${valor}%`;

  if (capa && typeof capa.setOpacity === "function") {
    capa.setOpacity(opacidad);
  }

  // En el fiscal local, la capa vectorial es la selección/temático local.
  // Si no encuentra capa, no rompe el visor.
}

function aplicarZIndexCapa(id) {
  const capa = obtenerCapaPorId(id);
  if (capa && typeof capa.setZIndex === "function") {
    capa.setZIndex(capaOrdenEstado[id]);
  }
}

function subirCapa(id) {
  capaOrdenEstado[id] = (capaOrdenEstado[id] || 0) + 10;
  aplicarZIndexCapa(id);
  actualizarOrdenVisualCapas();
}

function bajarCapa(id) {
  capaOrdenEstado[id] = (capaOrdenEstado[id] || 0) - 10;
  aplicarZIndexCapa(id);
  actualizarOrdenVisualCapas();
}

function actualizarOrdenVisualCapas() {
  const contenedor = document.querySelector("#tabCapas .card-panel:nth-of-type(2)");
  if (!contenedor) return;

  const items = Array.from(contenedor.querySelectorAll(".layer-item"));
  items
    .sort((a, b) => {
      const za = capaOrdenEstado[a.dataset.layerId] || 0;
      const zb = capaOrdenEstado[b.dataset.layerId] || 0;
      return zb - za;
    })
    .forEach(item => contenedor.insertBefore(item, contenedor.querySelector(".dashboard-toggle-row")));
}

function inicializarAdministradorCapas() {
  Object.keys(capaOrdenEstado).forEach(aplicarZIndexCapa);

  // Intentar nombrar capas por referencia conocida.
  try { if (typeof prediosWmsLayer !== "undefined") prediosWmsLayer.set("layerId", "predios"); } catch(e) {}
  try { if (typeof coloniasWmsLayer !== "undefined") coloniasWmsLayer.set("layerId", "colonias"); } catch(e) {}
  try { if (typeof codigosWmsLayer !== "undefined") codigosWmsLayer.set("layerId", "codigos"); } catch(e) {}
  try { if (typeof cambiosGeomLayer !== "undefined") cambiosGeomLayer.set("layerId", "auditoria"); } catch(e) {}
  try { if (typeof vectorLayer !== "undefined") vectorLayer.set("layerId", "fiscal"); } catch(e) {}

  actualizarOrdenVisualCapas();
}



function inicializarBotonOcultarPanel() {
  const header = document.querySelector("#panel .panel-header");
  if (!header || document.getElementById("btnOcultarPanel")) return;

  const btn = document.createElement("button");
  btn.id = "btnOcultarPanel";
  btn.type = "button";
  btn.innerHTML = "×";
  btn.title = "Ocultar panel";
  btn.onclick = ocultarPanelPrincipal;
  header.appendChild(btn);
}

function ocultarPanelPrincipal() {
  const panel = document.getElementById("panel");
  const btn = document.getElementById("btnMostrarPanel");
  if (panel) panel.classList.add("panel-oculto");
  if (btn) btn.classList.remove("oculto");

  setTimeout(() => {
    if (typeof map !== "undefined" && map) map.updateSize();
  }, 350);
}

function mostrarPanelPrincipal() {
  const panel = document.getElementById("panel");
  const btn = document.getElementById("btnMostrarPanel");
  if (panel) panel.classList.remove("panel-oculto");
  if (btn) btn.classList.add("oculto");

  setTimeout(() => {
    if (typeof map !== "undefined" && map) map.updateSize();
  }, 350);
}

const API = "https://fcnarqnodo.hopto.org/api/catastro";

const vectorSource = new ol.source.Vector();

function estiloPredio(feature) {
  const seleccionado = feature.get("seleccionado");
  const etiqueta = feature.get("clave_catastral") || "";
  const tieneInfoFiscal = feature.get("info_fiscal") === true;
  const tieneAdeudo = Number(feature.get("adeudo_total") || 0) > 0;

  let strokeColor = "#0066ff";
  let fillColor = "rgba(0, 102, 255, 0.10)";
  let haloColor = "rgba(0, 102, 255, 0.25)";

  if (tieneInfoFiscal) {
    if (tieneAdeudo) {
      strokeColor = "#c62828";
      fillColor = "rgba(198, 40, 40, 0.20)";
      haloColor = "rgba(198, 40, 40, 0.16)";
    } else {
      strokeColor = "#15803d";
      fillColor = "rgba(21, 128, 61, 0.18)";
      haloColor = "rgba(21, 128, 61, 0.13)";
    }
  }

  if (seleccionado) {
    return [
      new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: haloColor,
          width: 11
        }),
        fill: new ol.style.Fill({
          color: fillColor
        })
      }),
      new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: strokeColor,
          width: 4
        }),
        fill: new ol.style.Fill({
          color: fillColor
        }),
        text: new ol.style.Text({
          text: etiqueta,
          font: "bold 13px Arial",
          fill: new ol.style.Fill({ color: "#000000" }),
          stroke: new ol.style.Stroke({ color: "#ffffff", width: 3 }),
          overflow: true
        })
      })
    ];
  }

  return new ol.style.Style({
    stroke: new ol.style.Stroke({ color: strokeColor, width: tieneInfoFiscal ? 3 : 2 }),
    fill: new ol.style.Fill({ color: fillColor }),
    text: new ol.style.Text({
      text: etiqueta,
      font: "11px Arial",
      fill: new ol.style.Fill({ color: "#000000" }),
      stroke: new ol.style.Stroke({ color: "#ffffff", width: 3 }),
      overflow: true
    })
  });
}

function estiloCambiosGeometricos(feature) {
  const tipo = feature.get("tipo_cambio");
  const prioridad = feature.get("prioridad");
  let color = "#fdd835";

  if (prioridad === "ALTA" || tipo === "CAMBIO_CRITICO") {
    color = "#e53935";
  } else if (prioridad === "MEDIA" || tipo === "CAMBIO_GEOMETRIA_Y_AREA") {
    color = "#fb8c00";
  } else if (tipo === "GEOMETRIA_INVALIDA") {
    color = "#000000";
  }

  return new ol.style.Style({
    stroke: new ol.style.Stroke({
      color: color,
      width: 4
    }),
    fill: new ol.style.Fill({
      color: "rgba(255, 0, 0, 0.12)"
    }),
    text: new ol.style.Text({
      text: feature.get("clave_catastral") || "",
      font: "bold 11px Arial",
      fill: new ol.style.Fill({ color: "#000000" }),
      stroke: new ol.style.Stroke({ color: "#ffffff", width: 3 }),
      overflow: true
    })
  });
}

const vectorLayer = new ol.layer.Vector({
  source: vectorSource,
  style: estiloPredio
});

const sourceCambiosGeometricos = new ol.source.Vector({
  url: `${API}/cambios-geometricos`,
  format: new ol.format.GeoJSON({
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857"
  })
});

const capaCambiosGeometricos = new ol.layer.Vector({
  source: sourceCambiosGeometricos,
  style: estiloCambiosGeometricos,
  visible: false
});

const prediosWmsLayer = new ol.layer.Tile({
  visible: true,
  opacity: 0.85,
  source: new ol.source.TileWMS({
    url: "https://fcnarqnodo.hopto.org/geoserver/catastro_bc/wms",
    params: {
      "LAYERS": "catastro_bc:predios_oficial",
      "TILED": true,
      "VERSION": "1.1.1",
      "FORMAT": "image/png",
      "TRANSPARENT": true
    },
    serverType: "geoserver",
    crossOrigin: "anonymous"
  })
});

const coloniasWmsLayer = new ol.layer.Tile({
  visible: false,
  opacity: 0.55,
  source: new ol.source.TileWMS({
    url: "https://fcnarqnodo.hopto.org/geoserver/geonode/wms",
    params: {
      "LAYERS": "colonias",
      "TILED": true,
      "VERSION": "1.1.1",
      "FORMAT": "image/png",
      "TRANSPARENT": true
    },
    serverType: "geoserver",
    crossOrigin: "anonymous"
  })
});

const codigosWmsLayer = new ol.layer.Tile({
  visible: false,
  opacity: 0.45,
  source: new ol.source.TileWMS({
    url: "https://fcnarqnodo.hopto.org/geoserver/geonode/wms",
    params: {
      "LAYERS": "codigos_postales_bc_utm1",
      "TILED": true,
      "VERSION": "1.1.1",
      "FORMAT": "image/png",
      "TRANSPARENT": true
    },
    serverType: "geoserver",
    crossOrigin: "anonymous"
  })
});

const osmLayer = new ol.layer.Tile({
  visible: false,
  source: new ol.source.OSM()
});

const esriLayer = new ol.layer.Tile({
  visible: false,
  source: new ol.source.XYZ({
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attributions: "Tiles © Esri"
  })
});

const googleSatLayer = new ol.layer.Tile({
  visible: false,
  source: new ol.source.XYZ({
    url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    attributions: "Google Satellite"
  })
});

const googleHybridLayer = new ol.layer.Tile({
  visible: true,
  source: new ol.source.XYZ({
    url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    attributions: "Google Hybrid"
  })
});

const map = new ol.Map({
  target: "map",
  layers: [
    osmLayer,
    esriLayer,
    googleSatLayer,
    googleHybridLayer,
    codigosWmsLayer,
    coloniasWmsLayer,
    prediosWmsLayer,
    capaCambiosGeometricos,
    vectorLayer
  ],
  view: new ol.View({
    projection: "EPSG:3857",
    center: ol.proj.fromLonLat([-115.4683, 32.6245]),
    zoom: 12
  })
});

function cambiarCapaBase() {
  const valor = document.getElementById("baseLayerSelect").value;
  osmLayer.setVisible(valor === "osm");
  esriLayer.setVisible(valor === "esri");
  googleSatLayer.setVisible(valor === "googleSat");
  googleHybridLayer.setVisible(valor === "googleHybrid");
}

function togglePrediosWms() {
  prediosWmsLayer.setVisible(document.getElementById("chkPrediosWms").checked);
  refrescarLeyendaDespuesDeCambio();
}

function toggleColoniasWms() {
  coloniasWmsLayer.setVisible(document.getElementById("chkColoniasWms").checked);
  refrescarLeyendaDespuesDeCambio();
}

function toggleCodigosWms() {
  codigosWmsLayer.setVisible(document.getElementById("chkCodigosWms").checked);
  refrescarLeyendaDespuesDeCambio();
}

function toggleCambiosGeom() {
  capaCambiosGeometricos.setVisible(document.getElementById("chkCambiosGeom").checked);
  refrescarLeyendaDespuesDeCambio();
}

function toggleDashboardVisible() {
  const dashboard = document.getElementById("dashboardCartografico");
  const chk = document.getElementById("chkDashboard");
  if (!dashboard || !chk) return;
  dashboard.style.display = chk.checked ? "block" : "none";
}

function toggleDashboard() {
  const contenido = document.getElementById("dashboardContenido");
  if (!contenido) return;
  contenido.style.display = contenido.style.display === "none" ? "block" : "none";
}


/* --- v19: Leyenda dinámica flotante tipo MapStore --- */
function capaVisibleSegura(capa) {
  try {
    return capa && typeof capa.getVisible === "function" ? capa.getVisible() : false;
  } catch (e) {
    return false;
  }
}

function toggleLeyendaDinamica() {
  const leyenda = document.getElementById("leyendaDinamica");
  const btn = document.getElementById("btnMostrarLeyenda");
  const chk = document.getElementById("chkLeyenda");
  if (!leyenda || !btn) return;

  const estaOculta = leyenda.classList.contains("oculto");

  if (estaOculta) {
    leyenda.classList.remove("oculto");
    btn.classList.add("oculto");
    if (chk) chk.checked = true;
    actualizarLeyendaDinamica();
  } else {
    leyenda.classList.add("oculto");
    btn.classList.remove("oculto");
    if (chk) chk.checked = false;
  }
}

function toggleLeyendaDesdePanel() {
  const chk = document.getElementById("chkLeyenda");
  const leyenda = document.getElementById("leyendaDinamica");
  const btn = document.getElementById("btnMostrarLeyenda");
  if (!chk || !leyenda || !btn) return;

  if (chk.checked) {
    leyenda.classList.remove("oculto");
    btn.classList.add("oculto");
    actualizarLeyendaDinamica();
  } else {
    leyenda.classList.add("oculto");
    btn.classList.remove("oculto");
  }
}

function minimizarLeyendaDinamica() {
  const leyenda = document.getElementById("leyendaDinamica");
  if (!leyenda) return;
  leyenda.classList.toggle("minimizada");
}

function itemLeyenda(colorClass, titulo, detalle = "") {
  return `
    <div class="leyenda-item">
      <span class="leyenda-simbolo ${colorClass}"></span>
      <div>
        <b>${titulo}</b>
        ${detalle ? `<small>${detalle}</small>` : ""}
      </div>
    </div>
  `;
}

function grupoLeyenda(titulo, contenido) {
  if (!contenido || contenido.trim() === "") return "";
  return `
    <div class="leyenda-grupo">
      <div class="leyenda-grupo-title">${titulo}</div>
      ${contenido}
    </div>
  `;
}

function actualizarLeyendaDinamica() {
  const cont = document.getElementById("leyendaContenido");
  const leyenda = document.getElementById("leyendaDinamica");
  const btn = document.getElementById("btnMostrarLeyenda");
  const chk = document.getElementById("chkLeyenda");

  if (!cont) return;

  // Si el control está marcado, la leyenda flotante debe mostrarse siempre.
  if (chk && chk.checked && leyenda) {
    leyenda.classList.remove("oculto");
    if (btn) btn.classList.add("oculto");
  }

  let html = "";

  // Fiscal siempre visible porque es simbología institucional base.
  html += grupoLeyenda("Fiscal", `
    ${itemLeyenda("simbolo-verde", "Sin adeudo", "Predio sin adeudo registrado")}
    ${itemLeyenda("simbolo-rojo", "Con adeudo", "Adeudo total mayor a cero")}
    ${itemLeyenda("simbolo-amarillo", "Sin dato fiscal", "Predios sin información fiscal")}
  `);

  // Predios oficiales siempre visible porque la capa WMS institucional es la base principal.
  html += grupoLeyenda("Predios", `
    ${itemLeyenda("simbolo-predios", "Predios oficiales", "Capa WMS institucional")}
    ${itemLeyenda("simbolo-seleccion", "Predio seleccionado", "Consulta activa")}
  `);

  if (typeof coloniasWmsLayer !== "undefined" && capaVisibleSegura(coloniasWmsLayer)) {
    html += grupoLeyenda("Colonias", `
      ${itemLeyenda("simbolo-colonias", "Colonias", "Límite de colonia WMS")}
    `);
  }

  if (typeof codigosWmsLayer !== "undefined" && capaVisibleSegura(codigosWmsLayer)) {
    html += grupoLeyenda("Códigos postales", `
      ${itemLeyenda("simbolo-codigos", "Códigos postales", "Límite CP WMS")}
    `);
  }

  if (typeof capaCambiosGeometricos !== "undefined" && capaVisibleSegura(capaCambiosGeometricos)) {
    html += grupoLeyenda("Auditoría geométrica", `
      ${itemLeyenda("simbolo-aud-alta", "Prioridad alta", "Cambio crítico / revisar")}
      ${itemLeyenda("simbolo-aud-media", "Prioridad media", "Cambio geométrico")}
      ${itemLeyenda("simbolo-aud-baja", "Prioridad baja", "Observación menor")}
    `);
  }

  cont.innerHTML = html;
}

function refrescarLeyendaDespuesDeCambio() {
  setTimeout(actualizarLeyendaDinamica, 80);
}

async function cargarDashboardCartografico() {
  try {
    const r = await fetch(`${API}/dashboard-cartografico?_=${Date.now()}`, {
      cache: "no-store"
    });

    if (!r.ok) {
      console.error("Dashboard cartográfico HTTP:", r.status);
      return;
    }

    const d = await r.json();

    const setTxt = (id, valor) => {
      const el = document.getElementById(id);
      if (el) el.innerText = valor;
    };

    setTxt("dashTotal", Number(d.total_predios || 0).toLocaleString("es-MX"));
    setTxt("dashDibujados", Number(d.dibujados || 0).toLocaleString("es-MX"));
    setTxt("dashSinGeom", Number(d.sin_geometria || 0).toLocaleString("es-MX"));
    setTxt("dashCobertura", `${d.cobertura || 0}%`);
    setTxt("dashCambios", Number(d.cambios_geometricos || 0).toLocaleString("es-MX"));

  } catch (e) {
    console.error("No se pudo cargar dashboard cartográfico", e);
  }
}


async function cargarDashboardFiscal() {
  try {
    const r = await fetch(`${API}/dashboard-fiscal?_=${Date.now()}`, {
      cache: "no-store"
    });

    if (!r.ok) {
      console.warn("Dashboard fiscal HTTP:", r.status);
      return;
    }

    const d = await r.json();

    const setTxt = (id, valor) => {
      const el = document.getElementById(id);
      if (el) el.innerText = valor;
    };

    setTxt("dashConAdeudo", Number(d.con_adeudo || 0).toLocaleString("es-MX"));
    setTxt("dashSinAdeudo", Number(d.sin_adeudo || 0).toLocaleString("es-MX"));
    setTxt("dashAdeudoTotal", formatoMoneda(d.adeudo_total || 0));
    setTxt("dashValorTotal", formatoMoneda(d.valor_catastral_total || 0));
    setTxt("dashConDocs", Number((d.expediente && d.expediente.con_documentos) || 0).toLocaleString("es-MX"));
    setTxt("dashSinDocs", Number((d.expediente && d.expediente.sin_documentos) || 0).toLocaleString("es-MX"));

  } catch (e) {
    console.warn("No se pudo cargar dashboard fiscal", e);
  }
}

function formatoMoneda(valor) {
  if (valor === null || valor === undefined || valor === "" || isNaN(Number(valor))) {
    return "Sin dato";
  }
  return Number(valor).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN"
  });
}

function formatoNumero(valor, decimales = 2) {
  if (valor === null || valor === undefined || valor === "" || isNaN(Number(valor))) {
    return "Sin dato";
  }
  return Number(valor).toLocaleString("es-MX", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales
  });
}

function val(v) {
  return (v === null || v === undefined || v === "") ? "Sin dato" : v;
}

function indicador(valor) {
  return valor
    ? `<span class="badge-ok">SI</span>`
    : `<span class="badge-warn">NO</span>`;
}

function porcentajeExpediente(p) {
  const campos = [
    p.tiene_documentos,
    p.tiene_cartografia,
    p.tiene_construccion,
    p.tiene_avaluo,
    p.tiene_inspeccion,
    p.tiene_rppc,
    p.tiene_fotografia,
    p.tiene_cedula,
    p.tiene_historial
  ];
  const completos = campos.filter(Boolean).length;
  return Math.round((completos / campos.length) * 100);
}

function claseAvanceExpediente(porcentaje) {
  if (porcentaje >= 80) return "badge-ok";
  if (porcentaje >= 40) return "badge-warn";
  return "badge-danger";
}

function textoAvanceExpediente(porcentaje) {
  if (porcentaje >= 80) return "COMPLETO";
  if (porcentaje >= 40) return "EN PROCESO";
  return "CRÍTICO";
}

function toggleSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = el.style.display === "none" ? "block" : "none";
}

function toggleHistorial() {
  toggleSection("timeline-expediente");
}


function abrirFichaFlotante() {
  const ficha = document.getElementById("fichaFlotante");
  if (!ficha) return;
  ficha.classList.remove("oculto");
  ficha.classList.remove("minimizada");
}

function cerrarFichaFlotante() {
  const ficha = document.getElementById("fichaFlotante");
  if (!ficha) return;
  ficha.classList.add("oculto");
}

function minimizarFichaFlotante() {
  const ficha = document.getElementById("fichaFlotante");
  if (!ficha) return;
  ficha.classList.toggle("minimizada");
}

function mostrarFichaTab(tabId, boton) {
  document.querySelectorAll(".ficha-tab-panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".ficha-tab-btn").forEach(b => b.classList.remove("active"));
  const tab = document.getElementById(tabId);
  if (tab) tab.classList.add("active");
  if (boton) boton.classList.add("active");
}

function inicializarFichaDraggable() {
  const ficha = document.getElementById("fichaFlotante");
  const header = document.getElementById("fichaFlotanteHeader");
  if (!ficha || !header || ficha.dataset.dragReady === "1") return;
  ficha.dataset.dragReady = "1";

  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;

  header.addEventListener("mousedown", function(e) {
    if (e.target.tagName === "BUTTON") return;
    dragging = true;
    const rect = ficha.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", function(e) {
    if (!dragging) return;
    const maxX = window.innerWidth - ficha.offsetWidth - 8;
    const maxY = window.innerHeight - 45;
    let x = e.clientX - offsetX;
    let y = e.clientY - offsetY;
    x = Math.max(8, Math.min(x, maxX));
    y = Math.max(8, Math.min(y, maxY));
    ficha.style.left = x + "px";
    ficha.style.top = y + "px";
    ficha.style.right = "auto";
  });

  document.addEventListener("mouseup", function() {
    dragging = false;
    document.body.style.userSelect = "";
  });
}

function pintarFichaFlotante(p) {
  const contenedor = document.getElementById("fichaFlotanteBody");
  const claveHeader = document.getElementById("fichaFlotanteClave");
  if (!contenedor) return;

  const fichaBox = document.getElementById("fichaFlotante");
  if (fichaBox) {
    fichaBox.classList.remove("estado-adeudo", "estado-sin-adeudo");
    fichaBox.classList.add(Number(p.adeudo_total || 0) > 0 ? "estado-adeudo" : "estado-sin-adeudo");
  }

  if (claveHeader) claveHeader.innerText = val(p.clave_catastral);

  const adeudoTotal = Number(p.adeudo_total || 0);
  const adeudoBadge = adeudoTotal > 0
    ? `<span class="badge-warn">CON ADEUDO</span>`
    : `<span class="badge-ok">SIN ADEUDO</span>`;

  const avance = porcentajeExpediente(p);

  contenedor.innerHTML = `
    <div class="ficha-status-box">
      <div class="big">${val(p.clave_catastral)}</div>
      <div>${val(p.nombre_completo || p.propietario)}</div>
      <div style="margin-top:5px;">
        ${p.dibujado ? '<span class="badge-ok">DIBUJADO</span>' : '<span class="badge-warn">SIN GEOMETRÍA DIRECTA</span>'}
        ${Number(p.adeudo_total || 0) > 0 ? '<span class="badge-fiscal-adeudo">CON ADEUDO</span>' : '<span class="badge-fiscal-ok">SIN ADEUDO</span>'}
      </div>
    </div>

    <div class="ficha-tabs">
      <button type="button" class="ficha-tab-btn active" onclick="mostrarFichaTab('fichaTabIdentificacion', this)">Identificación</button>
      <button type="button" class="ficha-tab-btn" onclick="mostrarFichaTab('fichaTabValores', this)">Valores</button>
      <button type="button" class="ficha-tab-btn" onclick="mostrarFichaTab('fichaTabExpediente', this)">Expediente</button>
      <button type="button" class="ficha-tab-btn" onclick="mostrarFichaTab('fichaTabUbicacion', this)">Ubicación</button>
      <button type="button" class="ficha-tab-btn" onclick="mostrarFichaTab('fichaTabAdeudos', this)">Adeudos</button>
      <button type="button" class="ficha-tab-btn" onclick="mostrarFichaTab('fichaTabDocumentos', this)">Docs</button>
    </div>

    <div id="fichaTabIdentificacion" class="ficha-tab-panel active">
      <div class="ficha-mini-row"><div class="label">Clave</div><div class="value">${val(p.clave_catastral)}</div></div>
      <div class="ficha-mini-row"><div class="label">Nombre / Razón social</div><div class="value">${val(p.nombre_completo || p.propietario)}</div></div>
      <div class="ficha-mini-row"><div class="label">Tipo persona</div><div class="value">${val(p.tipo_persona)}</div></div>
      <div class="ficha-mini-row"><div class="label">RFC</div><div class="value">${val(p.rfc)}</div></div>
      <div class="ficha-mini-row"><div class="label">Titularidad</div><div class="value">${val(p.tipo_titularidad)}</div></div>
      <div class="ficha-mini-row"><div class="label">% Propiedad</div><div class="value">${val(p.porcentaje_propiedad)}</div></div>
    </div>

    <div id="fichaTabUbicacion" class="ficha-tab-panel">
      <div class="ficha-mini-row"><div class="label">Delegación</div><div class="value">${val(p.delegacion)}</div></div>
      <div class="ficha-mini-row"><div class="label">Colonia</div><div class="value">${val(p.colonia)}</div></div>
      <div class="ficha-mini-row"><div class="label">Calle</div><div class="value">${val(p.calle)}</div></div>
      <div class="ficha-mini-row"><div class="label">Número oficial</div><div class="value">${val(p.numof)}</div></div>
      <div class="ficha-mini-row"><div class="label">Interior</div><div class="value">${val(p.numint)}</div></div>
      <div class="ficha-mini-row"><div class="label">CP</div><div class="value">${val(p.cp)}</div></div>
    </div>

    <div id="fichaTabValores" class="ficha-tab-panel">
      <div class="ficha-mini-row"><div class="label">Zona homogénea</div><div class="value">${val(p.zona_homogenea || p.zonah)}</div></div>
      <div class="ficha-mini-row"><div class="label">Uso predial</div><div class="value">${val(p.descripcion_uso)}</div></div>
      <div class="ficha-mini-row"><div class="label">ID tasa</div><div class="value">${val(p.id_tasa)}</div></div>
      <div class="ficha-mini-row"><div class="label">Tasa</div><div class="value">${val(p.porcentaje_tasa)}%</div></div>
      <div class="ficha-mini-row"><div class="label">Sup. documental</div><div class="value">${formatoNumero(p.sup_documental)} m²</div></div>
      <div class="ficha-mini-row"><div class="label">Sup. física</div><div class="value">${formatoNumero(p.sup_fisica)} m²</div></div>
      <div class="ficha-mini-row"><div class="label">Sup. construcción</div><div class="value">${formatoNumero(p.sup_const)} m²</div></div>
      <div class="ficha-mini-row"><div class="label">Valor 2026</div><div class="value">${formatoMoneda(p.valor2026)}</div></div>
    </div>

    <div id="fichaTabAdeudos" class="ficha-tab-panel">
      <div class="ficha-mini-row"><div class="label">Adeudo 2026</div><div class="value">${formatoMoneda(p.adeudo_2026)}</div></div>
      <div class="ficha-mini-row"><div class="label">Adeudo total</div><div class="value">${formatoMoneda(p.adeudo_total)}</div></div>
      <div class="ficha-mini-row"><div class="label">Estado</div><div class="value">${adeudoBadge}</div></div>
      <div class="ficha-mini-row"><div class="label">Dibujado</div><div class="value">${p.dibujado ? "Sí" : "No / padrón sin geometría directa"}</div></div>
      <div class="ficha-mini-row"><div class="label">Condominio</div><div class="value">${val(p.condominio)}</div></div>
    </div>

    <div id="fichaTabExpediente" class="ficha-tab-panel">
      <div class="ficha-mini-row"><div class="label">Avance</div><div class="value"><span class="${claseAvanceExpediente(avance)}">${avance}% - ${textoAvanceExpediente(avance)}</span></div></div>
      <div class="ficha-mini-row"><div class="label">Documentos</div><div class="value">${indicador(p.tiene_documentos)}</div></div>
      <div class="ficha-mini-row"><div class="label">Cartografía</div><div class="value">${indicador(p.tiene_cartografia)}</div></div>
      <div class="ficha-mini-row"><div class="label">Construcción</div><div class="value">${indicador(p.tiene_construccion)}</div></div>
      <div class="ficha-mini-row"><div class="label">Avalúo</div><div class="value">${indicador(p.tiene_avaluo)}</div></div>
      <div class="ficha-mini-row"><div class="label">Inspección</div><div class="value">${indicador(p.tiene_inspeccion)}</div></div>
      <div class="ficha-mini-row"><div class="label">RPPC</div><div class="value">${indicador(p.tiene_rppc)}</div></div>
      <div class="ficha-mini-row"><div class="label">Fotografía</div><div class="value">${indicador(p.tiene_fotografia)}</div></div>
      <div class="ficha-mini-row"><div class="label">Cédula</div><div class="value">${indicador(p.tiene_cedula)}</div></div>
    </div>

    <div id="fichaTabDocumentos" class="ficha-tab-panel">
      <a class="btn-expediente-externo" href="${urlExpedienteExterno(p.clave_catastral)}" target="_blank" rel="noopener noreferrer">
        📂 Abrir expediente documental externo
      </a>
      <div class="ficha-mini-row"><div class="label">Repositorio</div><div class="value">Mexicali / Documentación</div></div>
      <div class="ficha-mini-row"><div class="label">Clave enviada</div><div class="value">${val(p.clave_catastral)}</div></div>
      <div class="ficha-mini-row"><div class="label">Historial</div><div class="value">Disponible en ficha institucional</div></div>
    </div>
  `;

  abrirFichaFlotante();
}

function pintarFicha(p) {
  pintarFichaFlotante(p);
  const adeudoTotal = Number(p.adeudo_total || 0);
  const adeudoBadge = adeudoTotal > 0
    ? `<span class="badge-warn">CON ADEUDO</span>`
    : `<span class="badge-ok">SIN ADEUDO</span>`;

  document.getElementById("ficha").innerHTML = `
    <div class="ficha-title" style="display:flex; justify-content:space-between; align-items:center;">
      <span>Ficha predial institucional</span>
      <span style="font-style:italic; font-size:14px;">${val(p.clave_catastral)}</span>
    </div>

    <div class="ficha-section">
      <div class="ficha-subtitle" onclick="toggleSection('sec-identificacion')" style="cursor:pointer;">Identificación ▼</div>
      <div id="sec-identificacion" style="display:none;">
        <div class="ficha-row"><b>Clave:</b><span>${val(p.clave_catastral)}</span></div>
        <div class="ficha-row"><b>Propietario:</b><span>${val(p.nombre_completo || p.propietario)}</span></div>
        <div class="ficha-row"><b>Tipo persona:</b><span>${val(p.tipo_persona)}</span></div>
        <div class="ficha-row"><b>RFC:</b><span>${val(p.rfc)}</span></div>
      </div>
    </div>

    <div class="ficha-section">
      <div class="ficha-subtitle" onclick="toggleSection('sec-ubicacion')" style="cursor:pointer;">Ubicación ▼</div>
      <div id="sec-ubicacion" style="display:none;">
        <div class="ficha-row"><b>Delegación:</b><span>${val(p.delegacion)}</span></div>
        <div class="ficha-row"><b>Colonia:</b><span>${val(p.colonia)}</span></div>
        <div class="ficha-row"><b>Calle:</b><span>${val(p.calle)}</span></div>
        <div class="ficha-row"><b>Número oficial:</b><span>${val(p.numof)}</span></div>
        <div class="ficha-row"><b>Número interior:</b><span>${val(p.numint)}</span></div>
        <div class="ficha-row"><b>Letra:</b><span>${val(p.letra)}</span></div>
        <div class="ficha-row"><b>CP:</b><span>${val(p.cp)}</span></div>
      </div>
    </div>

    <div class="ficha-section">
      <div class="ficha-subtitle" onclick="toggleSection('sec-catastral')" style="cursor:pointer;">Información catastral ▼</div>
      <div id="sec-catastral" style="display:none;">
        <div class="ficha-row"><b>Zona homogénea:</b><span>${val(p.zona_homogenea || p.zonah)}</span></div>
        <div class="ficha-row"><b>Uso predial:</b><span>${val(p.descripcion_uso)}</span></div>
        <div class="ficha-row"><b>ID tasa:</b><span>${val(p.id_tasa)}</span></div>
        <div class="ficha-row"><b>Tasa:</b><span>${val(p.porcentaje_tasa)}%</span></div>
        <div class="ficha-row"><b>Condominio:</b><span>${val(p.condominio)}</span></div>
      </div>
    </div>

    <div class="ficha-section">
      <div class="ficha-subtitle" onclick="toggleSection('sec-superficies')" style="cursor:pointer;">Superficies y valores ▼</div>
      <div id="sec-superficies" style="display:none;">
        <div class="ficha-row"><b>Sup. documental:</b><span>${formatoNumero(p.sup_documental)} m²</span></div>
        <div class="ficha-row"><b>Sup. física:</b><span>${formatoNumero(p.sup_fisica)} m²</span></div>
        <div class="ficha-row"><b>Sup. construcción:</b><span>${formatoNumero(p.sup_const)} m²</span></div>
        <div class="ficha-row"><b>Valor 2026:</b><span>${formatoMoneda(p.valor2026)}</span></div>
      </div>
    </div>

    <div class="ficha-section">
      <div class="ficha-subtitle" onclick="toggleSection('sec-adeudos')" style="cursor:pointer;">Adeudos y cartografía ▼</div>
      <div id="sec-adeudos" style="display:none;">
        <div class="ficha-row"><b>Adeudo 2026:</b><span>${formatoMoneda(p.adeudo_2026)}</span></div>
        <div class="ficha-row"><b>Adeudo total:</b><span>${formatoMoneda(p.adeudo_total)}</span></div>
        <div class="ficha-row"><b>Estado:</b><span>${adeudoBadge}</span></div>
        <div class="ficha-row"><b>Dibujado:</b><span>${p.dibujado ? "Sí" : "No / padrón sin geometría directa"}</span></div>
      </div>
    </div>

    <div class="ficha-section">
      <div class="ficha-subtitle" onclick="toggleSection('sec-expediente')" style="cursor:pointer;">Expediente integral ▼</div>
      <div id="sec-expediente" style="display:none;">
        <div class="ficha-row"><b>Avance expediente:</b><span><span class="${claseAvanceExpediente(porcentajeExpediente(p))}">${porcentajeExpediente(p)}% - ${textoAvanceExpediente(porcentajeExpediente(p))}</span></span></div>
        <div class="ficha-row"><b>Documentos:</b><span>${indicador(p.tiene_documentos)}</span></div>
        <div class="ficha-row"><b>Cartografía:</b><span>${indicador(p.tiene_cartografia)}</span></div>
        <div class="ficha-row"><b>Construcción:</b><span>${indicador(p.tiene_construccion)}</span></div>
        <div class="ficha-row"><b>Avalúo:</b><span>${indicador(p.tiene_avaluo)}</span></div>
        <div class="ficha-row"><b>Inspección:</b><span>${indicador(p.tiene_inspeccion)}</span></div>
        <div class="ficha-row"><b>RPPC:</b><span>${indicador(p.tiene_rppc)}</span></div>
        <div class="ficha-row"><b>Fotografía:</b><span>${indicador(p.tiene_fotografia)}</span></div>
        <div class="ficha-row"><b>Cédula:</b><span>${indicador(p.tiene_cedula)}</span></div>
        <div class="ficha-row"><b>Historial:</b><span>${indicador(p.tiene_historial)}</span></div>
      </div>
    </div>

    <div class="ficha-section">
      <div class="ficha-subtitle" onclick="toggleSection('sec-documentos')" style="cursor:pointer;">Documentos del expediente ▼</div>
      <div id="sec-documentos" style="display:none; padding-top: 5px;">
        <a class="btn-expediente-externo" href="${urlExpedienteExterno(p.clave_catastral)}" target="_blank" rel="noopener noreferrer">
          📂 Abrir expediente documental externo
        </a>
        <div>Cargando documentos locales...</div>
      </div>
    </div>

    <div class="ficha-section">
      <div class="ficha-subtitle" onclick="toggleHistorial()" style="cursor:pointer;">Historial institucional ▼</div>
      <div id="timeline-expediente" style="display:none; padding-top: 5px;">Cargando historial...</div>
    </div>
  `;

  cargarHistorial(p.clave_catastral);
  cargarDocumentos(p.clave_catastral);
}

async function cargarHistorial(clave) {
  const contenedor = document.getElementById("timeline-expediente");
  if (!contenedor || !clave) return;

  try {
    const r = await fetch(`${API}/expediente/${clave}/historial`);
    if (!r.ok) {
      contenedor.innerHTML = "No fue posible cargar historial.";
      return;
    }

    const data = await r.json();
    const historial = data.historial || [];

    if (historial.length === 0) {
      contenedor.innerHTML = "Sin movimientos registrados.";
      return;
    }

    let html = "";
    historial.forEach(item => {
      const fecha = item.fecha_modificacion
        ? new Date(item.fecha_modificacion).toLocaleString("es-MX")
        : "Sin fecha";

      html += `
        <div class="timeline-item">
          <div class="timeline-fecha">${fecha}</div>
          <div class="timeline-mov">${item.tipo_movimiento || item.accion || "MOVIMIENTO"}</div>
          <div class="timeline-user">Usuario: ${item.usuario_modifico || "Sin usuario"}</div>
          <div class="timeline-obs">${item.observaciones || "Sin observaciones"}</div>
        </div>
      `;
    });
    contenedor.innerHTML = html;
  } catch (err) {
    console.error(err);
    contenedor.innerHTML = "No fue posible cargar historial.";
  }
}

async function cargarDocumentos(clave) {
  const contenedor = document.getElementById("sec-documentos");
  if (!contenedor || !clave) return;

  try {
    const r = await fetch(`${API}/expediente/${clave}/documentos`);
    if (!r.ok) {
      contenedor.innerHTML = "No fue posible cargar documentos.";
      return;
    }

    const data = await r.json();
    const documentos = data.documentos || [];

    if (documentos.length === 0) {
      contenedor.innerHTML += "<div>Sin documentos locales registrados.</div>";
      return;
    }

    let html = "";
    documentos.forEach(doc => {
      const urlDoc = `${API}/documentos/${clave}/${doc.nombre_archivo}`;
      html += `
        <div class="timeline-item">
          <div class="timeline-fecha">${doc.tipo_documento || "DOCUMENTO"}</div>
          <div class="timeline-user">${doc.nombre_archivo || ""}</div>
          <div class="timeline-obs">${doc.descripcion || "Sin descripción"}</div>
          <div class="timeline-obs">Año: ${doc.anio || "Sin dato"}</div>
          <button style="margin-top:5px; padding:4px;" onclick="window.open('${urlDoc}', '_blank')">Abrir documento</button>
        </div>
      `;
    });
    contenedor.innerHTML = html;
  } catch (err) {
    console.error(err);
    contenedor.innerHTML = "No fue posible cargar documentos.";
  }
}

function pintarMensajeNoDibujado(p) {
  vectorSource.clear();
  document.getElementById("ficha").innerHTML = `
    <div style="background:#fff3cd; border:2px solid #ff9800; color:#7a4a00; padding:10px; border-radius:8px; margin-bottom:10px; font-weight:bold;">
      ⚠ PREDIO NO DIBUJADO EN CARTOGRAFÍA<br>
      La clave existe en el padrón institucional, pero aún no tiene geometría ligada.
    </div>

    <div class="ficha-title">Ficha predial institucional</div>
    <div class="ficha-row"><b>Clave:</b><span>${val(p.clave_catastral)}</span></div>
    <div class="ficha-row"><b>Propietario:</b><span>${val(p.nombre_completo || p.propietario)}</span></div>
    <div class="ficha-row"><b>Delegación:</b><span>${val(p.delegacion)}</span></div>
    <div class="ficha-row"><b>Colonia:</b><span>${val(p.colonia)}</span></div>
    <div class="ficha-row"><b>Calle:</b><span>${val(p.calle)}</span></div>
    <div class="ficha-row"><b>Número:</b><span>${val(p.numof)}</span></div>
    <div class="ficha-row"><b>Zona homogénea:</b><span>${val(p.zona_homogenea || p.zonah)}</span></div>
    <div class="ficha-row"><b>Uso:</b><span>${val(p.descripcion_uso)}</span></div>
    <div class="ficha-row"><b>Sup. documental:</b><span>${formatoNumero(p.sup_documental)} m²</span></div>
    <div class="ficha-row"><b>Valor 2026:</b><span>${formatoMoneda(p.valor2026)}</span></div>
    <div class="ficha-section"><div class="ficha-row"><b>Estatus cartográfico:</b><span class="badge-warn">NO DIBUJADO</span></div></div>
  `;
}


function aplicarFiscalAFeature(feature, ficha) {
  if (!feature || !ficha) return;

  feature.set("adeudo_total", Number(ficha.adeudo_total || 0));
  feature.set("adeudo_2026", Number(ficha.adeudo_2026 || 0));
  feature.set("info_fiscal", true);
  feature.set("seleccionado", true);
}

function aplicarFiscalFeatureCollection(features, fichaSeleccionada = null) {
  features.forEach(f => {
    f.set("info_fiscal", false);
    f.set("seleccionado", false);

    if (
      fichaSeleccionada &&
      String(f.get("clave_catastral")) === String(fichaSeleccionada.clave_catastral)
    ) {
      aplicarFiscalAFeature(f, fichaSeleccionada);
    }
  });
}

function toggleAdeudosFiscal() {
  const chk = document.getElementById("chkAdeudosFiscal");
  if (!chk) return;

  vectorSource.getFeatures().forEach(f => {
    if (!chk.checked) {
      f.set("info_fiscal", false);
    } else if (f.get("adeudo_total") !== undefined) {
      f.set("info_fiscal", true);
    }
    f.changed();
  });

  refrescarLeyendaDespuesDeCambio();
}

function urlExpedienteExterno(clave) {
  return `https://www.mexicali.gob.mx/webpub/consultacatastro/Documentacion.aspx?${encodeURIComponent(clave || "")}`;
}

function abrirExpedienteExterno(clave) {
  if (!clave) return;
  window.open(urlExpedienteExterno(clave), "_blank", "noopener,noreferrer");
}

function pintarGeoJSON(featureGeojson, hacerZoom = true) {
  vectorSource.clear();
  if (!featureGeojson) return;

  const format = new ol.format.GeoJSON({
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857"
  });

  const feature = format.readFeature(featureGeojson);
  feature.set("seleccionado", true);
  if (featureGeojson.properties) {
    aplicarFiscalAFeature(feature, featureGeojson.properties);
  }
  vectorSource.addFeature(feature);

  if (hacerZoom) {
    map.getView().fit(vectorSource.getExtent(), {
      padding: [80, 80, 80, 380],
      maxZoom: 20,
      duration: 700
    });
  }
}

async function obtenerFichaPorClave(clave) {
  const resExp = await fetch(`${API}/expediente/${clave}`);
  if (!resExp.ok) return null;
  const expedienteGeojson = await resExp.json();
  return expedienteGeojson.properties || null;
}

async function cargarDesdeBusqueda(registro) {
  const resFicha = await fetch(`${API}/expediente/${registro.clave_catastral}`);

  if (!resFicha.ok) {
    if (registro.dibujado) {
      document.getElementById("ficha").innerHTML = `
        <div class="ficha-title">Ficha predial institucional</div>
        <div class="ficha-row"><b>Clave:</b><span>${val(registro.clave_catastral)}</span></div>
        <div class="ficha-row"><b>Propietario:</b><span>${val(registro.nombre_completo || registro.propietario)}</span></div>
        <div class="ficha-row"><b>Estatus:</b><span class="badge-ok">DIBUJADO EN CARTOGRAFÍA</span></div>
        <div class="ficha-section">El predio está dibujado, pero no se pudo cargar la ficha integral.</div>
      `;
      return;
    }

    pintarMensajeNoDibujado(registro);
    return;
  }

  const fichaGeojson = await resFicha.json();
  const ficha = fichaGeojson.properties || registro;

  if (fichaGeojson.geometry) {
    await seleccionarPorClave(ficha.clave_catastral || registro.clave_catastral);
    return;
  }

  if (ficha.dibujado || registro.dibujado) {
    pintarFicha(ficha);
    return;
  }

  vectorSource.clear();
  pintarMensajeNoDibujado(ficha);
}


function mostrarTab(tabId, boton) {
  document.querySelectorAll(".tab-content").forEach(t => {
    t.classList.remove("active");
    t.style.display = "none";
  });

  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));

  const tab = document.getElementById(tabId);
  if (tab) {
    tab.classList.add("active");
    tab.style.display = "block";
    tab.scrollTop = 0;
  }

  if (boton) boton.classList.add("active");

  if (tabId === "tabAdministracion") {
    setTimeout(() => {
      if (typeof cargarUsuariosAdmin === "function") cargarUsuariosAdmin();
      if (typeof cargarAuditoriaAdmin === "function") cargarAuditoriaAdmin();
    }, 150);
  }

  if (tabId === "tabMovimientos") {
    setTimeout(() => {
      if (typeof cargarMovimientosPadron === "function") cargarMovimientosPadron();
    }, 150);
  }

  setTimeout(() => {
    if (typeof map !== "undefined" && map) map.updateSize();
  }, 150);
}


/* --- v11: zoom automático a uno o varios resultados --- */
let resultadosLayer = null;
let resultadosSource = null;

function inicializarLayerResultadosBusqueda() {
  if (resultadosLayer) return;

  resultadosSource = new ol.source.Vector();

  resultadosLayer = new ol.layer.Vector({
    source: resultadosSource,
    zIndex: 85,
    style: function(feature) {
      const esPrincipal = feature.get("principal") === true;
      const tieneAdeudo = Number(feature.get("adeudo_total") || 0) > 0;
      const strokeColor = tieneAdeudo ? "#c62828" : "#15803d";
      const fillColor = tieneAdeudo
        ? (esPrincipal ? "rgba(198, 40, 40, 0.18)" : "rgba(198, 40, 40, 0.10)")
        : (esPrincipal ? "rgba(21, 128, 61, 0.16)" : "rgba(21, 128, 61, 0.08)");

      return new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: strokeColor,
          width: esPrincipal ? 4 : 2
        }),
        fill: new ol.style.Fill({
          color: fillColor
        }),
        text: new ol.style.Text({
          text: feature.get("clave_catastral") || "",
          font: esPrincipal ? "bold 12px Arial" : "11px Arial",
          fill: new ol.style.Fill({ color: "#111827" }),
          stroke: new ol.style.Stroke({ color: "#ffffff", width: 3 }),
          overflow: true
        })
      });
    }
  });

  map.addLayer(resultadosLayer);
}

async function obtenerGeojsonPorClaveParaZoom(clave) {
  if (!clave) return null;

  // Primero intenta la ficha predial normal porque suele traer geometría.
  try {
    const r = await fetch(`${API}/padron/${encodeURIComponent(clave)}/ficha?_=${Date.now()}`, {
      cache: "no-store"
    });

    if (r.ok) {
      const data = await r.json();

      if (data && data.geometry) return data;

      if (data && data.geojson && data.geojson.geometry) return data.geojson;

      if (data && data.feature && data.feature.geometry) return data.feature;
    }
  } catch (e) {
    console.warn("No se pudo obtener geometría por ficha:", clave, e);
  }

  // Fallback por endpoint directo si existe.
  try {
    const r2 = await fetch(`${API}/predios/${encodeURIComponent(clave)}/geojson?_=${Date.now()}`, {
      cache: "no-store"
    });

    if (r2.ok) {
      const data2 = await r2.json();
      if (data2 && data2.geometry) return data2;
    }
  } catch (e) {}

  return null;
}

async function zoomAResultadosBusqueda(resultados) {
  if (!Array.isArray(resultados) || resultados.length === 0) return;

  inicializarLayerResultadosBusqueda();
  resultadosSource.clear();

  const format = new ol.format.GeoJSON();

  // Para no hacer lenta la búsqueda, limitamos el zoom múltiple a 50 geometrías.
  const limite = Math.min(resultados.length, 50);
  const candidatos = resultados.slice(0, limite);

  const promesas = candidatos.map(async (p, idx) => {
    const clave = p.clave_catastral;
    const geo = await obtenerGeojsonPorClaveParaZoom(clave);
    if (!geo || !geo.geometry) return null;

    const feature = format.readFeature(geo, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857"
    });

    feature.set("clave_catastral", clave);
    feature.set("adeudo_total", Number(p.adeudo_total || geo.properties?.adeudo_total || 0));
    feature.set("principal", idx === 0 && resultados.length === 1);

    resultadosSource.addFeature(feature);
    return feature;
  });

  await Promise.all(promesas);

  const features = resultadosSource.getFeatures();
  if (features.length === 0) return;

  // Si es un solo resultado, también lo manda al flujo normal de selección/ficha.
  if (resultados.length === 1 && resultados[0].clave_catastral) {
    await cargarDesdeBusqueda(resultados[0]);
    return;
  }

  const extent = resultadosSource.getExtent();

  if (extent && !ol.extent.isEmpty(extent)) {
    map.getView().fit(extent, {
      padding: [90, 90, 210, 390],
      duration: 650,
      maxZoom: 18
    });
  }
}

function limpiarResultadosZoom() {
  if (resultadosSource) resultadosSource.clear();
}

/* --- v7 OK DataGrid institucional --- */
const gridEstado = {
  todos: [],
  filtrados: [],
  pagina: 1,
  pageSize: 25,
  sortCampo: "clave_catastral",
  sortDir: "asc",
  totalReal: 0
};

const gridColumnasResultados = [
  { campo: "clave_catastral", titulo: "Clave" },
  { campo: "nombre_completo", titulo: "Nombre / Razón social" },
  { campo: "colonia", titulo: "Colonia" },
  { campo: "calle", titulo: "Calle" },
  { campo: "numof", titulo: "# Oficial" },
  { campo: "zona_homogenea", titulo: "Zona H." },
  { campo: "valor2026", titulo: "Valor", tipo: "moneda" },
  { campo: "descripcion_uso", titulo: "Uso" },
  { campo: "dibujado", titulo: "Cartografía", tipo: "booleano" }
];

function cerrarTablaResultados() {
  const tabla = document.getElementById("tablaResultadosFlotante");
  if (tabla) tabla.classList.add("oculto");
}

function toggleTablaCompacta() {
  const tabla = document.getElementById("tablaResultadosFlotante");
  if (tabla) tabla.classList.toggle("compacta");
}

function renderizarTablaResultados(resultados, totalReal = null) {
  gridEstado.todos = resultados || [];
  gridEstado.filtrados = [...gridEstado.todos];
  gridEstado.totalReal = Number(totalReal ?? gridEstado.todos.length ?? 0);
  gridEstado.pagina = 1;
  ordenarResultadosInterno();
  pintarDataGridResultados();
}

function ordenarResultadosInterno() {
  gridEstado.filtrados.sort((a, b) => {
    let va = a[gridEstado.sortCampo];
    let vb = b[gridEstado.sortCampo];

    if (va === null || va === undefined) va = "";
    if (vb === null || vb === undefined) vb = "";

    const na = Number(va);
    const nb = Number(vb);

    if (!isNaN(na) && !isNaN(nb) && String(va).trim() !== "" && String(vb).trim() !== "") {
      return gridEstado.sortDir === "asc" ? na - nb : nb - na;
    }

    va = String(va).toUpperCase();
    vb = String(vb).toUpperCase();

    if (va < vb) return gridEstado.sortDir === "asc" ? -1 : 1;
    if (va > vb) return gridEstado.sortDir === "asc" ? 1 : -1;
    return 0;
  });
}

function ordenarResultados(campo) {
  if (gridEstado.sortCampo === campo) {
    gridEstado.sortDir = gridEstado.sortDir === "asc" ? "desc" : "asc";
  } else {
    gridEstado.sortCampo = campo;
    gridEstado.sortDir = "asc";
  }

  ordenarResultadosInterno();
  pintarDataGridResultados();
}

function pintarDataGridResultados() {
  const tabla = document.getElementById("tablaResultadosFlotante");
  const titulo = document.getElementById("tablaTitulo");
  const contenido = document.getElementById("tablaResultadosContenido");
  const resumen = document.getElementById("tablaResumen");
  const pagina = document.getElementById("tablaPagina");

  if (!tabla || !titulo || !contenido) return;

  titulo.innerText = "Resultados catastrales";

  if (gridEstado.filtrados.length === 0) {
    contenido.innerHTML = "<div style='padding:12px;'>Sin resultados.</div>";
    if (resumen) resumen.innerText = "0 de 0 registros";
    if (pagina) pagina.innerText = "1 / 1";
    tabla.classList.remove("oculto");
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(gridEstado.filtrados.length / gridEstado.pageSize));
  if (gridEstado.pagina > totalPaginas) gridEstado.pagina = totalPaginas;

  const ini = (gridEstado.pagina - 1) * gridEstado.pageSize;
  const fin = ini + gridEstado.pageSize;
  const paginaDatos = gridEstado.filtrados.slice(ini, fin);

  let html = `
    <div class="resultados-table-wrap">
      <table class="resultados-table">
        <thead>
          <tr>
  `;

  gridColumnasResultados.forEach(col => {
    const sortClass =
      gridEstado.sortCampo === col.campo
        ? (gridEstado.sortDir === "asc" ? "sort-asc" : "sort-desc")
        : "";

    html += `<th class="sortable ${sortClass}" onclick="ordenarResultados('${col.campo}')">${col.titulo}</th>`;
  });

  html += `
          </tr>
        </thead>
        <tbody>
  `;

  paginaDatos.forEach((p, i) => {
    const idxGlobal = ini + i;
    html += `<tr data-idx="${idxGlobal}" onclick="seleccionarResultadoTabla(${idxGlobal})">`;

    gridColumnasResultados.forEach(col => {
      let valor = p[col.campo];

      if (col.tipo === "moneda") {
        valor = formatoMoneda(valor);
        html += `<td class="money">${valor}</td>`;
      } else if (col.tipo === "booleano") {
        valor = valor
          ? '<span class="badge-grid badge-grid-ok">DIBUJADO</span>'
          : '<span class="badge-grid badge-grid-warn">SIN GEOM.</span>';
        html += `<td class="center">${valor}</td>`;
      } else {
        html += `<td>${valor || ""}</td>`;
      }
    });

    html += "</tr>";
  });

  html += "</tbody></table></div>";
  contenido.innerHTML = html;

  if (resumen) {
    const totalReal = gridEstado.totalReal || gridEstado.filtrados.length;
    const cargados = gridEstado.todos.length;
    if (totalReal > cargados) {
      resumen.innerText = `${ini + 1}-${Math.min(fin, gridEstado.filtrados.length)} de ${cargados.toLocaleString("es-MX")} cargados · Total encontrado: ${totalReal.toLocaleString("es-MX")}`;
    } else {
      resumen.innerText = `${ini + 1}-${Math.min(fin, gridEstado.filtrados.length)} de ${gridEstado.filtrados.length.toLocaleString("es-MX")} registros`;
    }
  }
  if (pagina) pagina.innerText = `${gridEstado.pagina} / ${totalPaginas}`;

  tabla.classList.remove("oculto");
}

async function seleccionarResultadoTabla(idx) {
  const p = gridEstado.filtrados[idx];
  if (!p) return;

  document.querySelectorAll(".resultados-table tr").forEach(tr => tr.classList.remove("resultado-activo"));
  const tr = document.querySelector(`.resultados-table tr[data-idx="${idx}"]`);
  if (tr) tr.classList.add("resultado-activo");

  document.getElementById("claveInput").value = p.clave_catastral;
  await cargarDesdeBusqueda(p);
}

function filtrarTablaResultados() {
  const filtro = (document.getElementById("filtroTablaResultados")?.value || "").toUpperCase();

  gridEstado.filtrados = gridEstado.todos.filter(p =>
    Object.values(p).some(v => String(v ?? "").toUpperCase().includes(filtro))
  );

  gridEstado.pagina = 1;
  ordenarResultadosInterno();
  pintarDataGridResultados();
}

function cambiarPageSizeResultados() {
  gridEstado.pageSize = Number(document.getElementById("pageSizeResultados")?.value || 25);
  gridEstado.pagina = 1;
  pintarDataGridResultados();
}

function paginaResultadosAnterior() {
  if (gridEstado.pagina > 1) {
    gridEstado.pagina--;
    pintarDataGridResultados();
  }
}

function paginaResultadosSiguiente() {
  const totalPaginas = Math.max(1, Math.ceil(gridEstado.filtrados.length / gridEstado.pageSize));
  if (gridEstado.pagina < totalPaginas) {
    gridEstado.pagina++;
    pintarDataGridResultados();
  }
}



/* --- v20: PDF institucional del predio seleccionado --- */
function obtenerClaveSeleccionadaPDF() {
  const fichaClave = document.getElementById("fichaClave")?.innerText?.trim();
  if (fichaClave) return fichaClave;

  const inputClave = document.getElementById("claveInput")?.value?.trim();
  if (inputClave) return inputClave;

  try {
    const f = vectorSource.getFeatures().find(x => x.get("seleccionado") === true);
    return f ? (f.get("clave_catastral") || "") : "";
  } catch (e) {
    return "";
  }
}

function obtenerPropiedadesFichaPDF() {
  const clave = obtenerClaveSeleccionadaPDF();
  if (!clave) return null;

  try {
    const f = vectorSource.getFeatures().find(x => (x.get("clave_catastral") || "").toUpperCase() === clave.toUpperCase());
    if (f) return f.getProperties();
  } catch (e) {}

  return {
    clave_catastral: clave,
    nombre_completo: document.querySelector(".ficha-status-box .big + div")?.innerText || ""
  };
}

function formatoPdfMoneda(v) {
  const n = Number(v || 0);
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function textoPdf(v) {
  if (v === null || v === undefined || v === "") return "Sin dato";
  return String(v);
}

function obtenerImagenMapaPDF() {
  return new Promise(resolve => {
    let resuelto = false;

    const finalizar = (img) => {
      if (!resuelto) {
        resuelto = true;
        resolve(img);
      }
    };

    // Timeout de seguridad: si el mapa tarda o falla, continúa sin croquis capturado.
    setTimeout(() => finalizar(null), 2500);

    try {
      map.once("rendercomplete", function () {
        try {
          const size = map.getSize();
          const canvasFinal = document.createElement("canvas");
          canvasFinal.width = size[0];
          canvasFinal.height = size[1];
          const ctx = canvasFinal.getContext("2d");

          Array.prototype.forEach.call(
            document.querySelectorAll(".ol-layer canvas, canvas.ol-layer"),
            function (canvas) {
              try {
                if (canvas.width > 0) {
                  const opacity = canvas.parentNode.style.opacity || canvas.style.opacity;
                  ctx.globalAlpha = opacity === "" ? 1 : Number(opacity);

                  let matrix;
                  const transform = canvas.style.transform;
                  if (transform && transform.startsWith("matrix")) {
                    matrix = transform.match(/^matrix\(([^\(]*)\)$/)[1].split(",").map(Number);
                  } else {
                    matrix = [1, 0, 0, 1, 0, 0];
                  }

                  CanvasRenderingContext2D.prototype.setTransform.apply(ctx, matrix);
                  ctx.drawImage(canvas, 0, 0);
                }
              } catch (canvasError) {
                console.warn("Una capa no pudo capturarse para PDF:", canvasError);
              }
            }
          );

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;

          // Esta línea puede fallar con Google/tiles externos por CORS.
          const data = canvasFinal.toDataURL("image/png");
          finalizar(data);
        } catch (e) {
          console.warn("No se pudo capturar el mapa para PDF; se generará sin imagen de mapa.", e);
          finalizar(null);
        }
      });

      map.renderSync();
    } catch (e) {
      console.warn("No se pudo iniciar captura del mapa:", e);
      finalizar(null);
    }
  });
}

async function generarQRPDF(clave) {
  try {
    const canvas = document.getElementById("qrPdfTemp") || document.createElement("canvas");
    const url = `${location.origin}${location.pathname}?clave=${encodeURIComponent(clave)}`;
    await QRCode.toCanvas(canvas, url, { width: 120, margin: 1 });
    return canvas.toDataURL("image/png");
  } catch (e) {
    console.warn("No se pudo generar QR:", e);
    return null;
  }
}


/* --- v20c: croquis institucional WMS para PDF cuando Google bloquea captura --- */
function obtenerFeatureSeleccionadaPDF() {
  try {
    const clave = obtenerClaveSeleccionadaPDF();
    return vectorSource.getFeatures().find(f =>
      (f.get("clave_catastral") || "").toUpperCase() === (clave || "").toUpperCase()
    ) || vectorSource.getFeatures().find(f => f.get("seleccionado") === true) || null;
  } catch (e) {
    return null;
  }
}

function expandirExtentPDF(extent, factor = 1.25) {
  const w = extent[2] - extent[0];
  const h = extent[3] - extent[1];
  const cx = (extent[0] + extent[2]) / 2;
  const cy = (extent[1] + extent[3]) / 2;
  const maxDim = Math.max(w, h, 80);
  const half = (maxDim * factor) / 2;
  return [cx - half, cy - half, cx + half, cy + half];
}

function cargarImagenPDF(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function dibujarGeometriaPDF(ctx, geom, bbox, width, height) {
  if (!geom) return;

  const extent = bbox;
  const minx = extent[0], miny = extent[1], maxx = extent[2], maxy = extent[3];

  function px(coord) {
    const x = ((coord[0] - minx) / (maxx - minx)) * width;
    const y = height - ((coord[1] - miny) / (maxy - miny)) * height;
    return [x, y];
  }

  function dibujarRing(coords) {
    if (!coords || coords.length === 0) return;
    ctx.beginPath();
    coords.forEach((c, i) => {
      const p = px(c);
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  const type = geom.getType();

  ctx.save();
  ctx.fillStyle = "rgba(21, 128, 61, 0.28)";
  ctx.strokeStyle = "#15803d";
  ctx.lineWidth = 6;

  if (type === "Polygon") {
    const rings = geom.getCoordinates();
    rings.forEach(r => dibujarRing(r));
  }

  if (type === "MultiPolygon") {
    const polys = geom.getCoordinates();
    polys.forEach(poly => poly.forEach(r => dibujarRing(r)));
  }

  ctx.restore();
}

async function generarCroquisWMSPDF() {
  try {
    const feature = obtenerFeatureSeleccionadaPDF();
    if (!feature || !feature.getGeometry()) return null;

    const width = 1100;
    const height = 620;

    const geom = feature.getGeometry();
    const extentOriginal = geom.getExtent();
    const bbox = expandirExtentPDF(extentOriginal, 3.0);

    const wmsUrl =
      "https://fcnarqnodo.hopto.org/geoserver/catastro_bc/wms?" +
      "SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap" +
      "&LAYERS=catastro_bc:predios_oficial" +
      "&STYLES=" +
      "&FORMAT=image/png" +
      "&TRANSPARENT=false" +
      "&SRS=EPSG:3857" +
      `&BBOX=${bbox.join(",")}` +
      `&WIDTH=${width}&HEIGHT=${height}`;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // Fondo institucional claro
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, width, height);

    const img = await cargarImagenPDF(wmsUrl);
    if (img) {
      try {
        ctx.drawImage(img, 0, 0, width, height);
      } catch (e) {
        console.warn("No se pudo dibujar WMS en croquis PDF:", e);
      }
    } else {
      ctx.fillStyle = "#e5e7eb";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#64748b";
      ctx.font = "bold 26px Arial";
      ctx.textAlign = "center";
      ctx.fillText("Croquis institucional WMS", width / 2, height / 2 - 14);
      ctx.font = "20px Arial";
      ctx.fillText("No se pudo cargar imagen WMS, se dibuja la geometría seleccionada.", width / 2, height / 2 + 22);
    }

    // Rejilla ligera
    ctx.save();
    ctx.strokeStyle = "rgba(100,116,139,0.22)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += 100) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y <= height; y += 100) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    ctx.restore();

    // Predio seleccionado
    dibujarGeometriaPDF(ctx, geom, bbox, width, height);

    // Etiqueta
    const clave = feature.get("clave_catastral") || obtenerClaveSeleccionadaPDF();
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.strokeStyle = "#15803d";
    ctx.lineWidth = 2;
    ctx.roundRect(width - 270, 24, 235, 54, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";
    ctx.fillText(clave, width - 152, 59);
    ctx.restore();

    // Norte
    ctx.save();
    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.arc(50, 50, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px Arial";
    ctx.textAlign = "center";
    ctx.fillText("N", 50, 60);
    ctx.restore();

    // Escala referencial
    ctx.save();
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(50, height - 45);
    ctx.lineTo(250, height - 45);
    ctx.stroke();
    ctx.fillStyle = "#111827";
    ctx.font = "18px Arial";
    ctx.fillText("Escala gráfica referencial", 50, height - 18);
    ctx.restore();

    return canvas.toDataURL("image/png");
  } catch (e) {
    console.warn("No se pudo generar croquis WMS PDF:", e);
    return null;
  }
}

async function generarPDFInstitucional() {
  if (!requerirPermiso("exportar_pdf", "No tienes permisos para generar PDF.")) return;

  const btn = document.getElementById("btnPdfInstitucional");
  const estado = document.getElementById("estadoPdfInstitucional");

  const setEstado = (txt, tipo = "") => {
    if (!estado) return;
    estado.innerText = txt;
    estado.className = "estado-pdf " + tipo;
  };

  try {
    const clave = obtenerClaveSeleccionadaPDF();

    if (!clave) {
      alert("Primero selecciona o busca un predio para generar el PDF.");
      return;
    }

    if (typeof window.jspdf === "undefined") {
      alert("No se cargó la librería jsPDF. Revisa conexión a internet o bloqueo de CDN.");
      setEstado("No se cargó jsPDF.", "error");
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerText = "⏳ Generando PDF...";
    }
    setEstado("Generando ficha institucional...", "procesando");

    let feature = null;
    try {
      const r = await fetch(`${API}/padron/${encodeURIComponent(clave)}/ficha?_=${Date.now()}`, { cache: "no-store" });
      if (r.ok) feature = await r.json();
    } catch (e) {
      console.warn("No se pudo cargar ficha para PDF:", e);
    }

    const p = feature?.properties || obtenerPropiedadesFichaPDF() || {};
    setEstado("Capturando mapa...", "procesando");
    let mapaImg = await obtenerImagenMapaPDF();
    if (!mapaImg) {
      setEstado("Google bloqueó captura; generando croquis WMS institucional...", "procesando");
      mapaImg = await generarCroquisWMSPDF();
    }

    setEstado("Generando QR...", "procesando");
    const qrImg = await generarQRPDF(clave);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "letter");

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    const guinda = [112, 51, 65];
    const grisTexto = [40, 48, 60];
    const grisClaro = [245, 247, 250];
    const rojo = [198, 40, 40];
    const verde = [21, 128, 61];

    // Header
    doc.setFillColor(...guinda);
    doc.rect(0, 0, pageW, 25, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("Sistema de Gestión Catastral", 14, 10);
    doc.setFontSize(10);
    doc.text("Ficha predial institucional · Catastro Mexicali", 14, 17);

    doc.setFontSize(9);
    const fecha = new Date().toLocaleString("es-MX");
    doc.text(`Fecha: ${fecha}`, pageW - 14, 10, { align: "right" });
    doc.text(`Clave: ${clave}`, pageW - 14, 17, { align: "right" });

    // Title block
    doc.setTextColor(...grisTexto);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(`Ficha predial: ${clave}`, 14, 36);

    const tieneAdeudo = Number(p.adeudo_total || 0) > 0;
    doc.setFillColor(...(tieneAdeudo ? rojo : verde));
    doc.roundedRect(pageW - 62, 29, 48, 10, 2, 2, "F");
    doc.setTextColor(255,255,255);
    doc.setFontSize(8);
    doc.text(tieneAdeudo ? "CON ADEUDO" : "SIN ADEUDO", pageW - 38, 35.5, { align: "center" });

    // Croquis
    doc.setDrawColor(220, 225, 232);
    doc.setFillColor(...grisClaro);
    doc.roundedRect(14, 43, pageW - 28, 78, 2, 2, "FD");

    if (mapaImg) {
      try {
        doc.addImage(mapaImg, "PNG", 16, 45, pageW - 32, 74);
      } catch (imgErr) {
        console.warn("No se pudo insertar la imagen del mapa en PDF:", imgErr);
        doc.setFontSize(10);
        doc.setTextColor(120, 120, 120);
        doc.text("Croquis no disponible; no se pudo capturar Google ni generar WMS.", pageW / 2, 80, { align: "center" });
        doc.text("El PDF se genera con la información predial institucional.", pageW / 2, 87, { align: "center" });
      }
    } else {
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 120);
      doc.text("Croquis no disponible; no se pudo capturar Google ni generar WMS.", pageW / 2, 80, { align: "center" });
      doc.text("El PDF se genera con la información predial institucional.", pageW / 2, 87, { align: "center" });
    }

    // Norte y escala visual simple
    doc.setTextColor(255, 255, 255);
    doc.setFillColor(0, 0, 0);
    doc.circle(pageW - 27, 54, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("N", pageW - 27, 57, { align: "center" });

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.7);
    doc.line(22, 113, 62, 113);
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    doc.text("Escala gráfica referencial", 22, 117);

    // Datos principales
    let y = 132;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...guinda);
    doc.text("Información del predio", 14, y);

    y += 6;

    function row(label, value, x1, x2, yy) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...guinda);
      doc.setFontSize(8);
      doc.text(label, x1, yy);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...grisTexto);
      doc.text(doc.splitTextToSize(textoPdf(value), x2 - x1 - 4), x1 + 35, yy);
    }

    doc.setDrawColor(230, 234, 240);
    doc.setFillColor(252, 252, 253);
    doc.roundedRect(14, y, pageW - 28, 58, 2, 2, "FD");

    row("Clave", p.clave_catastral || clave, 18, pageW/2, y + 9);
    row("Propietario", p.nombre_completo || p.propietario, 18, pageW - 18, y + 18);
    row("Delegación", p.delegacion, 18, pageW/2, y + 27);
    row("Colonia", p.colonia, pageW/2 + 2, pageW - 18, y + 27);
    row("Calle", p.calle, 18, pageW/2, y + 36);
    row("# Oficial", p.numof, pageW/2 + 2, pageW - 18, y + 36);
    row("Zona H.", p.zona_homogenea || p.zonah, 18, pageW/2, y + 45);
    row("Uso", p.descripcion_uso, pageW/2 + 2, pageW - 18, y + 45);

    y += 68;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...guinda);
    doc.text("Valores, superficies y estado fiscal", 14, y);

    y += 6;
    doc.setDrawColor(230, 234, 240);
    doc.setFillColor(252, 252, 253);
    doc.roundedRect(14, y, pageW - 28, 42, 2, 2, "FD");

    row("Valor 2026", formatoPdfMoneda(p.valor2026), 18, pageW/2, y + 10);
    row("Sup. doc.", `${textoPdf(p.sup_documental)} m²`, pageW/2 + 2, pageW - 18, y + 10);
    row("Sup. física", `${textoPdf(p.sup_fisica)} m²`, 18, pageW/2, y + 20);
    row("Sup. const.", `${textoPdf(p.sup_const)} m²`, pageW/2 + 2, pageW - 18, y + 20);
    row("Adeudo 2026", formatoPdfMoneda(p.adeudo_2026), 18, pageW/2, y + 30);
    row("Adeudo total", formatoPdfMoneda(p.adeudo_total), pageW/2 + 2, pageW - 18, y + 30);

    if (qrImg) {
      try {
        doc.addImage(qrImg, "PNG", pageW - 42, pageH - 42, 28, 28);
        doc.setFontSize(7);
        doc.setTextColor(80, 80, 80);
        doc.text("Consulta digital", pageW - 28, pageH - 10, { align: "center" });
      } catch(e) {
        console.warn("QR no insertado:", e);
      }
    }

    doc.setDrawColor(...guinda);
    doc.setLineWidth(0.5);
    doc.line(14, pageH - 18, pageW - 48, pageH - 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(90, 90, 90);
    doc.text("Documento generado automáticamente por el Sistema de Gestión Catastral. Información sujeta a validación institucional.", 14, pageH - 12);

    setEstado("PDF generado correctamente.", "ok");
    doc.save(`ficha_predial_${clave}.pdf`);

  } catch (e) {
    console.error("Error generando PDF:", e);
    alert("No se pudo generar el PDF. Abre la consola del navegador para ver el detalle.");
    setEstado("Error al generar PDF.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = "📄 Generar ficha PDF";
    }
  }
}

function exportarResultadosExcel() {
  if (!requerirPermiso("exportar_excel", "No tienes permisos para exportar a Excel.")) return;

  const datos = gridEstado.filtrados && gridEstado.filtrados.length
    ? gridEstado.filtrados
    : (gridEstado.todos || []);

  if (!datos.length) {
    alert("No hay resultados para exportar.");
    return;
  }

  if (typeof XLSX === "undefined") {
    alert("No se pudo cargar la librería de Excel. Revisa tu conexión a internet.");
    return;
  }

  const columnas = [
    { campo: "clave_catastral", titulo: "Clave catastral" },
    { campo: "nombre_completo", titulo: "Nombre / Razón social" },
    { campo: "delegacion", titulo: "Delegación" },
    { campo: "colonia", titulo: "Colonia" },
    { campo: "calle", titulo: "Calle" },
    { campo: "numof", titulo: "Número oficial" },
    { campo: "zona_homogenea", titulo: "Zona homogénea" },
    { campo: "valor2026", titulo: "Valor 2026" },
    { campo: "sup_documental", titulo: "Superficie documental" },
    { campo: "id_tasa", titulo: "ID tasa" },
    { campo: "porcentaje_tasa", titulo: "Porcentaje tasa" },
    { campo: "condominio", titulo: "Condominio" },
    { campo: "descripcion_uso", titulo: "Uso predial" },
    { campo: "dibujado", titulo: "Dibujado en cartografía" }
  ];

  const filas = datos.map(p => {
    const fila = {};
    columnas.forEach(col => {
      let valor = p[col.campo];

      if (col.campo === "dibujado") {
        valor = valor ? "DIBUJADO" : "SIN GEOMETRÍA";
      }

      if (valor === null || valor === undefined) {
        valor = "";
      }

      fila[col.titulo] = valor;
    });
    return fila;
  });

  const ws = XLSX.utils.json_to_sheet(filas);

  ws["!cols"] = columnas.map(col => ({
    wch: Math.max(14, col.titulo.length + 2)
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resultados");

  // Hoja de resumen para conservar el total real del backend
  const resumen = [{
    "Total encontrado": gridEstado.totalReal || datos.length,
    "Registros cargados/exportados": datos.length,
    "Nota": (gridEstado.totalReal && gridEstado.totalReal > datos.length)
      ? "El total real es mayor que los registros cargados en la tabla."
      : "Exportación completa de los registros cargados."
  }];
  const wsResumen = XLSX.utils.json_to_sheet(resumen);
  wsResumen["!cols"] = [{ wch: 20 }, { wch: 28 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

  const fecha = new Date();
  const yyyy = fecha.getFullYear();
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getDate()).padStart(2, "0");
  const hh = String(fecha.getHours()).padStart(2, "0");
  const mi = String(fecha.getMinutes()).padStart(2, "0");

  XLSX.writeFile(wb, `resultados_catastro_${yyyy}${mm}${dd}_${hh}${mi}.xlsx`);
}

// Alias para compatibilidad con botones anteriores
function exportarResultadosCSV() {
  exportarResultadosExcel();
}



/* --- v16: contador + búsqueda con fallback seguro --- */
function detectarTipoBusquedaActiva() {
  const clave = (document.getElementById("claveInput")?.value || "").trim();
  const nombre = (document.getElementById("nombreInput")?.value || "").trim();
  const calle = (document.getElementById("calleInput")?.value || "").trim();
  const numero = (document.getElementById("numeroInput")?.value || "").trim();
  const colonia = (document.getElementById("coloniaInput")?.value || "").trim();

  if (clave) return "clave";
  if (nombre) return "nombre";
  if (calle || numero || colonia) return "direccion";
  return "general";
}

function actualizarContadorBusqueda(total, tipo = null, cargados = null) {
  const totalNum = Number(total || 0);
  const cargadosNum = Number(cargados ?? totalNum);
  const tipoBusqueda = tipo || (typeof detectarTipoBusquedaActiva === "function" ? detectarTipoBusquedaActiva() : "general");

  let texto = totalNum === 1
    ? "1 predio encontrado"
    : `${totalNum.toLocaleString("es-MX")} predios encontrados`;

  if (totalNum > cargadosNum) {
    texto += ` · cargados ${cargadosNum.toLocaleString("es-MX")}`;
  }

  const general = document.getElementById("contadorBusquedaGeneral");
  if (general) {
    general.innerText = texto;
    general.classList.toggle("contador-ok", totalNum > 0);
    general.classList.toggle("contador-warn", totalNum === 0);
  }

  const ids = {
    clave: "contadorClave",
    nombre: "contadorNombre",
    direccion: "contadorDireccion"
  };

  Object.entries(ids).forEach(([tipoKey, id]) => {
    const el = document.getElementById(id);
    if (!el) return;

    if (tipoBusqueda === "general" || tipoKey === tipoBusqueda) {
      el.innerText = texto;
      el.classList.toggle("contador-ok", totalNum > 0);
      el.classList.toggle("contador-warn", totalNum === 0);
    } else {
      el.innerText = "Sin búsqueda realizada";
      el.classList.remove("contador-ok", "contador-warn");
    }
  });
}

function mostrarAvisoTotalResultados(total, cargados, limiteUsado = null) {
  const contenedorResultados = document.getElementById("resultadosBusqueda");
  if (!contenedorResultados) return;

  let aviso = document.getElementById("avisoTotalResultados");
  if (!aviso) {
    aviso = document.createElement("div");
    aviso.id = "avisoTotalResultados";
    aviso.className = "aviso-total-resultados";
    contenedorResultados.parentNode.insertBefore(aviso, contenedorResultados);
  }

  const totalNum = Number(total || 0);
  const cargadosNum = Number(cargados || 0);

  if (totalNum <= 0) {
    aviso.style.display = "none";
    aviso.innerHTML = "";
    return;
  }

  aviso.style.display = "block";
  let extra = limiteUsado ? ` · límite usado: <b>${Number(limiteUsado).toLocaleString("es-MX")}</b>` : "";

  if (totalNum > cargadosNum) {
    aviso.innerHTML = `Total encontrado: <b>${totalNum.toLocaleString("es-MX")}</b> · cargados en tabla: <b>${cargadosNum.toLocaleString("es-MX")}</b>${extra}.`;
  } else {
    aviso.innerHTML = `Total encontrado: <b>${totalNum.toLocaleString("es-MX")}</b>${extra}.`;
  }
}

function construirUrlBusqueda(clave, nombre, colonia, calle, numero, limite) {
  return `${API}/padron/busqueda-avanzada?` +
    `clave=${encodeURIComponent(clave)}` +
    `&nombre=${encodeURIComponent(nombre)}` +
    `&colonia=${encodeURIComponent(colonia)}` +
    `&calle=${encodeURIComponent(calle)}` +
    `&numero=${encodeURIComponent(numero)}` +
    `&limite=${limite}`;
}

async function pedirBusquedaAvanzada(clave, nombre, colonia, calle, numero, limite) {
  const url = construirUrlBusqueda(clave, nombre, colonia, calle, numero, limite);
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  data.__limite_usado = limite;
  return data;
}

async function buscarAvanzado() {
  const clave = document.getElementById("claveInput").value.trim();
  const nombre = document.getElementById("nombreInput").value.trim();
  const colonia = document.getElementById("coloniaInput").value.trim();
  const calle = document.getElementById("calleInput").value.trim();
  const numero = document.getElementById("numeroInput").value.trim();

  const tipoBusqueda = detectarTipoBusquedaActiva();

  try {
    let data = null;

    try {
      data = await pedirBusquedaAvanzada(clave, nombre, colonia, calle, numero, 5000);
    } catch (e5000) {
      console.warn("Búsqueda con límite 5000 falló; reintentando con 100.", e5000);
      data = await pedirBusquedaAvanzada(clave, nombre, colonia, calle, numero, 100);
    }

    let resultados = data.resultados || [];
    let total = Number(data.total ?? resultados.length ?? 0);

    // Si el backend respondió 0 con 5000, reintenta con 100 para evitar falso negativo.
    if (data.__limite_usado === 5000 && total === 0 && resultados.length === 0) {
      try {
        const data100 = await pedirBusquedaAvanzada(clave, nombre, colonia, calle, numero, 100);
        if ((data100.resultados || []).length > 0 || Number(data100.total || 0) > 0) {
          data = data100;
          resultados = data100.resultados || [];
          total = Number(data100.total ?? resultados.length ?? 0);
        }
      } catch (e100) {
        console.warn("Reintento con 100 también falló.", e100);
      }
    }

    actualizarContadorBusqueda(total, tipoBusqueda, resultados.length);
    mostrarAvisoTotalResultados(total, resultados.length, data.__limite_usado);

    const div = document.getElementById("resultadosBusqueda");
    div.innerHTML = "";

    if (!resultados || resultados.length === 0) {
      div.innerHTML = "<p>Sin resultados.</p>";
      renderizarTablaResultados([], total);
      return;
    }

    renderizarTablaResultados(resultados, total);
    await zoomAResultadosBusqueda(resultados);

    resultados.slice(0, 250).forEach(p => {
      const item = document.createElement("div");
      item.className = "resultado-item";
      item.innerHTML = `
        <b>${p.clave_catastral}</b><br>
        <strong>${p.nombre_completo || ""}</strong><br>
        <small>${p.colonia || ""}${p.calle ? " · " + p.calle : ""}${p.numof ? " #" + p.numof : ""}</small>
      `;

      item.onclick = async () => {
        document.getElementById("claveInput").value = p.clave_catastral;
        await cargarDesdeBusqueda(p);
      };

      div.appendChild(item);
    });

    if (resultados.length > 250) {
      const nota = document.createElement("div");
      nota.className = "aviso-total-resultados";
      nota.style.display = "block";
      nota.innerHTML = `Listado lateral limitado a <b>250</b> predios para mantener velocidad. Revisa todos los registros cargados en la tabla inferior.`;
      div.appendChild(nota);
    }

  } catch(e) {
    console.error("Error en búsqueda avanzada:", e);
    actualizarContadorBusqueda(0, tipoBusqueda, 0);
    mostrarAvisoTotalResultados(0, 0);
  }
}

function registrarEnterBusquedas() {
  ["claveInput", "nombreInput", "coloniaInput", "calleInput", "numeroInput"].forEach(function(id) {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener("keyup", function(e) {
        if (e.key === "Enter") buscarAvanzado();
      });
    }
  });
}

async function seleccionarPorClave(clave) {
  if (!clave) return;

  const fichaGeojsonResponse = await fetch(`${API}/expediente/${clave}?_=${Date.now()}`, {
    cache: "no-store"
  });

  if (!fichaGeojsonResponse.ok) {
    console.warn("No se pudo cargar expediente:", clave);
    return;
  }

  const featureGeojson = await fichaGeojsonResponse.json();
  const ficha = featureGeojson.properties || {};

  if (featureGeojson.geometry) {
    pintarGeoJSON(featureGeojson, true);
  }

  pintarFicha(ficha);
  document.getElementById("claveInput").value = clave;
}

map.on("click", async function(evt) {
  try {
    const view = map.getView();
    const resolution = view.getResolution();
    const projection = view.getProjection();

    // Primero intenta identificar exactamente el predio renderizado en el WMS.
    const wmsUrl = prediosWmsLayer.getSource().getFeatureInfoUrl(
      evt.coordinate,
      resolution,
      projection,
      {
        "INFO_FORMAT": "application/json",
        "FEATURE_COUNT": 10
      }
    );

    if (wmsUrl) {
      const rWms = await fetch(wmsUrl, { cache: "no-store" });

      if (rWms.ok) {
        const dataWms = await rWms.json();
        const features = dataWms.features || [];

        if (features.length > 0) {
          const props = features[0].properties || {};
          const clave =
            props.clave_catastral ||
            props.clavecatas ||
            props.CLAVE_CATASTRAL ||
            props.ClaveCatas ||
            props.clave;

          if (clave) {
            await seleccionarPorClave(String(clave).trim().toUpperCase());
            return;
          }
        }
      }
    }

    // Respaldo: si GetFeatureInfo no responde, usa el endpoint espacial.
    const lonlat = ol.proj.toLonLat(evt.coordinate);
    const lon = lonlat[0];
    const lat = lonlat[1];

    const res = await fetch(`${API}/predios/intersecta?lon=${lon}&lat=${lat}&_=${Date.now()}`, {
      cache: "no-store"
    });

    if (!res.ok) return;

    const featureGeojson = await res.json();
    const clave = featureGeojson.properties.clave_catastral;

    const ficha = await obtenerFichaPorClave(clave) || featureGeojson.properties;

    pintarGeoJSON(featureGeojson, true);
    pintarFicha(ficha);
    document.getElementById("claveInput").value = clave;

  } catch (err) {
    console.error("Error al seleccionar predio por click:", err);
  }
});

const popup = document.getElementById("popup");

map.on("pointermove", function(evt) {
  const feature = map.forEachFeatureAtPixel(evt.pixel, function(feature) {
    return feature;
  });

  if (feature) {
    const clave = feature.get("clave_catastral") || "";
    const superficie = feature.get("superficie") || feature.get("sup_documental") || "";
    const colonia = feature.get("colonia") || "";

    popup.innerHTML = `
      <b>${clave}</b><br>
      Colonia: ${colonia}<br>
      Sup: ${superficie} m²
    `;

    popup.style.left = evt.originalEvent.pageX + 12 + "px";
    popup.style.top = evt.originalEvent.pageY + 12 + "px";
    popup.style.display = "block";
    map.getTargetElement().style.cursor = "pointer";
  } else {
    popup.style.display = "none";
    map.getTargetElement().style.cursor = "";
  }
});



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




/* ============================================================
   v26 - Módulo Movimientos Catastrales
============================================================ */
let detallesMovimientoActual = [];

function usuarioPuedeMovimientos() {
  const rol = rolActualInstitucional ? rolActualInstitucional() : "";
  return ["admin", "supervisor", "catastro"].includes(rol);
}

function limpiarMensajeMovimiento() {
  const msg = document.getElementById("movMensaje");
  if (msg) {
    msg.textContent = "";
    msg.className = "admin-mensaje";
  }
}

function mensajeMovimiento(texto, ok = true) {
  const msg = document.getElementById("movMensaje");
  if (!msg) return;
  msg.textContent = texto;
  msg.className = ok ? "admin-mensaje ok" : "admin-mensaje error";
}

function agregarDetalleMovimiento() {
  limpiarMensajeMovimiento();

  const campo = document.getElementById("movCampo")?.value || "";
  const valorNuevo = document.getElementById("movValorNuevo")?.value?.trim() || "";

  if (!campo || !valorNuevo) {
    mensajeMovimiento("Indica campo y valor nuevo.", false);
    return;
  }

  detallesMovimientoActual.push({
    grupo: "PADRON",
    campo: campo,
    etiqueta: campo.replaceAll("_", " ").toUpperCase(),
    valor_anterior: "",
    valor_nuevo: valorNuevo,
    tipo_dato: "texto",
    requiere_validacion: true
  });

  document.getElementById("movValorNuevo").value = "";
  renderDetallesMovimiento();
}

function eliminarDetalleMovimiento(idx) {
  detallesMovimientoActual.splice(idx, 1);
  renderDetallesMovimiento();
}

function renderDetallesMovimiento() {
  const cont = document.getElementById("movDetallesLista");
  if (!cont) return;

  if (!detallesMovimientoActual.length) {
    cont.innerHTML = "Sin campos agregados.";
    return;
  }

  cont.innerHTML = detallesMovimientoActual.map((d, i) => `
    <div class="mov-detalle-item">
      <div>
        <b>${escapeHtml(d.etiqueta || d.campo)}</b>
        <small>${escapeHtml(d.valor_nuevo)}</small>
      </div>
      <button type="button" onclick="eliminarDetalleMovimiento(${i})">×</button>
    </div>
  `).join("");
}

async function crearMovimientoPadron() {
  if (!usuarioPuedeMovimientos()) {
    alert("No tienes permisos para crear movimientos catastrales.");
    return;
  }

  limpiarMensajeMovimiento();

  const tipo = document.getElementById("movTipo")?.value || "";
  const clave = document.getElementById("movClave")?.value?.trim().toUpperCase() || "";
  const claveNueva = document.getElementById("movClaveNueva")?.value?.trim().toUpperCase() || "";
  const motivo = document.getElementById("movMotivo")?.value?.trim() || "";
  const observaciones = document.getElementById("movObservaciones")?.value?.trim() || "";

  if (!tipo) {
    mensajeMovimiento("Selecciona tipo de movimiento.", false);
    return;
  }

  if (!clave && tipo !== "ALTA_CLAVE") {
    mensajeMovimiento("Indica clave catastral origen.", false);
    return;
  }

  const datosNuevos = {};
  detallesMovimientoActual.forEach(d => {
    datosNuevos[d.campo] = d.valor_nuevo;
  });

  if (claveNueva) datosNuevos.clave_catastral_nueva = claveNueva;

  const payload = {
    clave_catastral: clave || claveNueva,
    clave_catastral_anterior: clave || null,
    clave_catastral_nueva: claveNueva || null,
    tipo_movimiento: tipo,
    motivo,
    observaciones,
    datos_anteriores: {},
    datos_nuevos: datosNuevos,
    detalles: detallesMovimientoActual
  };

  try {
    const r = await fetch(`${API}/movimientos`, {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify(payload)
    });

    const data = await r.json();

    if (!r.ok) {
      throw new Error(data.detail || "No se pudo crear el movimiento.");
    }

    mensajeMovimiento(`Movimiento creado: ${data.movimiento.folio}`, true);

    detallesMovimientoActual = [];
    renderDetallesMovimiento();

    document.getElementById("movMotivo").value = "";
    document.getElementById("movObservaciones").value = "";
    document.getElementById("movClaveNueva").value = "";

    cargarMovimientosPadron();

  } catch (e) {
    mensajeMovimiento(e.message || "Error al crear movimiento.", false);
  }
}

async function cargarMovimientosPadron() {
  if (!usuarioPuedeMovimientos()) return;

  const cont = document.getElementById("movimientosTabla");
  if (!cont) return;

  const clave = document.getElementById("movFiltroClave")?.value?.trim() || "";
  const url = `${API}/movimientos?limite=100${clave ? `&clave=${encodeURIComponent(clave)}` : ""}`;

  cont.innerHTML = "Cargando movimientos...";

  try {
    const r = await fetch(url, {
      headers: authHeaders()
    });

    const data = await r.json();

    if (!r.ok) {
      throw new Error(data.detail || "No se pudieron cargar movimientos.");
    }

    if (!data.length) {
      cont.innerHTML = "Sin movimientos registrados.";
      return;
    }

    cont.innerHTML = `
      <table class="admin-table movimientos-table">
        <thead>
          <tr>
            <th>Folio</th>
            <th>Clave</th>
            <th>Tipo</th>
            <th>Estado</th>
            <th>Fecha</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(m => `
            <tr onclick="verMovimientoPadron(${m.id})">
              <td>${escapeHtml(m.folio || "")}</td>
              <td>${escapeHtml(m.clave_catastral || "")}</td>
              <td>${escapeHtml(m.tipo_movimiento || "")}</td>
              <td><span class="mov-estado ${String(m.estado || "").toLowerCase()}">${escapeHtml(m.estado || "")}</span></td>
              <td>${formatearFechaCorta(m.fecha_solicitud)}</td>
              <td>
                ${String(m.estado || "").toUpperCase() !== "APLICADO"
                  ? `<button type="button" class="btn-mini-aplicar" onclick="event.stopPropagation(); aplicarMovimientoPadron(${m.id})">Aplicar</button>`
                  : `<span class="badge-admin-activo">APLICADO</span>`}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch (e) {
    cont.innerHTML = `<div class="admin-mensaje error">${escapeHtml(e.message)}</div>`;
  }
}

async function verMovimientoPadron(id) {
  try {
    const r = await fetch(`${API}/movimientos/${id}`, {
      headers: authHeaders()
    });

    const m = await r.json();

    if (!r.ok) throw new Error(m.detail || "No se pudo abrir movimiento.");

    alert(
      `Movimiento: ${m.folio}\n` +
      `Clave: ${m.clave_catastral || ""}\n` +
      `Tipo: ${m.tipo_movimiento || ""}\n` +
      `Estado: ${m.estado || ""}\n` +
      `Campos modificados: ${(m.detalles || []).length}`
    );
  } catch (e) {
    alert(e.message);
  }
}

function formatearFechaCorta(f) {
  if (!f) return "";
  try {
    return new Date(f).toLocaleDateString("es-MX");
  } catch {
    return f;
  }
}




/* ============================================================
   v26c - Aplicar movimiento real al padrón
============================================================ */
async function aplicarMovimientoPadron(id) {
  if (!confirm("¿Aplicar este movimiento al padrón maestro? Esta acción modificará la base real.")) {
    return;
  }

  try {
    const r = await fetch(`${API}/movimientos/${id}/aplicar`, {
      method: "POST",
      headers: authHeaders()
    });

    const data = await r.json();

    if (!r.ok) {
      throw new Error(data.detail || "No se pudo aplicar el movimiento.");
    }

    alert(data.mensaje || "Movimiento aplicado correctamente.");
    await cargarMovimientosPadron();

    const clave = data?.actualizado?.clave_catastral;
    if (clave) {
      document.getElementById("claveInput").value = clave;
      await seleccionarPorClave(clave);
    }

  } catch (e) {
    alert(e.message || "Error al aplicar movimiento.");
  }
}



/* ============================================================
   v26g - FIX SEGURO SOLO PARA + AGREGAR CAMBIO
   No toca login ni autenticación.
============================================================ */
window.detallesMovimientoActual = window.detallesMovimientoActual || [];

function movimientoEscapeHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function movimientoEtiquetaCampo(campo) {
  const select = document.getElementById("movCampo");
  const opt = select?.options?.[select.selectedIndex];
  return (opt?.text || campo || "").trim();
}

function renderDetallesMovimiento() {
  const cont = document.getElementById("movDetallesLista");
  if (!cont) return;

  const detalles = window.detallesMovimientoActual || [];

  if (!detalles.length) {
    cont.innerHTML = `<div class="mov-empty">Sin campos agregados.</div>`;
    return;
  }

  cont.innerHTML = detalles.map((d, i) => `
    <div class="mov-item">
      <div class="mov-item-info">
        <b>${movimientoEscapeHtml(d.etiqueta || d.campo)}</b>
        <span>${movimientoEscapeHtml(d.valor_nuevo || "")}</span>
      </div>
      <button type="button" class="btn-del-mov" onclick="eliminarDetalleMovimiento(${i})">✕</button>
    </div>
  `).join("");
}

function eliminarDetalleMovimiento(i) {
  window.detallesMovimientoActual.splice(i, 1);
  renderDetallesMovimiento();
}

function agregarDetalleMovimiento() {
  const campoEl = document.getElementById("movCampo");
  const valorEl = document.getElementById("movValorNuevo");

  const campo = (campoEl?.value || "").trim();
  const valorNuevo = (valorEl?.value || "").trim();

  if (!campo) {
    alert("Selecciona el campo a modificar.");
    return;
  }

  if (!valorNuevo) {
    alert("Captura el valor nuevo.");
    return;
  }

  window.detallesMovimientoActual.push({
    grupo: "PADRON",
    campo: campo,
    etiqueta: movimientoEtiquetaCampo(campo),
    valor_anterior: "",
    valor_nuevo: valorNuevo,
    tipo_dato: "texto",
    requiere_validacion: true
  });

  valorEl.value = "";
  renderDetallesMovimiento();
}

async function crearMovimientoPadron() {
  const msg = document.getElementById("movMensaje");

  function setMovMsg(texto, ok = true) {
    if (!msg) return;
    msg.textContent = texto;
    msg.className = ok ? "admin-mensaje ok" : "admin-mensaje error";
  }

  const tipo = (document.getElementById("movTipo")?.value || "").trim().toUpperCase();
  const clave = (document.getElementById("movClave")?.value || "").trim().toUpperCase();
  const claveNueva = (document.getElementById("movClaveNueva")?.value || "").trim().toUpperCase();
  const motivo = (document.getElementById("movMotivo")?.value || "").trim();
  const observaciones = (document.getElementById("movObservaciones")?.value || "").trim();

  if (!tipo) {
    setMovMsg("Selecciona tipo de movimiento.", false);
    return;
  }

  if (!clave && tipo !== "ALTA_CLAVE") {
    setMovMsg("Captura la clave catastral origen.", false);
    return;
  }

  if (!window.detallesMovimientoActual.length) {
    setMovMsg("Primero agrega al menos un cambio.", false);
    return;
  }

  const datosNuevos = {};
  window.detallesMovimientoActual.forEach(d => {
    datosNuevos[d.campo] = d.valor_nuevo;
  });

  if (claveNueva) datosNuevos.clave_catastral_nueva = claveNueva;

  const payload = {
    clave_catastral: clave || claveNueva,
    clave_catastral_anterior: clave || null,
    clave_catastral_nueva: claveNueva || null,
    tipo_movimiento: tipo,
    motivo,
    observaciones,
    datos_anteriores: {},
    datos_nuevos: datosNuevos,
    detalles: window.detallesMovimientoActual
  };

  try {
    const headers = typeof authJsonHeaders === "function"
      ? authJsonHeaders()
      : {
          "Content-Type": "application/json",
          ...(typeof authHeaders === "function" ? authHeaders() : {})
        };

    const r = await fetch(`${API}/movimientos`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const data = await r.json();

    if (!r.ok) {
      throw new Error(data.detail || data.message || "No se pudo guardar el movimiento.");
    }

    const folio = data?.movimiento?.folio || data?.folio || "sin folio";
    setMovMsg(`Movimiento creado: ${folio}`, true);

    window.detallesMovimientoActual = [];
    renderDetallesMovimiento();

    const valorEl = document.getElementById("movValorNuevo");
    const motivoEl = document.getElementById("movMotivo");
    const obsEl = document.getElementById("movObservaciones");
    if (valorEl) valorEl.value = "";
    if (motivoEl) motivoEl.value = "";
    if (obsEl) obsEl.value = "";

    if (typeof cargarMovimientosPadron === "function") {
      await cargarMovimientosPadron();
    }

  } catch (e) {
    setMovMsg(e.message || "Error al guardar movimiento.", false);
  }
}

// Forzar que los botones usen estas funciones corregidas.
window.agregarDetalleMovimiento = agregarDetalleMovimiento;
window.eliminarDetalleMovimiento = eliminarDetalleMovimiento;
window.renderDetallesMovimiento = renderDetallesMovimiento;
window.crearMovimientoPadron = crearMovimientoPadron;

setTimeout(renderDetallesMovimiento, 500);




/* ============================================================
   v27 - Modal institucional Cambio de Nombre
============================================================ */
function obtenerClaveSeleccionadaActual() {
  const desdeMov = document.getElementById("movClave")?.value?.trim();
  const desdeBusqueda = document.getElementById("claveInput")?.value?.trim();
  const desdeFicha = window.predioSeleccionado?.clave_catastral || window.predioSeleccionado?.clave || "";
  return (desdeMov || desdeBusqueda || desdeFicha || "").toUpperCase();
}

function obtenerNombreSeleccionadoActual() {
  if (window.predioSeleccionado) {
    return (
      window.predioSeleccionado.nombre_completo ||
      window.predioSeleccionado.nombre ||
      window.predioSeleccionado.propietario ||
      ""
    );
  }

  const rowNombre = document.querySelector("#tablaResultados tbody tr td:nth-child(2)");
  if (rowNombre) return rowNombre.textContent.trim();

  const fichaNombre = document.querySelector("#fichaPredialNombre, .predio-nombre, [data-campo='nombre_completo']");
  if (fichaNombre) return fichaNombre.textContent.trim();

  return "";
}

function abrirModalCambioNombre() {
  const modal = document.getElementById("modalMovimientoNombre");
  if (!modal) {
    alert("No se encontró el modal de cambio de nombre.");
    return;
  }

  const clave = obtenerClaveSeleccionadaActual();
  const nombre = obtenerNombreSeleccionadoActual();

  const claveEl = document.getElementById("modalMovClave");
  const actualEl = document.getElementById("modalMovNombreActual");
  const nuevoEl = document.getElementById("modalMovNombreNuevo");
  const motivoEl = document.getElementById("modalMovMotivo");
  const obsEl = document.getElementById("modalMovObservaciones");
  const msgEl = document.getElementById("modalMovMensaje");

  if (claveEl) claveEl.value = clave;
  if (actualEl) actualEl.value = nombre;
  if (nuevoEl) nuevoEl.value = "";
  if (motivoEl) motivoEl.value = "ACTUALIZACION";
  if (obsEl) obsEl.value = "";
  if (msgEl) {
    msgEl.textContent = "";
    msgEl.className = "modal-mov-msg";
  }

  modal.classList.remove("oculto");

  setTimeout(() => nuevoEl?.focus(), 150);
}

function cerrarModalCambioNombre() {
  const modal = document.getElementById("modalMovimientoNombre");
  if (modal) modal.classList.add("oculto");
}

function modalMovimientoMensaje(texto, ok = true) {
  const msg = document.getElementById("modalMovMensaje");
  if (!msg) return;

  msg.textContent = texto;
  msg.className = ok ? "modal-mov-msg ok" : "modal-mov-msg error";
}

async function guardarCambioNombreModal() {
  const clave = document.getElementById("modalMovClave")?.value?.trim().toUpperCase() || "";
  const nombreActual = document.getElementById("modalMovNombreActual")?.value?.trim() || "";
  const nombreNuevo = document.getElementById("modalMovNombreNuevo")?.value?.trim() || "";
  const motivo = document.getElementById("modalMovMotivo")?.value?.trim() || "CAMBIO DE NOMBRE";
  const observaciones = document.getElementById("modalMovObservaciones")?.value?.trim() || "";

  if (!clave) {
    modalMovimientoMensaje("Indica la clave catastral.", false);
    return;
  }

  if (!nombreNuevo) {
    modalMovimientoMensaje("Captura el nombre nuevo.", false);
    return;
  }

  const payload = {
    clave_catastral: clave,
    clave_catastral_anterior: clave,
    clave_catastral_nueva: null,
    tipo_movimiento: "CAMBIO_NOMBRE",
    motivo,
    observaciones,
    datos_anteriores: {
      nombre_propietario: nombreActual
    },
    datos_nuevos: {
      nombre_propietario: nombreNuevo
    },
    detalles: [
      {
        grupo: "TITULARIDAD",
        campo: "nombre_propietario",
        etiqueta: "NOMBRE / TITULAR",
        valor_anterior: nombreActual,
        valor_nuevo: nombreNuevo,
        tipo_dato: "texto",
        requiere_validacion: true
      }
    ]
  };

  try {
    const headers = typeof authJsonHeaders === "function"
      ? authJsonHeaders()
      : {
          "Content-Type": "application/json",
          ...(typeof authHeaders === "function" ? authHeaders() : {})
        };

    const r = await fetch(`${API}/movimientos`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const data = await r.json();

    if (!r.ok) {
      throw new Error(data.detail || data.message || "No se pudo guardar la solicitud.");
    }

    const folio = data?.movimiento?.folio || data?.folio || "sin folio";
    modalMovimientoMensaje(`Solicitud creada correctamente: ${folio}`, true);

    if (typeof cargarMovimientosPadron === "function") {
      cargarMovimientosPadron();
    }

    setTimeout(() => cerrarModalCambioNombre(), 1200);

  } catch (e) {
    modalMovimientoMensaje(e.message || "Error al guardar solicitud.", false);
  }
}

document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") cerrarModalCambioNombre();
});


/* ============================================================
   v27b - Flujo modal obligatorio para Cambio de Nombre
============================================================ */
window.ultimoMovimientoCreado = null;

function cerrarModalSeguimientoMovimiento() {
  const modal = document.getElementById("modalSeguimientoMovimiento");
  if (modal) modal.classList.add("oculto");
}

function abrirModalSeguimientoMovimiento(movimiento) {
  if (!movimiento) return;

  window.ultimoMovimientoCreado = movimiento;

  const modal = document.getElementById("modalSeguimientoMovimiento");
  if (!modal) return;

  const folio = document.getElementById("segMovFolio");
  const clave = document.getElementById("segMovClave");
  const tipo = document.getElementById("segMovTipo");
  const estado = document.getElementById("segMovEstado");

  if (folio) folio.textContent = movimiento.folio || "---";
  if (clave) clave.textContent = movimiento.clave_catastral || movimiento.clave || "---";
  if (tipo) tipo.textContent = movimiento.tipo_movimiento || "CAMBIO_NOMBRE";
  if (estado) estado.textContent = movimiento.estado || "BORRADOR";

  modal.classList.remove("oculto");
}

function irHistorialMovimiento() {
  cerrarModalSeguimientoMovimiento();
  if (typeof cerrarModalCambioNombre === "function") cerrarModalCambioNombre();

  const tabMovBtn = [...document.querySelectorAll(".tab-btn")]
    .find(b => (b.textContent || "").toLowerCase().includes("movimientos"));

  if (typeof mostrarTab === "function") {
    mostrarTab("tabMovimientos", tabMovBtn || null);
  }

  const clave = window.ultimoMovimientoCreado?.clave_catastral;
  const filtro = document.getElementById("movFiltroClave");
  if (filtro && clave) filtro.value = clave;

  if (typeof cargarMovimientosPadron === "function") {
    cargarMovimientosPadron();
  }
}

function bindModalCambioNombreV27b() {
  const tipo = document.getElementById("movTipo");

  if (tipo && !tipo.dataset.v27bModalBind) {
    tipo.dataset.v27bModalBind = "1";
    tipo.addEventListener("change", function() {
      if (tipo.value === "CAMBIO_NOMBRE" && typeof abrirModalCambioNombre === "function") {
        abrirModalCambioNombre();
      }
    });
  }

  if (typeof window.crearMovimientoPadron === "function" && !window.crearMovimientoPadronOriginalV27b) {
    window.crearMovimientoPadronOriginalV27b = window.crearMovimientoPadron;

    window.crearMovimientoPadron = function() {
      const t = document.getElementById("movTipo")?.value || "";
      if (t === "CAMBIO_NOMBRE" && typeof abrirModalCambioNombre === "function") {
        abrirModalCambioNombre();
        return;
      }
      return window.crearMovimientoPadronOriginalV27b();
    };
  }
}

async function guardarCambioNombreModal() {
  const clave = document.getElementById("modalMovClave")?.value?.trim().toUpperCase() || "";
  const nombreActual = document.getElementById("modalMovNombreActual")?.value?.trim() || "";
  const nombreNuevo = document.getElementById("modalMovNombreNuevo")?.value?.trim() || "";
  const motivo = document.getElementById("modalMovMotivo")?.value?.trim() || "CAMBIO DE NOMBRE";
  const observaciones = document.getElementById("modalMovObservaciones")?.value?.trim() || "";

  if (!clave) {
    modalMovimientoMensaje("Indica la clave catastral.", false);
    return;
  }

  if (!nombreNuevo) {
    modalMovimientoMensaje("Captura el nombre nuevo.", false);
    return;
  }

  const payload = {
    clave_catastral: clave,
    clave_catastral_anterior: clave,
    clave_catastral_nueva: null,
    tipo_movimiento: "CAMBIO_NOMBRE",
    motivo,
    observaciones,
    datos_anteriores: {
      nombre_propietario: nombreActual
    },
    datos_nuevos: {
      nombre_propietario: nombreNuevo
    },
    detalles: [
      {
        grupo: "TITULARIDAD",
        campo: "nombre_propietario",
        etiqueta: "NOMBRE / TITULAR",
        valor_anterior: nombreActual,
        valor_nuevo: nombreNuevo,
        tipo_dato: "texto",
        requiere_validacion: true
      }
    ]
  };

  try {
    const headers = typeof authJsonHeaders === "function"
      ? authJsonHeaders()
      : {
          "Content-Type": "application/json",
          ...(typeof authHeaders === "function" ? authHeaders() : {})
        };

    const r = await fetch(`${API}/movimientos`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const data = await r.json();

    if (!r.ok) {
      throw new Error(data.detail || data.message || "No se pudo guardar la solicitud.");
    }

    const movimiento = data?.movimiento || {
      folio: data?.folio,
      clave_catastral: clave,
      tipo_movimiento: "CAMBIO_NOMBRE",
      estado: "BORRADOR"
    };

    modalMovimientoMensaje(`Solicitud creada correctamente: ${movimiento.folio || "sin folio"}`, true);

    if (typeof cargarMovimientosPadron === "function") {
      cargarMovimientosPadron();
    }

    setTimeout(() => {
      if (typeof cerrarModalCambioNombre === "function") cerrarModalCambioNombre();
      abrirModalSeguimientoMovimiento(movimiento);
    }, 800);

  } catch (e) {
    modalMovimientoMensaje(e.message || "Error al guardar solicitud.", false);
  }
}

window.guardarCambioNombreModal = guardarCambioNombreModal;
setTimeout(bindModalCambioNombreV27b, 600);
setTimeout(bindModalCambioNombreV27b, 1600);



/* ============================================================
   v27c - Persona Física / Moral en Cambio de Nombre
============================================================ */
function normalizarTextoPersona(valor) {
  return String(valor || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function cambiarTipoPersonaModal() {
  const tipo = document.getElementById("modalMovTipoPersona")?.value || "FISICA";
  const fisica = document.getElementById("bloquePersonaFisica");
  const moral = document.getElementById("bloquePersonaMoral");

  if (tipo === "MORAL") {
    fisica?.classList.add("oculto");
    moral?.classList.remove("oculto");
  } else {
    moral?.classList.add("oculto");
    fisica?.classList.remove("oculto");
  }

  generarNombreCompletoModal();
}

function generarNombreCompletoModal() {
  const tipo = document.getElementById("modalMovTipoPersona")?.value || "FISICA";
  const nombreNuevoEl = document.getElementById("modalMovNombreNuevo");

  let nombreCompleto = "";

  if (tipo === "MORAL") {
    const razon = normalizarTextoPersona(document.getElementById("modalMovRazonSocial")?.value);
    nombreCompleto = razon;
  } else {
    const primerApellido = normalizarTextoPersona(document.getElementById("modalMovPrimerApellido")?.value);
    const segundoApellido = normalizarTextoPersona(document.getElementById("modalMovSegundoApellido")?.value);
    const nombres = normalizarTextoPersona(document.getElementById("modalMovNombres")?.value);

    nombreCompleto = [primerApellido, segundoApellido, nombres]
      .filter(Boolean)
      .join(" ");
  }

  if (nombreNuevoEl) nombreNuevoEl.value = nombreCompleto;
  return nombreCompleto;
}

function bindPersonaModalInputs() {
  [
    "modalMovPrimerApellido",
    "modalMovSegundoApellido",
    "modalMovNombres",
    "modalMovRazonSocial"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.v27cBind) {
      el.dataset.v27cBind = "1";
      el.addEventListener("input", generarNombreCompletoModal);
      el.addEventListener("blur", () => {
        el.value = normalizarTextoPersona(el.value);
        generarNombreCompletoModal();
      });
    }
  });

  const rfc = document.getElementById("modalMovRFC");
  if (rfc && !rfc.dataset.v27cBind) {
    rfc.dataset.v27cBind = "1";
    rfc.addEventListener("blur", () => {
      rfc.value = normalizarTextoPersona(rfc.value);
    });
  }
}

// Reforzar apertura del modal para limpiar campos de persona.
if (typeof window.abrirModalCambioNombre === "function" && !window.abrirModalCambioNombreOriginalV27c) {
  window.abrirModalCambioNombreOriginalV27c = window.abrirModalCambioNombre;

  window.abrirModalCambioNombre = function() {
    window.abrirModalCambioNombreOriginalV27c();

    const tipo = document.getElementById("modalMovTipoPersona");
    if (tipo) tipo.value = "FISICA";

    [
      "modalMovPrimerApellido",
      "modalMovSegundoApellido",
      "modalMovNombres",
      "modalMovRazonSocial",
      "modalMovRFC",
      "modalMovNombreNuevo"
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

    cambiarTipoPersonaModal();
    bindPersonaModalInputs();

    setTimeout(() => {
      document.getElementById("modalMovPrimerApellido")?.focus();
    }, 150);
  };
}

async function guardarCambioNombreModal() {
  const clave = document.getElementById("modalMovClave")?.value?.trim().toUpperCase() || "";
  const nombreActual = document.getElementById("modalMovNombreActual")?.value?.trim() || "";
  const tipoPersona = document.getElementById("modalMovTipoPersona")?.value || "FISICA";
  const nombreNuevo = generarNombreCompletoModal();
  const rfc = normalizarTextoPersona(document.getElementById("modalMovRFC")?.value);
  const motivo = document.getElementById("modalMovMotivo")?.value?.trim() || "CAMBIO DE NOMBRE";
  const observaciones = document.getElementById("modalMovObservaciones")?.value?.trim() || "";

  const primerApellido = normalizarTextoPersona(document.getElementById("modalMovPrimerApellido")?.value);
  const segundoApellido = normalizarTextoPersona(document.getElementById("modalMovSegundoApellido")?.value);
  const nombres = normalizarTextoPersona(document.getElementById("modalMovNombres")?.value);
  const razonSocial = normalizarTextoPersona(document.getElementById("modalMovRazonSocial")?.value);

  if (!clave) {
    modalMovimientoMensaje("Indica la clave catastral.", false);
    return;
  }

  if (tipoPersona === "FISICA" && (!primerApellido || !nombres)) {
    modalMovimientoMensaje("Para persona física captura al menos primer apellido y nombre(s).", false);
    return;
  }

  if (tipoPersona === "MORAL" && !razonSocial) {
    modalMovimientoMensaje("Para persona moral captura la razón social.", false);
    return;
  }

  if (!nombreNuevo) {
    modalMovimientoMensaje("No se pudo generar el nombre completo.", false);
    return;
  }

  const datosPersona = tipoPersona === "MORAL"
    ? {
        tipo_persona: "MORAL",
        razon_social: razonSocial,
        rfc: rfc,
        nombre_propietario: nombreNuevo,
        nombre_completo: nombreNuevo
      }
    : {
        tipo_persona: "FISICA",
        primer_apellido: primerApellido,
        segundo_apellido: segundoApellido,
        nombres: nombres,
        rfc: rfc,
        nombre_propietario: nombreNuevo,
        nombre_completo: nombreNuevo
      };

  const payload = {
    clave_catastral: clave,
    clave_catastral_anterior: clave,
    clave_catastral_nueva: null,
    tipo_movimiento: "CAMBIO_NOMBRE",
    motivo,
    observaciones,
    datos_anteriores: {
      nombre_propietario: nombreActual
    },
    datos_nuevos: datosPersona,
    detalles: [
      {
        grupo: "TITULARIDAD",
        campo: "nombre_propietario",
        etiqueta: "NOMBRE / TITULAR",
        valor_anterior: nombreActual,
        valor_nuevo: nombreNuevo,
        tipo_dato: "texto",
        requiere_validacion: true
      },
      {
        grupo: "TITULARIDAD",
        campo: "tipo_persona",
        etiqueta: "TIPO DE PERSONA",
        valor_anterior: "",
        valor_nuevo: tipoPersona,
        tipo_dato: "texto",
        requiere_validacion: true
      },
      {
        grupo: "TITULARIDAD",
        campo: "rfc",
        etiqueta: "RFC",
        valor_anterior: "",
        valor_nuevo: rfc,
        tipo_dato: "texto",
        requiere_validacion: false
      }
    ]
  };

  try {
    const headers = typeof authJsonHeaders === "function"
      ? authJsonHeaders()
      : {
          "Content-Type": "application/json",
          ...(typeof authHeaders === "function" ? authHeaders() : {})
        };

    const r = await fetch(`${API}/movimientos`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const data = await r.json();

    if (!r.ok) {
      throw new Error(data.detail || data.message || "No se pudo guardar la solicitud.");
    }

    const movimiento = data?.movimiento || {
      folio: data?.folio,
      clave_catastral: clave,
      tipo_movimiento: "CAMBIO_NOMBRE",
      estado: "BORRADOR"
    };

    modalMovimientoMensaje(`Solicitud creada correctamente: ${movimiento.folio || "sin folio"}`, true);

    if (typeof cargarMovimientosPadron === "function") {
      cargarMovimientosPadron();
    }

    setTimeout(() => {
      if (typeof cerrarModalCambioNombre === "function") cerrarModalCambioNombre();
      if (typeof abrirModalSeguimientoMovimiento === "function") abrirModalSeguimientoMovimiento(movimiento);
    }, 800);

  } catch (e) {
    modalMovimientoMensaje(e.message || "Error al guardar solicitud.", false);
  }
}

window.guardarCambioNombreModal = guardarCambioNombreModal;
window.cambiarTipoPersonaModal = cambiarTipoPersonaModal;
window.generarNombreCompletoModal = generarNombreCompletoModal;

setTimeout(bindPersonaModalInputs, 600);
setTimeout(bindPersonaModalInputs, 1600);



/* ============================================================
   v27e - Mayúsculas seguras + Modal Aplicar
   No afecta campos del login.
============================================================ */
window.movimientoPendienteAplicar = null;

function upperSafe(valor) {
  return String(valor || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function convertirCampoOperativoMayusculas(el) {
  if (!el) return;
  if (el.closest("#loginOverlay") || el.closest("#loginModal") || el.closest(".login-card")) return;
  if (el.type === "password") return;

  const start = el.selectionStart;
  const end = el.selectionEnd;
  el.value = String(el.value || "").toUpperCase();

  try {
    el.setSelectionRange(start, end);
  } catch (e) {}
}

function activarMayusculasOperativas(scope = document) {
  const controles = scope.querySelectorAll(`
    #tabConsulta input[type="text"],
    #tabMovimientos input[type="text"],
    #tabMovimientos textarea,
    #modalMovimientoNombre input[type="text"],
    #modalMovimientoNombre textarea,
    #modalAplicarMovimiento textarea
  `);

  controles.forEach(el => {
    if (el.dataset.uppercaseOperativo === "1") return;
    el.dataset.uppercaseOperativo = "1";
    el.addEventListener("input", () => convertirCampoOperativoMayusculas(el));
    el.addEventListener("blur", () => convertirCampoOperativoMayusculas(el));
  });
}

function normalizarModalTitularidadAntesGuardar() {
  [
    "modalMovClave",
    "modalMovPrimerApellido",
    "modalMovSegundoApellido",
    "modalMovNombres",
    "modalMovRazonSocial",
    "modalMovNombreNuevo",
    "modalMovRFC",
    "modalMovMotivo",
    "modalMovObservaciones"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) convertirCampoOperativoMayusculas(el);
  });

  if (typeof generarNombreCompletoModal === "function") {
    generarNombreCompletoModal();
  }
}

// Refuerzo seguro al abrir modal de nombre.
if (typeof window.abrirModalCambioNombre === "function" && !window.abrirModalCambioNombreOriginalV27e) {
  window.abrirModalCambioNombreOriginalV27e = window.abrirModalCambioNombre;

  window.abrirModalCambioNombre = function() {
    window.abrirModalCambioNombreOriginalV27e();
    activarMayusculasOperativas(document.getElementById("modalMovimientoNombre") || document);
  };
}

// Refuerzo seguro al guardar cambio de nombre.
if (typeof window.guardarCambioNombreModal === "function" && !window.guardarCambioNombreModalOriginalV27e) {
  window.guardarCambioNombreModalOriginalV27e = window.guardarCambioNombreModal;

  window.guardarCambioNombreModal = async function() {
    normalizarModalTitularidadAntesGuardar();
    return window.guardarCambioNombreModalOriginalV27e();
  };
}

function cerrarModalAplicarMovimiento() {
  const modal = document.getElementById("modalAplicarMovimiento");
  if (modal) modal.classList.add("oculto");
}

function mensajeAplicarMovimiento(texto, ok = true) {
  const msg = document.getElementById("aplicarMovMensaje");
  if (!msg) return;
  msg.textContent = texto;
  msg.className = ok ? "modal-mov-msg ok" : "modal-mov-msg error";
}

function abrirModalAplicarMovimientoDesdeObjeto(movimiento) {
  window.movimientoPendienteAplicar = movimiento;

  const modal = document.getElementById("modalAplicarMovimiento");
  if (!modal) return;

  document.getElementById("aplicarMovFolio").textContent = movimiento?.folio || "---";
  document.getElementById("aplicarMovClave").textContent = movimiento?.clave_catastral || "---";
  document.getElementById("aplicarMovTipo").textContent = movimiento?.tipo_movimiento || "---";

  const obs = document.getElementById("aplicarMovObservaciones");
  const msg = document.getElementById("aplicarMovMensaje");

  if (obs) obs.value = "";
  if (msg) {
    msg.textContent = "";
    msg.className = "modal-mov-msg";
  }

  modal.classList.remove("oculto");
  activarMayusculasOperativas(modal);
}

async function abrirModalAplicarMovimiento(id) {
  try {
    const r = await fetch(`${API}/movimientos/${id}`, {
      headers: typeof authHeaders === "function" ? authHeaders() : {}
    });

    const data = await r.json();

    if (!r.ok) {
      throw new Error(data.detail || "No se pudo cargar el movimiento.");
    }

    abrirModalAplicarMovimientoDesdeObjeto(data);

  } catch (e) {
    alert(e.message || "Error al abrir movimiento.");
  }
}

async function confirmarAplicarMovimientoModal() {
  const mov = window.movimientoPendienteAplicar;

  if (!mov?.id) {
    mensajeAplicarMovimiento("No hay movimiento seleccionado.", false);
    return;
  }

  const obs = document.getElementById("aplicarMovObservaciones");
  if (obs) convertirCampoOperativoMayusculas(obs);

  try {
    const r = await fetch(`${API}/movimientos/${mov.id}/aplicar`, {
      method: "POST",
      headers: typeof authJsonHeaders === "function"
        ? authJsonHeaders()
        : {
            "Content-Type": "application/json",
            ...(typeof authHeaders === "function" ? authHeaders() : {})
          },
      body: JSON.stringify({
        observaciones: obs?.value || ""
      })
    });

    const data = await r.json();

    if (!r.ok) {
      throw new Error(data.detail || "No se pudo aplicar el movimiento.");
    }

    mensajeAplicarMovimiento(data.mensaje || "Movimiento aplicado correctamente.", true);

    if (typeof cargarMovimientosPadron === "function") {
      cargarMovimientosPadron();
    }

    const clave = data?.actualizado?.clave_catastral || mov.clave_catastral;

    setTimeout(() => {
      cerrarModalAplicarMovimiento();

      if (clave && document.getElementById("claveInput")) {
        document.getElementById("claveInput").value = clave;
      }

      if (clave && typeof buscarAvanzado === "function") {
        buscarAvanzado();
      }
    }, 1200);

  } catch (e) {
    mensajeAplicarMovimiento(e.message || "Error al aplicar movimiento.", false);
  }
}

// Reemplaza alert/confirm simple por modal institucional.
window.aplicarMovimientoPadron = function(id) {
  abrirModalAplicarMovimiento(id);
};

document.addEventListener("click", function(e) {
  const btn = e.target.closest("[data-aplicar-movimiento]");
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();

  const id = btn.getAttribute("data-aplicar-movimiento");
  if (id) abrirModalAplicarMovimiento(id);
});

// Activación segura de mayúsculas operativas.
document.addEventListener("DOMContentLoaded", () => activarMayusculasOperativas(document));
setTimeout(() => activarMayusculasOperativas(document), 800);
setTimeout(() => activarMayusculasOperativas(document), 1800);



/* ============================================================
   v27f - Aplicar titularidad completa desde modal
============================================================ */
async function confirmarAplicarMovimientoModal() {
  const mov = window.movimientoPendienteAplicar;

  if (!mov?.id) {
    mensajeAplicarMovimiento("No hay movimiento seleccionado.", false);
    return;
  }

  const obs = document.getElementById("aplicarMovObservaciones");
  if (obs && typeof convertirCampoOperativoMayusculas === "function") {
    convertirCampoOperativoMayusculas(obs);
  }

  const tipo = String(mov.tipo_movimiento || "").toUpperCase();
  const endpoint = ["CAMBIO_NOMBRE", "CAMBIO_TITULARIDAD"].includes(tipo)
    ? `${API}/movimientos/${mov.id}/aplicar-titularidad`
    : `${API}/movimientos/${mov.id}/aplicar`;

  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: typeof authJsonHeaders === "function"
        ? authJsonHeaders()
        : {
            "Content-Type": "application/json",
            ...(typeof authHeaders === "function" ? authHeaders() : {})
          },
      body: JSON.stringify({
        observaciones: obs?.value || ""
      })
    });

    const data = await r.json();

    if (!r.ok) {
      throw new Error(data.detail || "No se pudo aplicar el movimiento.");
    }

    mensajeAplicarMovimiento(data.mensaje || "Movimiento aplicado correctamente.", true);

    if (typeof cargarMovimientosPadron === "function") {
      cargarMovimientosPadron();
    }

    const clave = data?.actualizado?.clave_catastral || mov.clave_catastral;

    setTimeout(() => {
      cerrarModalAplicarMovimiento();

      if (clave && document.getElementById("claveInput")) {
        document.getElementById("claveInput").value = clave;
      }

      if (clave && typeof buscarAvanzado === "function") {
        buscarAvanzado();
      }
    }, 1200);

  } catch (e) {
    mensajeAplicarMovimiento(e.message || "Error al aplicar movimiento.", false);
  }
}

window.confirmarAplicarMovimientoModal = confirmarAplicarMovimientoModal;



/* ============================================================
   v27g - Aplicar titularidad/RFC flexible
============================================================ */
async function confirmarAplicarMovimientoModal() {
  const mov = window.movimientoPendienteAplicar;

  if (!mov?.id) {
    mensajeAplicarMovimiento("No hay movimiento seleccionado.", false);
    return;
  }

  const obs = document.getElementById("aplicarMovObservaciones");
  if (obs && typeof convertirCampoOperativoMayusculas === "function") {
    convertirCampoOperativoMayusculas(obs);
  }

  const tipo = String(mov.tipo_movimiento || "").toUpperCase();
  const endpoint = ["CAMBIO_NOMBRE", "CAMBIO_TITULARIDAD"].includes(tipo)
    ? `${API}/movimientos/${mov.id}/aplicar-titularidad-v27g`
    : `${API}/movimientos/${mov.id}/aplicar`;

  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: typeof authJsonHeaders === "function"
        ? authJsonHeaders()
        : {
            "Content-Type": "application/json",
            ...(typeof authHeaders === "function" ? authHeaders() : {})
          },
      body: JSON.stringify({
        observaciones: obs?.value || ""
      })
    });

    const data = await r.json();

    if (!r.ok) {
      throw new Error(data.detail || "No se pudo aplicar el movimiento.");
    }

    mensajeAplicarMovimiento(data.mensaje || "Movimiento aplicado correctamente.", true);

    if (typeof cargarMovimientosPadron === "function") {
      cargarMovimientosPadron();
    }

    const clave = data?.actualizado?.clave_catastral || mov.clave_catastral;

    setTimeout(() => {
      cerrarModalAplicarMovimiento();

      if (clave && document.getElementById("claveInput")) {
        document.getElementById("claveInput").value = clave;
      }

      if (clave && typeof buscarAvanzado === "function") {
        buscarAvanzado();
      }
    }, 1200);

  } catch (e) {
    mensajeAplicarMovimiento(e.message || "Error al aplicar movimiento.", false);
  }
}

window.confirmarAplicarMovimientoModal = confirmarAplicarMovimientoModal;



/* ============================================================
   v27h - Aplicar titularidad/RFC sin pp.id
============================================================ */
async function confirmarAplicarMovimientoModal() {
  const mov = window.movimientoPendienteAplicar;

  if (!mov?.id) {
    mensajeAplicarMovimiento("No hay movimiento seleccionado.", false);
    return;
  }

  const obs = document.getElementById("aplicarMovObservaciones");
  if (obs && typeof convertirCampoOperativoMayusculas === "function") {
    convertirCampoOperativoMayusculas(obs);
  }

  const tipo = String(mov.tipo_movimiento || "").toUpperCase();
  const endpoint = ["CAMBIO_NOMBRE", "CAMBIO_TITULARIDAD"].includes(tipo)
    ? `${API}/movimientos/${mov.id}/aplicar-titularidad-v27h`
    : `${API}/movimientos/${mov.id}/aplicar`;

  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: typeof authJsonHeaders === "function"
        ? authJsonHeaders()
        : {
            "Content-Type": "application/json",
            ...(typeof authHeaders === "function" ? authHeaders() : {})
          },
      body: JSON.stringify({
        observaciones: obs?.value || ""
      })
    });

    let data = null;
    const text = await r.text();
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text || "Respuesta no válida del servidor.");
    }

    if (!r.ok) {
      throw new Error(data.detail || "No se pudo aplicar el movimiento.");
    }

    mensajeAplicarMovimiento(data.mensaje || "Movimiento aplicado correctamente.", true);

    if (typeof cargarMovimientosPadron === "function") {
      cargarMovimientosPadron();
    }

    const clave = data?.actualizado?.clave_catastral || mov.clave_catastral;

    setTimeout(() => {
      cerrarModalAplicarMovimiento();

      if (clave && document.getElementById("claveInput")) {
        document.getElementById("claveInput").value = clave;
      }

      if (clave && typeof buscarAvanzado === "function") {
        buscarAvanzado();
      }
    }, 1200);

  } catch (e) {
    mensajeAplicarMovimiento(e.message || "Error al aplicar movimiento.", false);
  }
}

window.confirmarAplicarMovimientoModal = confirmarAplicarMovimientoModal;



/* ============================================================
   v27i - Aplicar titularidad/RFC actualizando ficha
============================================================ */
async function confirmarAplicarMovimientoModal() {
  const mov = window.movimientoPendienteAplicar;

  if (!mov?.id) {
    mensajeAplicarMovimiento("No hay movimiento seleccionado.", false);
    return;
  }

  const obs = document.getElementById("aplicarMovObservaciones");
  if (obs && typeof convertirCampoOperativoMayusculas === "function") {
    convertirCampoOperativoMayusculas(obs);
  }

  const tipo = String(mov.tipo_movimiento || "").toUpperCase();
  const endpoint = ["CAMBIO_NOMBRE", "CAMBIO_TITULARIDAD"].includes(tipo)
    ? `${API}/movimientos/${mov.id}/aplicar-titularidad-v27i`
    : `${API}/movimientos/${mov.id}/aplicar`;

  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: typeof authJsonHeaders === "function"
        ? authJsonHeaders()
        : {
            "Content-Type": "application/json",
            ...(typeof authHeaders === "function" ? authHeaders() : {})
          },
      body: JSON.stringify({
        observaciones: obs?.value || ""
      })
    });

    const text = await r.text();
    let data = null;

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text || "Respuesta no válida del servidor.");
    }

    if (!r.ok) {
      throw new Error(data.detail || "No se pudo aplicar el movimiento.");
    }

    mensajeAplicarMovimiento(data.mensaje || "Movimiento aplicado correctamente.", true);

    if (typeof cargarMovimientosPadron === "function") {
      cargarMovimientosPadron();
    }

    const clave = data?.actualizado?.clave_catastral || mov.clave_catastral;

    setTimeout(() => {
      cerrarModalAplicarMovimiento();

      if (clave && document.getElementById("claveInput")) {
        document.getElementById("claveInput").value = clave;
      }

      if (clave && typeof buscarAvanzado === "function") {
        buscarAvanzado();
      }

      if (clave && typeof abrirFichaPredioPorClave === "function") {
        abrirFichaPredioPorClave(clave);
      }
    }, 1200);

  } catch (e) {
    mensajeAplicarMovimiento(e.message || "Error al aplicar movimiento.", false);
  }
}

window.confirmarAplicarMovimientoModal = confirmarAplicarMovimientoModal;

