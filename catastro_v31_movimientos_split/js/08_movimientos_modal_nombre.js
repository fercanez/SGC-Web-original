/* ============================================================
   v31 - Modal Cambio de Nombre / Titularidad
============================================================ */

window.__guardandoCambioNombreModal = false;

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

  const rowNombre = document.querySelector("#tablaResultadosContenido tbody tr.resultado-activo td:nth-child(2), #tablaResultadosContenido tbody tr td:nth-child(2)");
  if (rowNombre) return rowNombre.textContent.trim();

  const fichaNombre = document.querySelector("#fichaPredialNombre, .predio-nombre, [data-campo='nombre_completo']");
  if (fichaNombre) return fichaNombre.textContent.trim();

  return "";
}

function cerrarModalCambioNombre() {
  const modal = document.getElementById("modalMovimientoNombre");
  if (modal) modal.classList.add("oculto");
}

function modalMovimientoMensaje(texto, ok = true) {
  const msg = document.getElementById("modalMovMensaje");
  if (!msg) {
    alert(texto);
    return;
  }
  msg.textContent = texto;
  msg.className = ok ? "modal-mov-msg ok" : "modal-mov-msg error";
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
  const normalizar = typeof normalizarTextoMovimiento === "function"
    ? normalizarTextoMovimiento
    : (v) => String(v || "").trim().replace(/\s+/g, " ").toUpperCase();

  const tipo = document.getElementById("modalMovTipoPersona")?.value || "FISICA";
  const nombreNuevoEl = document.getElementById("modalMovNombreNuevo");

  let nombreCompleto = "";
  if (tipo === "MORAL") {
    nombreCompleto = normalizar(document.getElementById("modalMovRazonSocial")?.value);
  } else {
    const primerApellido = normalizar(document.getElementById("modalMovPrimerApellido")?.value);
    const segundoApellido = normalizar(document.getElementById("modalMovSegundoApellido")?.value);
    const nombres = normalizar(document.getElementById("modalMovNombres")?.value);
    nombreCompleto = [primerApellido, segundoApellido, nombres].filter(Boolean).join(" ");
  }

  if (nombreNuevoEl) nombreNuevoEl.value = nombreCompleto;
  return nombreCompleto;
}

function limpiarCamposPersonaModal() {
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
}

function bindPersonaModalInputs() {
  ["modalMovPrimerApellido", "modalMovSegundoApellido", "modalMovNombres", "modalMovRazonSocial"].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.dataset.movPersonaBind !== "1") {
      el.dataset.movPersonaBind = "1";
      el.addEventListener("input", generarNombreCompletoModal);
      el.addEventListener("blur", () => {
        if (typeof normalizarTextoMovimiento === "function") el.value = normalizarTextoMovimiento(el.value);
        generarNombreCompletoModal();
      });
    }
  });

  const rfc = document.getElementById("modalMovRFC");
  if (rfc && rfc.dataset.movPersonaBind !== "1") {
    rfc.dataset.movPersonaBind = "1";
    rfc.addEventListener("blur", () => {
      if (typeof normalizarTextoMovimiento === "function") rfc.value = normalizarTextoMovimiento(rfc.value);
    });
  }
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
  const motivoEl = document.getElementById("modalMovMotivo");
  const obsEl = document.getElementById("modalMovObservaciones");
  const msgEl = document.getElementById("modalMovMensaje");
  const tipoPersona = document.getElementById("modalMovTipoPersona");

  if (claveEl) claveEl.value = clave;
  if (actualEl) actualEl.value = nombre;
  if (tipoPersona) tipoPersona.value = "FISICA";
  if (motivoEl) motivoEl.value = "ACTUALIZACION";
  if (obsEl) obsEl.value = "";
  if (msgEl) {
    msgEl.textContent = "";
    msgEl.className = "modal-mov-msg";
  }

  limpiarCamposPersonaModal();
  cambiarTipoPersonaModal();
  bindPersonaModalInputs();
  if (typeof activarMayusculasMovimientos === "function") activarMayusculasMovimientos(modal);

  modal.classList.remove("oculto");
  setTimeout(() => document.getElementById("modalMovPrimerApellido")?.focus(), 120);
}

