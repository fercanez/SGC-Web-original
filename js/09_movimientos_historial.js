/* ============================================================
   v31 - Historial y Seguimiento de Movimientos
============================================================ */

window.ultimoMovimientoCreado = window.ultimoMovimientoCreado || null;

function formatearFechaCorta(f) {
  if (!f) return "";
  try {
    return new Date(f).toLocaleDateString("es-MX");
  } catch {
    return f;
  }
}

function estadoMovimientoClase(estado) {
  return String(estado || "").toLowerCase().replaceAll(" ", "_");
}

async function cargarMovimientosPadron(claveForzada = null) {
  if (typeof usuarioPuedeMovimientos === "function" && !usuarioPuedeMovimientos()) return;

  const cont = document.getElementById("movimientosTabla");
  if (!cont) return;

  const filtro = document.getElementById("movFiltroClave");
  const clave = (claveForzada || filtro?.value || "").trim().toUpperCase();
  if (filtro && claveForzada) filtro.value = clave;

  const url = `${movApiBase()}/movimientos?limite=100${clave ? `&clave=${encodeURIComponent(clave)}` : ""}`;
  cont.innerHTML = "Cargando movimientos...";

  try {
    const r = await fetch(url, { headers: movAuthHeaders() });
    const data = await movLeerRespuesta(r);
    if (!r.ok) throw new Error(data.detail || data.message || "No se pudieron cargar movimientos.");

    const movimientos = Array.isArray(data) ? data : (data.movimientos || data.resultados || []);

    if (!movimientos.length) {
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
          ${movimientos.map(m => {
            const estado = String(m.estado || "").toUpperCase();
            const aplicado = estado === "APLICADO";
            return `
              <tr onclick="verMovimientoPadron(${Number(m.id || 0)})">
                <td>${movEscapeHtml(m.folio || "")}</td>
                <td>${movEscapeHtml(m.clave_catastral || "")}</td>
                <td>${movEscapeHtml(m.tipo_movimiento || "")}</td>
                <td><span class="mov-estado ${estadoMovimientoClase(estado)}">${movEscapeHtml(estado)}</span></td>
                <td>${movEscapeHtml(formatearFechaCorta(m.fecha_solicitud || m.fecha_creacion || m.fecha))}</td>
                <td>
                  ${aplicado
                    ? `<span class="badge-admin-activo">APLICADO</span>`
                    : `<button type="button" class="btn-mini-aplicar" onclick="event.stopPropagation(); abrirModalAplicarMovimiento(${Number(m.id || 0)})">Aplicar</button>`}
                </td>
              </tr>`;
          }).join("")}
        </tbody>
      </table>
    `;
  } catch (e) {
    console.error("cargarMovimientosPadron:", e);
    cont.innerHTML = `<div class="admin-mensaje error" style="display:block">${movEscapeHtml(e.message)}</div>`;
  }
}

async function verMovimientoPadron(id) {
  try {
    const r = await fetch(`${movApiBase()}/movimientos/${id}`, { headers: movAuthHeaders() });
    const data = await movLeerRespuesta(r);
    if (!r.ok) throw new Error(data.detail || data.message || "No se pudo abrir movimiento.");

    abrirModalSeguimientoMovimiento(data);
  } catch (e) {
    alert(e.message || "Error al abrir movimiento.");
  }
}

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
  if (tipo) tipo.textContent = movimiento.tipo_movimiento || "---";
  if (estado) estado.textContent = movimiento.estado || "CAPTURADO";

  modal.classList.remove("oculto");
}

function irHistorialMovimiento() {
  cerrarModalSeguimientoMovimiento();
  if (typeof cerrarModalCambioNombre === "function") cerrarModalCambioNombre();

  const tabMovBtn = [...document.querySelectorAll(".tab-btn")]
    .find(b => (b.textContent || "").toLowerCase().includes("movimientos"));

  if (typeof mostrarTab === "function") {
    mostrarTab("tabMovimientos", tabMovBtn || null);
  } else {
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
    document.getElementById("tabMovimientos")?.classList.add("active");
  }

  const clave = window.ultimoMovimientoCreado?.clave_catastral || window.ultimoMovimientoCreado?.clave || "";
  const filtro = document.getElementById("movFiltroClave");
  if (filtro && clave) filtro.value = clave;

  cargarMovimientosPadron(clave);
}

function bindHistorialMovimientos() {
  const filtro = document.getElementById("movFiltroClave");
  if (filtro && filtro.dataset.movHistBind !== "1") {
    filtro.dataset.movHistBind = "1";
    filtro.addEventListener("keydown", e => {
      if (e.key === "Enter") cargarMovimientosPadron();
    });
  }
}

window.formatearFechaCorta = formatearFechaCorta;
window.cargarMovimientosPadron = cargarMovimientosPadron;
window.verMovimientoPadron = verMovimientoPadron;
window.cerrarModalSeguimientoMovimiento = cerrarModalSeguimientoMovimiento;
window.abrirModalSeguimientoMovimiento = abrirModalSeguimientoMovimiento;
window.irHistorialMovimiento = irHistorialMovimiento;

window.addEventListener("DOMContentLoaded", bindHistorialMovimientos);
setTimeout(bindHistorialMovimientos, 800);
