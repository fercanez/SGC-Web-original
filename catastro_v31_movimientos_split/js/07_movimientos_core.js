/* ============================================================
   v31 - Movimientos Core
   Funciones generales: permisos, mensajes, detalle y alta simple.
============================================================ */

window.detallesMovimientoActual = window.detallesMovimientoActual || [];
window.__creandoMovimientoPadron = false;

function movApiBase() {
  if (typeof API !== "undefined") return API;
  return "https://fcnarqnodo.hopto.org/api/catastro";
}

function movEscapeHtml(valor) {
  if (typeof escapeHtml === "function") return escapeHtml(valor);
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function movAuthHeaders() {
  return typeof authHeaders === "function" ? authHeaders() : {};
}

function movAuthJsonHeaders() {
  return typeof authJsonHeaders === "function"
    ? authJsonHeaders()
    : { "Content-Type": "application/json", ...movAuthHeaders() };
}

async function movLeerRespuesta(r) {
  const txt = await r.text();
  if (!txt) return {};
  try {
    return JSON.parse(txt);
  } catch (e) {
    throw new Error(txt || "Respuesta no válida del servidor.");
  }
}

function usuarioPuedeMovimientos() {
  const rol = typeof rolActualInstitucional === "function" ? rolActualInstitucional() : "";
  return ["admin", "supervisor", "catastro"].includes(String(rol || "").toLowerCase());
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
        <b>${movEscapeHtml(d.etiqueta || d.campo)}</b>
        <span>${movEscapeHtml(d.valor_nuevo || "")}</span>
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
  limpiarMensajeMovimiento();

  const campoEl = document.getElementById("movCampo");
  const valorEl = document.getElementById("movValorNuevo");
  const campo = (campoEl?.value || "").trim();
  const valorNuevo = (valorEl?.value || "").trim().toUpperCase();

  if (!campo) {
    mensajeMovimiento("Selecciona el campo a modificar.", false);
    return;
  }

  if (!valorNuevo) {
    mensajeMovimiento("Captura el valor nuevo.", false);
    return;
  }

  window.detallesMovimientoActual.push({
    grupo: "PADRON",
    campo,
    etiqueta: movimientoEtiquetaCampo(campo),
    valor_anterior: "",
    valor_nuevo: valorNuevo,
    tipo_dato: "texto",
    requiere_validacion: true
  });

  if (valorEl) valorEl.value = "";
  renderDetallesMovimiento();
}

async function crearMovimientoPadron() {
  if (!usuarioPuedeMovimientos()) {
    alert("No tienes permisos para crear movimientos catastrales.");
    return;
  }

  const tipo = (document.getElementById("movTipo")?.value || "").trim().toUpperCase();

  if (["CAMBIO_NOMBRE", "CAMBIO_TITULARIDAD"].includes(tipo)) {
    if (typeof abrirModalCambioNombre === "function") abrirModalCambioNombre();
    return;
  }

  if (window.__creandoMovimientoPadron) return;
  window.__creandoMovimientoPadron = true;

  try {
    limpiarMensajeMovimiento();

    const clave = (document.getElementById("movClave")?.value || "").trim().toUpperCase();
    const claveNueva = (document.getElementById("movClaveNueva")?.value || "").trim().toUpperCase();
    const motivo = (document.getElementById("movMotivo")?.value || "").trim().toUpperCase();
    const observaciones = (document.getElementById("movObservaciones")?.value || "").trim().toUpperCase();

    if (!tipo) throw new Error("Selecciona tipo de movimiento.");
    if (!clave && tipo !== "ALTA_CLAVE") throw new Error("Captura la clave catastral origen.");
    if (!window.detallesMovimientoActual.length) throw new Error("Primero agrega al menos un cambio.");

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

    const r = await fetch(`${movApiBase()}/movimientos`, {
      method: "POST",
      headers: movAuthJsonHeaders(),
      body: JSON.stringify(payload)
    });

    const data = await movLeerRespuesta(r);
    if (!r.ok) throw new Error(data.detail || data.message || "No se pudo guardar el movimiento.");

    const mov = data.movimiento || data;
    mensajeMovimiento(`Movimiento creado: ${mov.folio || "sin folio"}`, true);

    window.detallesMovimientoActual = [];
    renderDetallesMovimiento();

    ["movValorNuevo", "movMotivo", "movObservaciones", "movClaveNueva"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

    if (typeof cargarMovimientosPadron === "function") await cargarMovimientosPadron(clave || claveNueva);
    if (typeof abrirModalSeguimientoMovimiento === "function") abrirModalSeguimientoMovimiento(mov);

  } catch (e) {
    mensajeMovimiento(e.message || "Error al guardar movimiento.", false);
  } finally {
    setTimeout(() => { window.__creandoMovimientoPadron = false; }, 700);
  }
}

function normalizarTextoMovimiento(valor) {
  return String(valor || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function activarMayusculasMovimientos(scope = document) {
  const controles = scope.querySelectorAll(`
    #tabMovimientos input[type="text"],
    #tabMovimientos textarea,
    #modalMovimientoNombre input[type="text"],
    #modalMovimientoNombre textarea,
    #modalAplicarMovimiento textarea
  `);

  controles.forEach(el => {
    if (el.dataset.movUpper === "1") return;
    el.dataset.movUpper = "1";
    const convertir = () => {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      el.value = String(el.value || "").toUpperCase();
      try { el.setSelectionRange(start, end); } catch (e) {}
    };
    el.addEventListener("input", convertir);
    el.addEventListener("blur", convertir);
  });
}

window.usuarioPuedeMovimientos = usuarioPuedeMovimientos;
window.limpiarMensajeMovimiento = limpiarMensajeMovimiento;
window.mensajeMovimiento = mensajeMovimiento;
window.agregarDetalleMovimiento = agregarDetalleMovimiento;
window.eliminarDetalleMovimiento = eliminarDetalleMovimiento;
window.renderDetallesMovimiento = renderDetallesMovimiento;
window.crearMovimientoPadron = crearMovimientoPadron;
window.normalizarTextoMovimiento = normalizarTextoMovimiento;
window.activarMayusculasMovimientos = activarMayusculasMovimientos;
window.movLeerRespuesta = movLeerRespuesta;
window.movApiBase = movApiBase;
window.movAuthHeaders = movAuthHeaders;
window.movAuthJsonHeaders = movAuthJsonHeaders;
window.movEscapeHtml = movEscapeHtml;

window.addEventListener("DOMContentLoaded", () => {
  renderDetallesMovimiento();
  activarMayusculasMovimientos(document);
});
setTimeout(() => activarMayusculasMovimientos(document), 800);
