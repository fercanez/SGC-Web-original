/* ============================================================
   v31.1 - Gestión visual de propietarios y copropietarios
   Depende de: 07_movimientos_core.js para movApiBase/movAuthHeaders/movLeerRespuesta/movEscapeHtml
============================================================ */

window.__propietariosClaveActual = "";
window.__propietarioSeleccionadoCatalogo = null;

function propApiBase() {
  if (typeof movApiBase === "function") return movApiBase();
  if (typeof API !== "undefined") return API;
  return "https://fcnarqnodo.hopto.org/api/catastro";
}

function propAuthHeaders(json = false) {
  const base = typeof authHeaders === "function" ? authHeaders() : {};
  return json ? { "Content-Type": "application/json", ...base } : base;
}

async function propLeerRespuesta(r) {
  if (typeof movLeerRespuesta === "function") return await movLeerRespuesta(r);
  const txt = await r.text();
  if (!txt) return {};
  try { return JSON.parse(txt); } catch { throw new Error(txt || "Respuesta no válida del servidor."); }
}

function propEscape(v) {
  if (typeof movEscapeHtml === "function") return movEscapeHtml(v);
  return String(v ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
}

function propNormalizar(v) {
  if (typeof normalizarTextoMovimiento === "function") return normalizarTextoMovimiento(v);
  return String(v || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function propMensaje(txt, ok = true) {
  const el = document.getElementById("propietariosMensaje");
  if (!el) { alert(txt); return; }
  el.textContent = txt;
  el.className = ok ? "modal-mov-msg ok" : "modal-mov-msg error";
}

function obtenerClaveParaPropietarios() {
  const fichaClave = document.getElementById("fichaFlotanteClave")?.textContent?.trim();
  const movClave = document.getElementById("movFiltroClave")?.value?.trim() || document.getElementById("movClave")?.value?.trim();
  const inputClave = document.getElementById("claveInput")?.value?.trim();
  const seleccionado = window.predioSeleccionado?.clave_catastral || window.predioSeleccionado?.clave || "";
  const clave = (seleccionado || fichaClave || movClave || inputClave || "").replace("Sin selección", "").trim().toUpperCase();
  return clave;
}

function inyectarBotonGestionPropietarios() {
  const body = document.getElementById("fichaFlotanteBody");
  if (!body || body.querySelector("#btnGestionarPropietariosFicha")) return;
  const clave = obtenerClaveParaPropietarios();
  if (!clave) return;

  const btn = document.createElement("button");
  btn.id = "btnGestionarPropietariosFicha";
  btn.type = "button";
  btn.className = "btn-gestionar-propietarios";
  btn.textContent = "👥 Gestionar propietarios / copropietarios";
  btn.onclick = () => abrirModalPropietariosPredio(clave);

  const panelActivo = body.querySelector(".ficha-tab-panel.active") || body;
  panelActivo.appendChild(btn);
}

function iniciarObserverPropietariosFicha() {
  const body = document.getElementById("fichaFlotanteBody");
  if (!body || body.dataset.propObserver === "1") return;
  body.dataset.propObserver = "1";
  const obs = new MutationObserver(() => setTimeout(inyectarBotonGestionPropietarios, 120));
  obs.observe(body, { childList: true, subtree: true });
  setTimeout(inyectarBotonGestionPropietarios, 300);
}

async function abrirModalPropietariosPredio(clave = null) {
  const modal = document.getElementById("modalPropietariosPredio");
  if (!modal) { alert("No se encontró el modal de propietarios."); return; }
  window.__propietariosClaveActual = propNormalizar(clave || obtenerClaveParaPropietarios());
  if (!window.__propietariosClaveActual) { alert("Selecciona un predio primero."); return; }

  document.getElementById("propModalClave").textContent = window.__propietariosClaveActual;
  document.getElementById("propietariosMensaje").className = "modal-mov-msg";
  document.getElementById("propietariosMensaje").textContent = "";
  modal.classList.remove("oculto");
  await cargarPropietariosPredioGestion();
}

function cerrarModalPropietariosPredio() {
  document.getElementById("modalPropietariosPredio")?.classList.add("oculto");
}

async function cargarPropietariosPredioGestion() {
  const clave = window.__propietariosClaveActual;
  const cont = document.getElementById("propietariosActualesLista");
  const totalBox = document.getElementById("propietariosTotalBox");
  if (!cont || !clave) return;
  cont.innerHTML = "Cargando titulares...";

  try {
    const r = await fetch(`${propApiBase()}/predios/${encodeURIComponent(clave)}/propietarios`, {
      headers: propAuthHeaders()
    });
    const data = await propLeerRespuesta(r);
    if (!r.ok) throw new Error(data.detail || data.message || "No se pudieron cargar propietarios.");

    const lista = data.propietarios || data.resultados || [];
    if (!lista.length) {
      cont.innerHTML = "Sin propietarios registrados.";
    } else {
      cont.innerHTML = lista.map(p => {
        const pct = Number(p.porcentaje_propiedad ?? p.porcentaje ?? 0);
        const nombre = p.nombre_completo || p.nombre || p.razon_social || "SIN NOMBRE";
        const tipo = p.tipo_titularidad || (pct >= 100 ? "PROPIETARIO" : "COPROPIETARIO");
        return `
          <div class="prop-item">
            <div>
              <b>${propEscape(nombre)}</b>
              <small>${propEscape(tipo)} — RFC: ${propEscape(p.rfc || "Sin dato")}</small>
            </div>
            <input type="number" min="0" max="100" step="0.01" value="${pct}" disabled title="Porcentaje actual">
            <button type="button" onclick="desactivarPropietarioPredio(${Number(p.id_persona)}, '${propEscape(nombre)}')">Quitar</button>
          </div>`;
      }).join("");
    }

    const suma = Number(data.suma_porcentaje ?? lista.reduce((a, p) => a + Number(p.porcentaje_propiedad || 0), 0));
    const valido = Math.abs(suma - 100) < 0.001;
    if (totalBox) {
      totalBox.textContent = `Total: ${suma.toFixed(2).replace(/\.00$/, "")}% ${valido ? "✓" : "— debe sumar 100%"}`;
      totalBox.className = valido ? "prop-total ok" : "prop-total error";
    }
  } catch (e) {
    console.error("cargarPropietariosPredioGestion:", e);
    cont.innerHTML = `<div class="admin-mensaje error" style="display:block">${propEscape(e.message)}</div>`;
  }
}

async function buscarPropietariosCatalogo() {
  const q = propNormalizar(document.getElementById("propBuscarTexto")?.value);
  const cont = document.getElementById("propResultadosCatalogo");
  if (!cont) return;
  if (!q) { cont.innerHTML = "Captura un texto para buscar."; return; }
  cont.innerHTML = "Buscando...";

  try {
    const r = await fetch(`${propApiBase()}/propietarios/buscar?q=${encodeURIComponent(q)}`, {
      headers: propAuthHeaders()
    });
    const data = await propLeerRespuesta(r);
    if (!r.ok) throw new Error(data.detail || data.message || "No se pudo buscar en catálogo.");

    const lista = Array.isArray(data) ? data : (data.propietarios || data.resultados || []);
    if (!lista.length) {
      cont.innerHTML = "Sin resultados.";
      return;
    }

    cont.innerHTML = lista.map(p => {
      const id = Number(p.id_persona || p.id || 0);
      const nombre = p.nombre_completo || p.nombre || p.razon_social || "SIN NOMBRE";
      return `
        <div class="prop-item">
          <div>
            <b>${propEscape(nombre)}</b>
            <small>${propEscape(p.tipo_persona || "")} — RFC: ${propEscape(p.rfc || "Sin dato")}</small>
          </div>
          <input type="number" min="0" max="100" step="0.01" value="50" id="propPct_${id}">
          <button type="button" onclick="agregarPropietarioAPredio(${id})">Agregar</button>
        </div>`;
    }).join("");
  } catch (e) {
    console.error("buscarPropietariosCatalogo:", e);
    cont.innerHTML = `<div class="admin-mensaje error" style="display:block">${propEscape(e.message)}</div>`;
  }
}

async function agregarPropietarioAPredio(idPersona) {
  const clave = window.__propietariosClaveActual;
  const pct = Number(document.getElementById(`propPct_${idPersona}`)?.value || 0);
  if (!clave || !idPersona) return;
  if (!(pct > 0 && pct <= 100)) { propMensaje("El porcentaje debe ser mayor a 0 y máximo 100.", false); return; }

  try {
    const r = await fetch(`${propApiBase()}/predios/${encodeURIComponent(clave)}/propietarios`, {
      method: "POST",
      headers: propAuthHeaders(true),
      body: JSON.stringify({
        id_persona: idPersona,
        porcentaje_propiedad: pct,
        tipo_titularidad: pct >= 100 ? "PROPIETARIO" : "COPROPIETARIO",
        vigente: true
      })
    });
    const data = await propLeerRespuesta(r);
    if (!r.ok) throw new Error(data.detail || data.message || "No se pudo agregar propietario.");
    propMensaje("Propietario agregado correctamente.", true);
    await cargarPropietariosPredioGestion();
    await refrescarFichaDespuesPropietarios(clave);
  } catch (e) {
    console.error("agregarPropietarioAPredio:", e);
    propMensaje(e.message, false);
  }
}

async function crearPropietarioCatalogo() {
  const tipo = document.getElementById("propNuevoTipo")?.value || "FISICA";
  const paterno = propNormalizar(document.getElementById("propNuevoPaterno")?.value);
  const materno = propNormalizar(document.getElementById("propNuevoMaterno")?.value);
  const nombre = propNormalizar(document.getElementById("propNuevoNombre")?.value);
  const rfc = propNormalizar(document.getElementById("propNuevoRfc")?.value);
  const curp = propNormalizar(document.getElementById("propNuevoCurp")?.value);

  if (!nombre) { propMensaje("Captura nombre(s) o razón social.", false); return; }

  const payload = tipo === "MORAL"
    ? { tipo_persona: "MORAL", razon_social: nombre, nombre, rfc, curp, activo: true }
    : { tipo_persona: "FISICA", apellido_paterno: paterno, apellido_materno: materno, nombre, rfc, curp, activo: true };

  try {
    const r = await fetch(`${propApiBase()}/propietarios`, {
      method: "POST",
      headers: propAuthHeaders(true),
      body: JSON.stringify(payload)
    });
    const data = await propLeerRespuesta(r);
    if (!r.ok) throw new Error(data.detail || data.message || "No se pudo crear propietario.");
    propMensaje("Propietario creado. Ya puedes buscarlo y agregarlo al predio.", true);
    document.getElementById("propBuscarTexto").value = rfc || nombre || paterno;
    await buscarPropietariosCatalogo();
  } catch (e) {
    console.error("crearPropietarioCatalogo:", e);
    propMensaje(e.message, false);
  }
}

async function desactivarPropietarioPredio(idPersona, nombre = "") {
  const clave = window.__propietariosClaveActual;
  if (!clave || !idPersona) return;
  if (!confirm(`¿Quitar del predio a ${nombre || "este propietario"}?`)) return;

  try {
    const r = await fetch(`${propApiBase()}/predios/${encodeURIComponent(clave)}/propietarios/${encodeURIComponent(idPersona)}`, {
      method: "DELETE",
      headers: propAuthHeaders()
    });
    const data = await propLeerRespuesta(r);
    if (!r.ok) throw new Error(data.detail || data.message || "No se pudo quitar propietario.");
    propMensaje("Propietario retirado correctamente.", true);
    await cargarPropietariosPredioGestion();
    await refrescarFichaDespuesPropietarios(clave);
  } catch (e) {
    console.error("desactivarPropietarioPredio:", e);
    propMensaje(e.message, false);
  }
}

async function refrescarFichaDespuesPropietarios(clave) {
  try {
    if (typeof cargarMovimientosPadron === "function") await cargarMovimientosPadron(clave);
    if (typeof cargarFichaPredio === "function") await cargarFichaPredio(clave);
    else if (typeof mostrarFichaPredial === "function" && window.predioSeleccionado) await mostrarFichaPredial(window.predioSeleccionado);
    if (typeof buscarAvanzado === "function") setTimeout(() => buscarAvanzado(), 400);
  } catch (e) {
    console.warn("No se pudo refrescar toda la ficha automáticamente:", e);
  }
}

window.addEventListener("load", () => {
  iniciarObserverPropietariosFicha();
  document.addEventListener("click", (e) => {
    if (e.target?.classList?.contains("ficha-tab-btn")) {
      setTimeout(inyectarBotonGestionPropietarios, 160);
    }
  });
});
