/* ============================================================
   v31.2 - Gestión visual de propietarios y copropietarios
   - Botón en ficha
   - Modal autogenerado si no existe en index.html
   - Buscar / crear / agregar propietario
   - Editar porcentajes
   - Recalcular 100%
   - Desactivar propietario
   Depende opcionalmente de: 07_movimientos_core.js
============================================================ */

window.__propietariosClaveActual = window.__propietariosClaveActual || "";
window.__propietarioSeleccionadoCatalogo = null;
window.__propietariosListaActual = [];

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

function propNumero(v) {
  const n = Number(String(v ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
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

function asegurarCssPropietarios() {
  if (document.getElementById("cssPropietariosFichaV312")) return;
  const st = document.createElement("style");
  st.id = "cssPropietariosFichaV312";
  st.textContent = `
    .btn-gestionar-propietarios{width:100%;margin-top:10px;background:#703341;color:#fff;border:0;border-radius:10px;padding:10px;font-weight:900;cursor:pointer;}
    .prop-modal-overlay{position:fixed;inset:0;z-index:5300;background:linear-gradient(135deg,rgba(112,51,65,.78),rgba(15,23,42,.74));backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:22px;}
    .prop-modal-overlay.oculto{display:none!important;}
    .prop-modal-card{width:min(980px,96vw);max-height:92vh;background:#fff;border-radius:20px;box-shadow:0 24px 70px rgba(0,0,0,.35);overflow:hidden;display:grid;grid-template-columns:1fr 1fr;}
    .prop-modal-left{padding:28px;background:#f8fafc;border-right:1px solid #e2e8f0;overflow:auto;}
    .prop-modal-right{position:relative;padding:28px;background:#fff;overflow:auto;}
    .prop-modal-title{font-size:24px;font-weight:900;color:#1f2937;margin:0 0 8px;}
    .prop-modal-sub{color:#703341;font-weight:900;margin-bottom:14px;}
    .prop-close{position:absolute;right:16px;top:14px;width:32px;height:32px;border:0;border-radius:999px;background:#f1f5f9;color:#703341;font-size:22px;font-weight:900;cursor:pointer;}
    .prop-item{display:grid;grid-template-columns:1fr 82px 76px;gap:8px;align-items:center;background:#fff;border:1px solid #e2e8f0;border-left:4px solid #703341;border-radius:10px;padding:8px;margin-bottom:7px;}
    .prop-item b{display:block;color:#1f2937;font-size:12px;}
    .prop-item small{display:block;color:#64748b;font-size:10px;margin-top:2px;line-height:1.25;}
    .prop-item input{height:34px!important;margin:0!important;text-align:right;}
    .prop-item button{height:34px!important;margin:0!important;font-size:10px!important;padding:4px!important;}
    .prop-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0;}
    .prop-actions button{margin:0!important;}
    .prop-total{padding:9px 10px;border-radius:10px;font-weight:900;font-size:12px;margin:8px 0 10px;}
    .prop-total.ok{background:#ecfdf3;color:#166534;border:1px solid #bbf7d0;}
    .prop-total.error{background:#fff1f2;color:#991b1b;border:1px solid #fecdd3;}
    .prop-section{margin:0 0 14px;}
    .prop-section-title{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.7px;color:#703341;margin-bottom:8px;}
    .prop-search-grid{display:grid;grid-template-columns:1fr 110px;gap:8px;}
    .prop-new-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
    .prop-help{font-size:11px;color:#64748b;line-height:1.35;margin:7px 0 10px;}
    #propResultadosCatalogo,#propietariosActualesLista{max-height:280px;overflow:auto;padding-right:3px;}
    @media(max-width:850px){.prop-modal-card{grid-template-columns:1fr;}.prop-modal-left{border-right:0;border-bottom:1px solid #e2e8f0}.prop-item{grid-template-columns:1fr}.prop-new-grid,.prop-search-grid,.prop-actions{grid-template-columns:1fr}}
  `;
  document.head.appendChild(st);
}

function asegurarModalPropietarios() {
  asegurarCssPropietarios();
  if (document.getElementById("modalPropietariosPredio")) return;

  const div = document.createElement("div");
  div.id = "modalPropietariosPredio";
  div.className = "prop-modal-overlay oculto";
  div.innerHTML = `
    <div class="prop-modal-card">
      <div class="prop-modal-left">
        <h2 class="prop-modal-title">Propietarios del predio</h2>
        <div class="prop-modal-sub">Clave: <span id="propModalClave">---</span></div>

        <div class="prop-section">
          <div class="prop-section-title">Titularidad actual</div>
          <div id="propietariosActualesLista">Sin datos.</div>
          <div id="propietariosTotalBox" class="prop-total">Total: ---</div>
          <div class="prop-actions">
            <button type="button" onclick="recalcularPorcentajesPropietarios()">Recalcular 100%</button>
            <button type="button" onclick="guardarPorcentajesPropietariosPredio()">Guardar %</button>
          </div>
          <div class="prop-help">La suma debe quedar exactamente en 100%. Los cambios de porcentaje se guardan sobre la relación predio-propietario.</div>
        </div>
      </div>

      <div class="prop-modal-right">
        <button type="button" class="prop-close" onclick="cerrarModalPropietariosPredio()">×</button>

        <div class="prop-section">
          <div class="prop-section-title">Buscar en catálogo</div>
          <div class="prop-search-grid">
            <input type="text" id="propBuscarTexto" placeholder="NOMBRE, RFC O CURP" onkeydown="if(event.key==='Enter') buscarPropietariosCatalogo()">
            <button type="button" onclick="buscarPropietariosCatalogo()">Buscar</button>
          </div>
          <div id="propResultadosCatalogo" class="prop-help">Busca un propietario para incorporarlo al predio.</div>
        </div>

        <div class="prop-section">
          <div class="prop-section-title">Nuevo propietario</div>
          <select id="propNuevoTipo" onchange="cambiarTipoNuevoPropietario()">
            <option value="FISICA">PERSONA FÍSICA</option>
            <option value="MORAL">PERSONA MORAL</option>
          </select>
          <div id="propNuevoFisica" class="prop-new-grid">
            <input type="text" id="propNuevoPaterno" placeholder="APELLIDO PATERNO">
            <input type="text" id="propNuevoMaterno" placeholder="APELLIDO MATERNO">
            <input type="text" id="propNuevoNombre" placeholder="NOMBRE(S)">
            <input type="text" id="propNuevoRfc" placeholder="RFC">
            <input type="text" id="propNuevoCurp" placeholder="CURP">
          </div>
          <div id="propNuevoMoral" class="oculto">
            <input type="text" id="propNuevoRazonSocial" placeholder="RAZÓN SOCIAL">
          </div>
          <button type="button" onclick="crearPropietarioCatalogo()">Crear propietario</button>
        </div>

        <div id="propietariosMensaje" class="modal-mov-msg"></div>
      </div>
    </div>`;
  document.body.appendChild(div);
}

function cambiarTipoNuevoPropietario() {
  const tipo = document.getElementById("propNuevoTipo")?.value || "FISICA";
  document.getElementById("propNuevoFisica")?.classList.toggle("oculto", tipo !== "FISICA");
  document.getElementById("propNuevoMoral")?.classList.toggle("oculto", tipo !== "MORAL");
}

function inyectarBotonGestionPropietarios() {
  const body = document.getElementById("fichaFlotanteBody");
  if (!body) return;

  const clave = obtenerClaveParaPropietarios();
  if (!clave) return;

  let btn = document.getElementById("btnGestionarPropietariosFicha");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "btnGestionarPropietariosFicha";
    btn.type = "button";
    btn.className = "btn-gestionar-propietarios";
    btn.textContent = "👥 Gestionar propietarios / copropietarios";
    btn.onclick = () => abrirModalPropietariosPredio(clave);
  }

  const panelPropietarios =
    document.getElementById("fichaTabPropietarios") ||
    [...body.querySelectorAll(".ficha-tab-panel")].find(p =>
      (p.textContent || "").toUpperCase().includes("PROPIETARIO")
    );

  const destino = panelPropietarios || body.querySelector(".ficha-tab-panel.active") || body;

  if (!destino.contains(btn)) {
    destino.appendChild(btn);
  }

  btn.onclick = () => abrirModalPropietariosPredio(obtenerClaveParaPropietarios());
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
  asegurarModalPropietarios();
  const modal = document.getElementById("modalPropietariosPredio");
  window.__propietariosClaveActual = propNormalizar(clave || obtenerClaveParaPropietarios());
  if (!window.__propietariosClaveActual) { alert("Selecciona un predio primero."); return; }

  document.getElementById("propModalClave").textContent = window.__propietariosClaveActual;
  const msg = document.getElementById("propietariosMensaje");
  if (msg) { msg.className = "modal-mov-msg"; msg.textContent = ""; }
  modal.classList.remove("oculto");
  await cargarPropietariosPredioGestion();
}

function cerrarModalPropietariosPredio() {
  document.getElementById("modalPropietariosPredio")?.classList.add("oculto");
}

function propIdRelacion(p) {
  return Number(p.id_predio_propietario || p.predio_propietario_id || p.id_relacion || p.id || 0);
}

function propIdPersona(p) {
  return Number(p.id_persona || p.persona_id || 0);
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
    window.__propietariosListaActual = lista;

    if (!lista.length) {
      cont.innerHTML = "Sin propietarios registrados.";
    } else {
      cont.innerHTML = lista.map((p, idx) => {
        const pct = propNumero(p.porcentaje_propiedad ?? p.porcentaje ?? 0);
        const nombre = p.nombre_completo || p.nombre || p.razon_social || "SIN NOMBRE";
        const tipo = p.tipo_titularidad || (pct >= 100 ? "PROPIETARIO" : "COPROPIETARIO");
        const idPersona = propIdPersona(p);
        return `
          <div class="prop-item" data-id-persona="${idPersona}">
            <div>
              <b>${propEscape(nombre)}</b>
              <small>${propEscape(tipo)} — RFC: ${propEscape(p.rfc || "Sin dato")}</small>
            </div>
            <input class="prop-pct-input" data-id-persona="${idPersona}" type="number" min="0" max="100" step="0.01" value="${pct}" oninput="actualizarTotalPropietariosLocal()" title="Porcentaje">
            <button type="button" onclick="desactivarPropietarioPredio(${idPersona}, '${propEscape(nombre).replace(/'/g, "\\'")}')">Quitar</button>
          </div>`;
      }).join("");
    }

    actualizarTotalPropietariosLocal(data.suma_porcentaje);
  } catch (e) {
    console.error("cargarPropietariosPredioGestion:", e);
    cont.innerHTML = `<div class="admin-mensaje error" style="display:block">${propEscape(e.message)}</div>`;
    if (totalBox) {
      totalBox.textContent = "Total: error";
      totalBox.className = "prop-total error";
    }
  }
}

function actualizarTotalPropietariosLocal(sumaServidor = null) {
  const totalBox = document.getElementById("propietariosTotalBox");
  if (!totalBox) return;
  let suma = sumaServidor;
  if (suma === null || suma === undefined) {
    suma = Array.from(document.querySelectorAll(".prop-pct-input")).reduce((a, el) => a + propNumero(el.value), 0);
  }
  suma = propNumero(suma);
  const valido = Math.abs(suma - 100) < 0.001;
  totalBox.textContent = `Total: ${suma.toFixed(2).replace(/\.00$/, "")}% ${valido ? "✓" : "— debe sumar 100%"}`;
  totalBox.className = valido ? "prop-total ok" : "prop-total error";
}

function recalcularPorcentajesPropietarios() {
  const inputs = Array.from(document.querySelectorAll(".prop-pct-input"));
  if (!inputs.length) return;
  const base = Math.floor((100 / inputs.length) * 100) / 100;
  let restante = 100;
  inputs.forEach((el, i) => {
    const val = i === inputs.length - 1 ? restante : base;
    el.value = val.toFixed(2).replace(/\.00$/, "");
    restante = Math.round((restante - val) * 100) / 100;
  });
  actualizarTotalPropietariosLocal();
}

async function guardarPorcentajesPropietariosPredio() {
  const clave = window.__propietariosClaveActual;
  const inputs = Array.from(document.querySelectorAll(".prop-pct-input"));
  if (!clave || !inputs.length) return;

  const suma = inputs.reduce((a, el) => a + propNumero(el.value), 0);
  if (Math.abs(suma - 100) > 0.001) {
    propMensaje(`La suma debe ser 100%. Actualmente es ${suma.toFixed(2)}%.`, false);
    return;
  }

  try {
    for (const el of inputs) {
      const idPersona = Number(el.dataset.idPersona || 0);
      const pct = propNumero(el.value);
      if (!idPersona) continue;
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
      if (!r.ok) throw new Error(data.detail || data.message || `No se pudo actualizar porcentaje de persona ${idPersona}.`);
    }
    propMensaje("Porcentajes guardados correctamente.", true);
    await cargarPropietariosPredioGestion();
    await refrescarFichaDespuesPropietarios(clave);
  } catch (e) {
    console.error("guardarPorcentajesPropietariosPredio:", e);
    propMensaje(e.message, false);
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
      const sugerido = Math.max(0, 100 - Array.from(document.querySelectorAll(".prop-pct-input")).reduce((a, el) => a + propNumero(el.value), 0));
      return `
        <div class="prop-item">
          <div>
            <b>${propEscape(nombre)}</b>
            <small>${propEscape(p.tipo_persona || "")} — RFC: ${propEscape(p.rfc || "Sin dato")}</small>
          </div>
          <input type="number" min="0" max="100" step="0.01" value="${sugerido > 0 ? sugerido.toFixed(2).replace(/\.00$/, "") : 50}" id="propPct_${id}">
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
  const pct = propNumero(document.getElementById(`propPct_${idPersona}`)?.value || 0);
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
    propMensaje("Propietario agregado correctamente. Revisa que el total sea 100%.", true);
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
  const nombreFisico = propNormalizar(document.getElementById("propNuevoNombre")?.value);
  const razonSocial = propNormalizar(document.getElementById("propNuevoRazonSocial")?.value);
  const rfc = propNormalizar(document.getElementById("propNuevoRfc")?.value);
  const curp = propNormalizar(document.getElementById("propNuevoCurp")?.value);

  if (tipo === "MORAL" && !razonSocial) { propMensaje("Captura la razón social.", false); return; }
  if (tipo === "FISICA" && !nombreFisico && !paterno) { propMensaje("Captura nombre y/o apellido paterno.", false); return; }

  const payload = tipo === "MORAL"
    ? { tipo_persona: "MORAL", razon_social: razonSocial, nombre: razonSocial, rfc, curp, activo: true }
    : { tipo_persona: "FISICA", apellido_paterno: paterno, apellido_materno: materno, nombre: nombreFisico, rfc, curp, activo: true };

  try {
    const r = await fetch(`${propApiBase()}/propietarios`, {
      method: "POST",
      headers: propAuthHeaders(true),
      body: JSON.stringify(payload)
    });
    const data = await propLeerRespuesta(r);
    if (!r.ok) throw new Error(data.detail || data.message || "No se pudo crear propietario.");
    propMensaje("Propietario creado. Ya puedes buscarlo y agregarlo al predio.", true);
    document.getElementById("propBuscarTexto").value = rfc || razonSocial || nombreFisico || paterno;
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
    propMensaje("Propietario retirado correctamente. Revisa que el total vuelva a quedar en 100%.", true);
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
  asegurarModalPropietarios();
  iniciarObserverPropietariosFicha();
  document.addEventListener("click", (e) => {
    if (e.target?.classList?.contains("ficha-tab-btn")) {
      setTimeout(inyectarBotonGestionPropietarios, 160);
    }
  });
});
