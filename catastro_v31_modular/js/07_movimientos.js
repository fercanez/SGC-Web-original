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

