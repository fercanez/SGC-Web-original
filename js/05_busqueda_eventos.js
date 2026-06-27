/* --- v16: contador + búsqueda con fallback seguro --- */
function detectarTipoBusquedaActiva() {
  const clave = (document.getElementById("claveInput")?.value || "").trim();
  const nombre = (document.getElementById("nombreInput")?.value || "").trim();
  const calle = (document.getElementById("calleInput")?.value || "").trim();
  const numero = (document.getElementById("numeroInput")?.value || "").trim();
  const colonia = (document.getElementById("coloniaInput")?.value || "").trim();

  if (clave) return "clave";
  if (nombre) return "nombre";
  if (calle || numero || colonia) return "direccion";
  return "general";
}

function actualizarContadorBusqueda(total, tipo = null, cargados = null) {
  const totalNum = Number(total || 0);
  const cargadosNum = Number(cargados ?? totalNum);
  const tipoBusqueda = tipo || (typeof detectarTipoBusquedaActiva === "function" ? detectarTipoBusquedaActiva() : "general");

  let texto = totalNum === 1
    ? "1 predio encontrado"
    : `${totalNum.toLocaleString("es-MX")} predios encontrados`;

  if (totalNum > cargadosNum) {
    texto += ` · cargados ${cargadosNum.toLocaleString("es-MX")}`;
  }

  const general = document.getElementById("contadorBusquedaGeneral");
  if (general) {
    general.innerText = texto;
    general.classList.toggle("contador-ok", totalNum > 0);
    general.classList.toggle("contador-warn", totalNum === 0);
  }

  const ids = {
    clave: "contadorClave",
    nombre: "contadorNombre",
    direccion: "contadorDireccion"
  };

  Object.entries(ids).forEach(([tipoKey, id]) => {
    const el = document.getElementById(id);
    if (!el) return;

    if (tipoBusqueda === "general" || tipoKey === tipoBusqueda) {
      el.innerText = texto;
      el.classList.toggle("contador-ok", totalNum > 0);
      el.classList.toggle("contador-warn", totalNum === 0);
    } else {
      el.innerText = "Sin búsqueda realizada";
      el.classList.remove("contador-ok", "contador-warn");
    }
  });
}

function mostrarAvisoTotalResultados(total, cargados, limiteUsado = null) {
  const contenedorResultados = document.getElementById("resultadosBusqueda");
  if (!contenedorResultados) return;

  let aviso = document.getElementById("avisoTotalResultados");
  if (!aviso) {
    aviso = document.createElement("div");
    aviso.id = "avisoTotalResultados";
    aviso.className = "aviso-total-resultados";
    contenedorResultados.parentNode.insertBefore(aviso, contenedorResultados);
  }

  const totalNum = Number(total || 0);
  const cargadosNum = Number(cargados || 0);

  if (totalNum <= 0) {
    aviso.style.display = "none";
    aviso.innerHTML = "";
    return;
  }

  aviso.style.display = "block";
  let extra = limiteUsado ? ` · límite usado: <b>${Number(limiteUsado).toLocaleString("es-MX")}</b>` : "";

  if (totalNum > cargadosNum) {
    aviso.innerHTML = `Total encontrado: <b>${totalNum.toLocaleString("es-MX")}</b> · cargados en tabla: <b>${cargadosNum.toLocaleString("es-MX")}</b>${extra}.`;
  } else {
    aviso.innerHTML = `Total encontrado: <b>${totalNum.toLocaleString("es-MX")}</b>${extra}.`;
  }
}

function construirUrlBusqueda(clave, nombre, colonia, calle, numero, limite) {
  return `${API}/padron/busqueda-avanzada?` +
    `clave=${encodeURIComponent(clave)}` +
    `&nombre=${encodeURIComponent(nombre)}` +
    `&colonia=${encodeURIComponent(colonia)}` +
    `&calle=${encodeURIComponent(calle)}` +
    `&numero=${encodeURIComponent(numero)}` +
    `&limite=${limite}`;
}

async function pedirBusquedaAvanzada(clave, nombre, colonia, calle, numero, limite) {
  const url = construirUrlBusqueda(clave, nombre, colonia, calle, numero, limite);
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  data.__limite_usado = limite;
  return data;
}