async function guardarCambioNombreModal() {
  if (window.__guardandoCambioNombreModal) return;
  window.__guardandoCambioNombreModal = true;

  try {
    const normalizar = typeof normalizarTextoMovimiento === "function"
      ? normalizarTextoMovimiento
      : (v) => String(v || "").trim().replace(/\s+/g, " ").toUpperCase();

    const clave = normalizar(document.getElementById("modalMovClave")?.value);
    const nombreActual = normalizar(document.getElementById("modalMovNombreActual")?.value);
    const tipoPersona = document.getElementById("modalMovTipoPersona")?.value || "FISICA";
    const nombreNuevo = generarNombreCompletoModal();
    const rfc = normalizar(document.getElementById("modalMovRFC")?.value);
    const motivo = normalizar(document.getElementById("modalMovMotivo")?.value) || "ACTUALIZACION";
    const observaciones = normalizar(document.getElementById("modalMovObservaciones")?.value);

    const primerApellido = normalizar(document.getElementById("modalMovPrimerApellido")?.value);
    const segundoApellido = normalizar(document.getElementById("modalMovSegundoApellido")?.value);
    const nombres = normalizar(document.getElementById("modalMovNombres")?.value);
    const razonSocial = normalizar(document.getElementById("modalMovRazonSocial")?.value);

    if (!clave) throw new Error("Indica la clave catastral.");
    if (tipoPersona === "FISICA" && (!primerApellido || !nombres)) {
      throw new Error("Para persona física captura al menos primer apellido y nombre(s).");
    }
    if (tipoPersona === "MORAL" && !razonSocial) {
      throw new Error("Para persona moral captura la razón social.");
    }
    if (!nombreNuevo) throw new Error("No se pudo generar el nombre completo.");

    const datosPersona = tipoPersona === "MORAL"
      ? {
          tipo_persona: "MORAL",
          razon_social: razonSocial,
          rfc,
          nombre_propietario: nombreNuevo,
          nombre_completo: nombreNuevo
        }
      : {
          tipo_persona: "FISICA",
          primer_apellido: primerApellido,
          segundo_apellido: segundoApellido,
          nombres,
          rfc,
          nombre_propietario: nombreNuevo,
          nombre_completo: nombreNuevo
        };

    const tipoMovimientoPanel = (document.getElementById("movTipo")?.value || "CAMBIO_NOMBRE").toUpperCase();
    const tipoMovimiento = ["CAMBIO_TITULARIDAD", "CAMBIO_NOMBRE"].includes(tipoMovimientoPanel)
      ? tipoMovimientoPanel
      : "CAMBIO_NOMBRE";

    const payload = {
      clave_catastral: clave,
      clave_catastral_anterior: clave,
      clave_catastral_nueva: null,
      tipo_movimiento: tipoMovimiento,
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

    modalMovimientoMensaje("Guardando solicitud...", true);

    const r = await fetch(`${movApiBase()}/movimientos`, {
      method: "POST",
      headers: movAuthJsonHeaders(),
      body: JSON.stringify(payload)
    });

    const data = await movLeerRespuesta(r);
    if (!r.ok) throw new Error(data.detail || data.message || "No se pudo guardar la solicitud.");

    const movimiento = data.movimiento || {
      id: data.id,
      folio: data.folio,
      clave_catastral: clave,
      tipo_movimiento: tipoMovimiento,
      estado: data.estado || "CAPTURADO"
    };

    window.ultimoMovimientoCreado = movimiento;
    modalMovimientoMensaje(`Solicitud creada correctamente: ${movimiento.folio || "sin folio"}`, true);

    if (typeof cargarMovimientosPadron === "function") await cargarMovimientosPadron(clave);

    setTimeout(() => {
      cerrarModalCambioNombre();
      if (typeof abrirModalSeguimientoMovimiento === "function") abrirModalSeguimientoMovimiento(movimiento);
    }, 700);

  } catch (e) {
    console.error("guardarCambioNombreModal:", e);
    modalMovimientoMensaje(e.message || "Error al guardar solicitud.", false);
  } finally {
    setTimeout(() => { window.__guardandoCambioNombreModal = false; }, 1000);
  }
}

function bindModalCambioNombre() {
  const tipo = document.getElementById("movTipo");
  if (tipo && tipo.dataset.movModalBind !== "1") {
    tipo.dataset.movModalBind = "1";
    tipo.addEventListener("change", function() {
      const t = String(tipo.value || "").toUpperCase();
      if (["CAMBIO_NOMBRE", "CAMBIO_TITULARIDAD"].includes(t)) abrirModalCambioNombre();
    });
  }
  bindPersonaModalInputs();
}

window.obtenerClaveSeleccionadaActual = obtenerClaveSeleccionadaActual;
window.obtenerNombreSeleccionadoActual = obtenerNombreSeleccionadoActual;
window.abrirModalCambioNombre = abrirModalCambioNombre;
window.cerrarModalCambioNombre = cerrarModalCambioNombre;
window.modalMovimientoMensaje = modalMovimientoMensaje;
window.cambiarTipoPersonaModal = cambiarTipoPersonaModal;
window.generarNombreCompletoModal = generarNombreCompletoModal;
window.guardarCambioNombreModal = guardarCambioNombreModal;

window.addEventListener("DOMContentLoaded", bindModalCambioNombre);
setTimeout(bindModalCambioNombre, 800);
