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