async function buscarAvanzado() {
  const clave = document.getElementById("claveInput").value.trim();
  const nombre = document.getElementById("nombreInput").value.trim();
  const colonia = document.getElementById("coloniaInput").value.trim();
  const calle = document.getElementById("calleInput").value.trim();
  const numero = document.getElementById("numeroInput").value.trim();

  const tipoBusqueda = detectarTipoBusquedaActiva();

  try {
    let data = null;

    try {
      data = await pedirBusquedaAvanzada(clave, nombre, colonia, calle, numero, 5000);
    } catch (e5000) {
      console.warn("Búsqueda con límite 5000 falló; reintentando con 100.", e5000);
      data = await pedirBusquedaAvanzada(clave, nombre, colonia, calle, numero, 100);
    }

    let resultados = data.resultados || [];
    let total = Number(data.total ?? resultados.length ?? 0);

    // Si el backend respondió 0 con 5000, reintenta con 100 para evitar falso negativo.
    if (data.__limite_usado === 5000 && total === 0 && resultados.length === 0) {
      try {
        const data100 = await pedirBusquedaAvanzada(clave, nombre, colonia, calle, numero, 100);
        if ((data100.resultados || []).length > 0 || Number(data100.total || 0) > 0) {
          data = data100;
          resultados = data100.resultados || [];
          total = Number(data100.total ?? resultados.length ?? 0);
        }
      } catch (e100) {
        console.warn("Reintento con 100 también falló.", e100);
      }
    }

    actualizarContadorBusqueda(total, tipoBusqueda, resultados.length);
    mostrarAvisoTotalResultados(total, resultados.length, data.__limite_usado);

    const div = document.getElementById("resultadosBusqueda");
    div.innerHTML = "";

    if (!resultados || resultados.length === 0) {
      div.innerHTML = "<p>Sin resultados.</p>";
      renderizarTablaResultados([], total);
      return;
    }

    renderizarTablaResultados(resultados, total);
    await zoomAResultadosBusqueda(resultados);

    resultados.slice(0, 250).forEach(p => {
      const item = document.createElement("div");
      item.className = "resultado-item";
      item.innerHTML = `
        <b>${p.clave_catastral}</b><br>
        <strong>${p.nombre_completo || ""}</strong><br>
        <small>${p.colonia || ""}${p.calle ? " · " + p.calle : ""}${p.numof ? " #" + p.numof : ""}</small>
      `;

      item.onclick = async () => {
        document.getElementById("claveInput").value = p.clave_catastral;
        await cargarDesdeBusqueda(p);
      };

      div.appendChild(item);
    });

    if (resultados.length > 250) {
      const nota = document.createElement("div");
      nota.className = "aviso-total-resultados";
      nota.style.display = "block";
      nota.innerHTML = `Listado lateral limitado a <b>250</b> predios para mantener velocidad. Revisa todos los registros cargados en la tabla inferior.`;
      div.appendChild(nota);
    }

  } catch(e) {
    console.error("Error en búsqueda avanzada:", e);
    actualizarContadorBusqueda(0, tipoBusqueda, 0);
    mostrarAvisoTotalResultados(0, 0);
  }
}

function registrarEnterBusquedas() {
  ["claveInput", "nombreInput", "coloniaInput", "calleInput", "numeroInput"].forEach(function(id) {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener("keyup", function(e) {
        if (e.key === "Enter") buscarAvanzado();
      });
    }
  });
}

async function seleccionarPorClave(clave) {
  if (!clave) return;

  const fichaGeojsonResponse = await fetch(`${API}/expediente/${clave}?_=${Date.now()}`, {
    cache: "no-store"
  });

  if (!fichaGeojsonResponse.ok) {
    console.warn("No se pudo cargar expediente:", clave);
    return;
  }

  const featureGeojson = await fichaGeojsonResponse.json();
  const ficha = featureGeojson.properties || {};

  if (featureGeojson.geometry) {
    pintarGeoJSON(featureGeojson, true);
  }

  pintarFicha(ficha);
  document.getElementById("claveInput").value = clave;
}

map.on("click", async function(evt) {
  try {
    const view = map.getView();
    const resolution = view.getResolution();
    const projection = view.getProjection();

    // Primero intenta identificar exactamente el predio renderizado en el WMS.
    const wmsUrl = prediosWmsLayer.getSource().getFeatureInfoUrl(
      evt.coordinate,
      resolution,
      projection,
      {
        "INFO_FORMAT": "application/json",
        "FEATURE_COUNT": 10
      }
    );

    if (wmsUrl) {
      const rWms = await fetch(wmsUrl, { cache: "no-store" });

      if (rWms.ok) {
        const dataWms = await rWms.json();
        const features = dataWms.features || [];

        if (features.length > 0) {
          const props = features[0].properties || {};
          const clave =
            props.clave_catastral ||
            props.clavecatas ||
            props.CLAVE_CATASTRAL ||
            props.ClaveCatas ||
            props.clave;

          if (clave) {
            await seleccionarPorClave(String(clave).trim().toUpperCase());
            return;
          }
        }
      }
    }

    // Respaldo: si GetFeatureInfo no responde, usa el endpoint espacial.
    const lonlat = ol.proj.toLonLat(evt.coordinate);
    const lon = lonlat[0];
    const lat = lonlat[1];

    const res = await fetch(`${API}/predios/intersecta?lon=${lon}&lat=${lat}&_=${Date.now()}`, {
      cache: "no-store"
    });

    if (!res.ok) return;

    const featureGeojson = await res.json();
    const clave = featureGeojson.properties.clave_catastral;

    const ficha = await obtenerFichaPorClave(clave) || featureGeojson.properties;

    pintarGeoJSON(featureGeojson, true);
    pintarFicha(ficha);
    document.getElementById("claveInput").value = clave;

  } catch (err) {
    console.error("Error al seleccionar predio por click:", err);
  }
});

const popup = document.getElementById("popup");

map.on("pointermove", function(evt) {
  const feature = map.forEachFeatureAtPixel(evt.pixel, function(feature) {
    return feature;
  });

  if (feature) {
    const clave = feature.get("clave_catastral") || "";
    const superficie = feature.get("superficie") || feature.get("sup_documental") || "";
    const colonia = feature.get("colonia") || "";

    popup.innerHTML = `
      <b>${clave}</b><br>
      Colonia: ${colonia}<br>
      Sup: ${superficie} m²
    `;

    popup.style.left = evt.originalEvent.pageX + 12 + "px";
    popup.style.top = evt.originalEvent.pageY + 12 + "px";
    popup.style.display = "block";
    map.getTargetElement().style.cursor = "pointer";
  } else {
    popup.style.display = "none";
    map.getTargetElement().style.cursor = "";
  }
});



