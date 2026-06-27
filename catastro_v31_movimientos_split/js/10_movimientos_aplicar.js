/* ============================================================
   v31 - Aplicación de movimientos al padrón
============================================================ */

window.movimientoPendienteAplicar = null;
window.__aplicandoMovimiento = false;

function cerrarModalAplicarMovimiento() {
  const modal = document.getElementById("modalAplicarMovimiento");
  if (modal) modal.classList.add("oculto");
}

function mensajeAplicarMovimiento(texto, ok = true) {
  const msg = document.getElementById("aplicarMovMensaje");
  if (!msg) {
    alert(texto);
    return;
  }
  msg.textContent = texto;
  msg.className = ok ? "modal-mov-msg ok" : "modal-mov-msg error";
}

function abrirModalAplicarMovimientoDesdeObjeto(movimiento) {
  window.movimientoPendienteAplicar = movimiento;

  const modal = document.getElementById("modalAplicarMovimiento");
  if (!modal) return;

  const folio = document.getElementById("aplicarMovFolio");
  const clave = document.getElementById("aplicarMovClave");
  const tipo = document.getElementById("aplicarMovTipo");
  const obs = document.getElementById("aplicarMovObservaciones");
  const msg = document.getElementById("aplicarMovMensaje");

  if (folio) folio.textContent = movimiento?.folio || "---";
  if (clave) clave.textContent = movimiento?.clave_catastral || "---";
  if (tipo) tipo.textContent = movimiento?.tipo_movimiento || "---";
  if (obs) obs.value = "";
  if (msg) {
    msg.textContent = "";
    msg.className = "modal-mov-msg";
  }

  modal.classList.remove("oculto");
  if (typeof activarMayusculasMovimientos === "function") activarMayusculasMovimientos(modal);
}

async function abrirModalAplicarMovimiento(id) {
  try {
    const r = await fetch(`${movApiBase()}/movimientos/${id}`, { headers: movAuthHeaders() });
    const data = await movLeerRespuesta(r);
    if (!r.ok) throw new Error(data.detail || data.message || "No se pudo cargar el movimiento.");
    abrirModalAplicarMovimientoDesdeObjeto(data);
  } catch (e) {
    alert(e.message || "Error al abrir movimiento.");
  }
}

function endpointAplicacionMovimiento(mov) {
  const tipo = String(mov?.tipo_movimiento || "").toUpperCase();
  if (["CAMBIO_NOMBRE", "CAMBIO_TITULARIDAD"].includes(tipo)) {
    return `${movApiBase()}/movimientos/${mov.id}/aplicar-titularidad-v27i`;
  }
  return `${movApiBase()}/movimientos/${mov.id}/aplicar`;
}

async function confirmarAplicarMovimientoModal() {
  const mov = window.movimientoPendienteAplicar;
  if (!mov?.id) {
    mensajeAplicarMovimiento("No hay movimiento seleccionado.", false);
    return;
  }
  if (window.__aplicandoMovimiento) return;
  window.__aplicandoMovimiento = true;

  try {
    const obs = document.getElementById("aplicarMovObservaciones");
    if (obs && typeof normalizarTextoMovimiento === "function") {
      obs.value = normalizarTextoMovimiento(obs.value);
    }

    mensajeAplicarMovimiento("Aplicando movimiento...", true);

    const r = await fetch(endpointAplicacionMovimiento(mov), {
      method: "POST",
      headers: movAuthJsonHeaders(),
      body: JSON.stringify({ observaciones: obs?.value || "" })
    });

    const data = await movLeerRespuesta(r);
    if (!r.ok) throw new Error(data.detail || data.message || "No se pudo aplicar el movimiento.");

    mensajeAplicarMovimiento(data.mensaje || "Movimiento aplicado correctamente.", true);

    const clave = data?.actualizado?.clave_catastral || data?.clave_catastral || mov.clave_catastral;

    if (typeof cargarMovimientosPadron === "function") await cargarMovimientosPadron(clave);

    setTimeout(async () => {
      cerrarModalAplicarMovimiento();

      if (clave && document.getElementById("claveInput")) {
        document.getElementById("claveInput").value = clave;
      }

      if (clave && typeof buscarAvanzado === "function") {
        await buscarAvanzado();
      }

      if (clave && typeof abrirFichaPredioPorClave === "function") {
        abrirFichaPredioPorClave(clave);
      } else if (clave && typeof seleccionarPorClave === "function") {
        seleccionarPorClave(clave);
      }
    }, 1000);

  } catch (e) {
    console.error("confirmarAplicarMovimientoModal:", e);
    mensajeAplicarMovimiento(e.message || "Error al aplicar movimiento.", false);
  } finally {
    setTimeout(() => { window.__aplicandoMovimiento = false; }, 1000);
  }
}

window.abrirModalAplicarMovimiento = abrirModalAplicarMovimiento;
window.abrirModalAplicarMovimientoDesdeObjeto = abrirModalAplicarMovimientoDesdeObjeto;
window.cerrarModalAplicarMovimiento = cerrarModalAplicarMovimiento;
window.mensajeAplicarMovimiento = mensajeAplicarMovimiento;
window.confirmarAplicarMovimientoModal = confirmarAplicarMovimientoModal;
window.aplicarMovimientoPadron = abrirModalAplicarMovimiento;
