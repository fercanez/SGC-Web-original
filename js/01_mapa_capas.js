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


