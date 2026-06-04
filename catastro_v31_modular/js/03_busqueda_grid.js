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



