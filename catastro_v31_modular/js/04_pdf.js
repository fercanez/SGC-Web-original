/* --- v20: PDF institucional del predio seleccionado --- */
function obtenerClaveSeleccionadaPDF() {
  const fichaClave = document.getElementById("fichaClave")?.innerText?.trim();
  if (fichaClave) return fichaClave;

  const inputClave = document.getElementById("claveInput")?.value?.trim();
  if (inputClave) return inputClave;

  try {
    const f = vectorSource.getFeatures().find(x => x.get("seleccionado") === true);
    return f ? (f.get("clave_catastral") || "") : "";
  } catch (e) {
    return "";
  }
}

function obtenerPropiedadesFichaPDF() {
  const clave = obtenerClaveSeleccionadaPDF();
  if (!clave) return null;

  try {
    const f = vectorSource.getFeatures().find(x => (x.get("clave_catastral") || "").toUpperCase() === clave.toUpperCase());
    if (f) return f.getProperties();
  } catch (e) {}

  return {
    clave_catastral: clave,
    nombre_completo: document.querySelector(".ficha-status-box .big + div")?.innerText || ""
  };
}

function formatoPdfMoneda(v) {
  const n = Number(v || 0);
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function textoPdf(v) {
  if (v === null || v === undefined || v === "") return "Sin dato";
  return String(v);
}

function obtenerImagenMapaPDF() {
  return new Promise(resolve => {
    let resuelto = false;

    const finalizar = (img) => {
      if (!resuelto) {
        resuelto = true;
        resolve(img);
      }
    };

    // Timeout de seguridad: si el mapa tarda o falla, continúa sin croquis capturado.
    setTimeout(() => finalizar(null), 2500);

    try {
      map.once("rendercomplete", function () {
        try {
          const size = map.getSize();
          const canvasFinal = document.createElement("canvas");
          canvasFinal.width = size[0];
          canvasFinal.height = size[1];
          const ctx = canvasFinal.getContext("2d");

          Array.prototype.forEach.call(
            document.querySelectorAll(".ol-layer canvas, canvas.ol-layer"),
            function (canvas) {
              try {
                if (canvas.width > 0) {
                  const opacity = canvas.parentNode.style.opacity || canvas.style.opacity;
                  ctx.globalAlpha = opacity === "" ? 1 : Number(opacity);

                  let matrix;
                  const transform = canvas.style.transform;
                  if (transform && transform.startsWith("matrix")) {
                    matrix = transform.match(/^matrix\(([^\(]*)\)$/)[1].split(",").map(Number);
                  } else {
                    matrix = [1, 0, 0, 1, 0, 0];
                  }

                  CanvasRenderingContext2D.prototype.setTransform.apply(ctx, matrix);
                  ctx.drawImage(canvas, 0, 0);
                }
              } catch (canvasError) {
                console.warn("Una capa no pudo capturarse para PDF:", canvasError);
              }
            }
          );

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;

          // Esta línea puede fallar con Google/tiles externos por CORS.
          const data = canvasFinal.toDataURL("image/png");
          finalizar(data);
        } catch (e) {
          console.warn("No se pudo capturar el mapa para PDF; se generará sin imagen de mapa.", e);
          finalizar(null);
        }
      });

      map.renderSync();
    } catch (e) {
      console.warn("No se pudo iniciar captura del mapa:", e);
      finalizar(null);
    }
  });
}

async function generarQRPDF(clave) {
  try {
    const canvas = document.getElementById("qrPdfTemp") || document.createElement("canvas");
    const url = `${location.origin}${location.pathname}?clave=${encodeURIComponent(clave)}`;
    await QRCode.toCanvas(canvas, url, { width: 120, margin: 1 });
    return canvas.toDataURL("image/png");
  } catch (e) {
    console.warn("No se pudo generar QR:", e);
    return null;
  }
}


/* --- v20c: croquis institucional WMS para PDF cuando Google bloquea captura --- */
function obtenerFeatureSeleccionadaPDF() {
  try {
    const clave = obtenerClaveSeleccionadaPDF();
    return vectorSource.getFeatures().find(f =>
      (f.get("clave_catastral") || "").toUpperCase() === (clave || "").toUpperCase()
    ) || vectorSource.getFeatures().find(f => f.get("seleccionado") === true) || null;
  } catch (e) {
    return null;
  }
}

function expandirExtentPDF(extent, factor = 1.25) {
  const w = extent[2] - extent[0];
  const h = extent[3] - extent[1];
  const cx = (extent[0] + extent[2]) / 2;
  const cy = (extent[1] + extent[3]) / 2;
  const maxDim = Math.max(w, h, 80);
  const half = (maxDim * factor) / 2;
  return [cx - half, cy - half, cx + half, cy + half];
}

function cargarImagenPDF(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function dibujarGeometriaPDF(ctx, geom, bbox, width, height) {
  if (!geom) return;

  const extent = bbox;
  const minx = extent[0], miny = extent[1], maxx = extent[2], maxy = extent[3];

  function px(coord) {
    const x = ((coord[0] - minx) / (maxx - minx)) * width;
    const y = height - ((coord[1] - miny) / (maxy - miny)) * height;
    return [x, y];
  }

  function dibujarRing(coords) {
    if (!coords || coords.length === 0) return;
    ctx.beginPath();
    coords.forEach((c, i) => {
      const p = px(c);
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  const type = geom.getType();

  ctx.save();
  ctx.fillStyle = "rgba(21, 128, 61, 0.28)";
  ctx.strokeStyle = "#15803d";
  ctx.lineWidth = 6;

  if (type === "Polygon") {
    const rings = geom.getCoordinates();
    rings.forEach(r => dibujarRing(r));
  }

  if (type === "MultiPolygon") {
    const polys = geom.getCoordinates();
    polys.forEach(poly => poly.forEach(r => dibujarRing(r)));
  }

  ctx.restore();
}

async function generarCroquisWMSPDF() {
  try {
    const feature = obtenerFeatureSeleccionadaPDF();
    if (!feature || !feature.getGeometry()) return null;

    const width = 1100;
    const height = 620;

    const geom = feature.getGeometry();
    const extentOriginal = geom.getExtent();
    const bbox = expandirExtentPDF(extentOriginal, 3.0);

    const wmsUrl =
      "https://fcnarqnodo.hopto.org/geoserver/catastro_bc/wms?" +
      "SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap" +
      "&LAYERS=catastro_bc:predios_oficial" +
      "&STYLES=" +
      "&FORMAT=image/png" +
      "&TRANSPARENT=false" +
      "&SRS=EPSG:3857" +
      `&BBOX=${bbox.join(",")}` +
      `&WIDTH=${width}&HEIGHT=${height}`;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // Fondo institucional claro
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, width, height);

    const img = await cargarImagenPDF(wmsUrl);
    if (img) {
      try {
        ctx.drawImage(img, 0, 0, width, height);
      } catch (e) {
        console.warn("No se pudo dibujar WMS en croquis PDF:", e);
      }
    } else {
      ctx.fillStyle = "#e5e7eb";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#64748b";
      ctx.font = "bold 26px Arial";
      ctx.textAlign = "center";
      ctx.fillText("Croquis institucional WMS", width / 2, height / 2 - 14);
      ctx.font = "20px Arial";
      ctx.fillText("No se pudo cargar imagen WMS, se dibuja la geometría seleccionada.", width / 2, height / 2 + 22);
    }

    // Rejilla ligera
    ctx.save();
    ctx.strokeStyle = "rgba(100,116,139,0.22)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += 100) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y <= height; y += 100) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    ctx.restore();

    // Predio seleccionado
    dibujarGeometriaPDF(ctx, geom, bbox, width, height);

    // Etiqueta
    const clave = feature.get("clave_catastral") || obtenerClaveSeleccionadaPDF();
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.strokeStyle = "#15803d";
    ctx.lineWidth = 2;
    ctx.roundRect(width - 270, 24, 235, 54, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";
    ctx.fillText(clave, width - 152, 59);
    ctx.restore();

    // Norte
    ctx.save();
    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.arc(50, 50, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px Arial";
    ctx.textAlign = "center";
    ctx.fillText("N", 50, 60);
    ctx.restore();

    // Escala referencial
    ctx.save();
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(50, height - 45);
    ctx.lineTo(250, height - 45);
    ctx.stroke();
    ctx.fillStyle = "#111827";
    ctx.font = "18px Arial";
    ctx.fillText("Escala gráfica referencial", 50, height - 18);
    ctx.restore();

    return canvas.toDataURL("image/png");
  } catch (e) {
    console.warn("No se pudo generar croquis WMS PDF:", e);
    return null;
  }
}

async function generarPDFInstitucional() {
  if (!requerirPermiso("exportar_pdf", "No tienes permisos para generar PDF.")) return;

  const btn = document.getElementById("btnPdfInstitucional");
  const estado = document.getElementById("estadoPdfInstitucional");

  const setEstado = (txt, tipo = "") => {
    if (!estado) return;
    estado.innerText = txt;
    estado.className = "estado-pdf " + tipo;
  };

  try {
    const clave = obtenerClaveSeleccionadaPDF();

    if (!clave) {
      alert("Primero selecciona o busca un predio para generar el PDF.");
      return;
    }

    if (typeof window.jspdf === "undefined") {
      alert("No se cargó la librería jsPDF. Revisa conexión a internet o bloqueo de CDN.");
      setEstado("No se cargó jsPDF.", "error");
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerText = "⏳ Generando PDF...";
    }
    setEstado("Generando ficha institucional...", "procesando");

    let feature = null;
    try {
      const r = await fetch(`${API}/padron/${encodeURIComponent(clave)}/ficha?_=${Date.now()}`, { cache: "no-store" });
      if (r.ok) feature = await r.json();
    } catch (e) {
      console.warn("No se pudo cargar ficha para PDF:", e);
    }

    const p = feature?.properties || obtenerPropiedadesFichaPDF() || {};
    setEstado("Capturando mapa...", "procesando");
    let mapaImg = await obtenerImagenMapaPDF();
    if (!mapaImg) {
      setEstado("Google bloqueó captura; generando croquis WMS institucional...", "procesando");
      mapaImg = await generarCroquisWMSPDF();
    }

    setEstado("Generando QR...", "procesando");
    const qrImg = await generarQRPDF(clave);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "letter");

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    const guinda = [112, 51, 65];
    const grisTexto = [40, 48, 60];
    const grisClaro = [245, 247, 250];
    const rojo = [198, 40, 40];
    const verde = [21, 128, 61];

    // Header
    doc.setFillColor(...guinda);
    doc.rect(0, 0, pageW, 25, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("Sistema de Gestión Catastral", 14, 10);
    doc.setFontSize(10);
    doc.text("Ficha predial institucional · Catastro Mexicali", 14, 17);

    doc.setFontSize(9);
    const fecha = new Date().toLocaleString("es-MX");
    doc.text(`Fecha: ${fecha}`, pageW - 14, 10, { align: "right" });
    doc.text(`Clave: ${clave}`, pageW - 14, 17, { align: "right" });

    // Title block
    doc.setTextColor(...grisTexto);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(`Ficha predial: ${clave}`, 14, 36);

    const tieneAdeudo = Number(p.adeudo_total || 0) > 0;
    doc.setFillColor(...(tieneAdeudo ? rojo : verde));
    doc.roundedRect(pageW - 62, 29, 48, 10, 2, 2, "F");
    doc.setTextColor(255,255,255);
    doc.setFontSize(8);
    doc.text(tieneAdeudo ? "CON ADEUDO" : "SIN ADEUDO", pageW - 38, 35.5, { align: "center" });

    // Croquis
    doc.setDrawColor(220, 225, 232);
    doc.setFillColor(...grisClaro);
    doc.roundedRect(14, 43, pageW - 28, 78, 2, 2, "FD");

    if (mapaImg) {
      try {
        doc.addImage(mapaImg, "PNG", 16, 45, pageW - 32, 74);
      } catch (imgErr) {
        console.warn("No se pudo insertar la imagen del mapa en PDF:", imgErr);
        doc.setFontSize(10);
        doc.setTextColor(120, 120, 120);
        doc.text("Croquis no disponible; no se pudo capturar Google ni generar WMS.", pageW / 2, 80, { align: "center" });
        doc.text("El PDF se genera con la información predial institucional.", pageW / 2, 87, { align: "center" });
      }
    } else {
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 120);
      doc.text("Croquis no disponible; no se pudo capturar Google ni generar WMS.", pageW / 2, 80, { align: "center" });
      doc.text("El PDF se genera con la información predial institucional.", pageW / 2, 87, { align: "center" });
    }

    // Norte y escala visual simple
    doc.setTextColor(255, 255, 255);
    doc.setFillColor(0, 0, 0);
    doc.circle(pageW - 27, 54, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("N", pageW - 27, 57, { align: "center" });

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.7);
    doc.line(22, 113, 62, 113);
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    doc.text("Escala gráfica referencial", 22, 117);

    // Datos principales
    let y = 132;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...guinda);
    doc.text("Información del predio", 14, y);

    y += 6;

    function row(label, value, x1, x2, yy) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...guinda);
      doc.setFontSize(8);
      doc.text(label, x1, yy);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...grisTexto);
      doc.text(doc.splitTextToSize(textoPdf(value), x2 - x1 - 4), x1 + 35, yy);
    }

    doc.setDrawColor(230, 234, 240);
    doc.setFillColor(252, 252, 253);
    doc.roundedRect(14, y, pageW - 28, 58, 2, 2, "FD");

    row("Clave", p.clave_catastral || clave, 18, pageW/2, y + 9);
    row("Propietario", p.nombre_completo || p.propietario, 18, pageW - 18, y + 18);
    row("Delegación", p.delegacion, 18, pageW/2, y + 27);
    row("Colonia", p.colonia, pageW/2 + 2, pageW - 18, y + 27);
    row("Calle", p.calle, 18, pageW/2, y + 36);
    row("# Oficial", p.numof, pageW/2 + 2, pageW - 18, y + 36);
    row("Zona H.", p.zona_homogenea || p.zonah, 18, pageW/2, y + 45);
    row("Uso", p.descripcion_uso, pageW/2 + 2, pageW - 18, y + 45);

    y += 68;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...guinda);
    doc.text("Valores, superficies y estado fiscal", 14, y);

    y += 6;
    doc.setDrawColor(230, 234, 240);
    doc.setFillColor(252, 252, 253);
    doc.roundedRect(14, y, pageW - 28, 42, 2, 2, "FD");

    row("Valor 2026", formatoPdfMoneda(p.valor2026), 18, pageW/2, y + 10);
    row("Sup. doc.", `${textoPdf(p.sup_documental)} m²`, pageW/2 + 2, pageW - 18, y + 10);
    row("Sup. física", `${textoPdf(p.sup_fisica)} m²`, 18, pageW/2, y + 20);
    row("Sup. const.", `${textoPdf(p.sup_const)} m²`, pageW/2 + 2, pageW - 18, y + 20);
    row("Adeudo 2026", formatoPdfMoneda(p.adeudo_2026), 18, pageW/2, y + 30);
    row("Adeudo total", formatoPdfMoneda(p.adeudo_total), pageW/2 + 2, pageW - 18, y + 30);

    if (qrImg) {
      try {
        doc.addImage(qrImg, "PNG", pageW - 42, pageH - 42, 28, 28);
        doc.setFontSize(7);
        doc.setTextColor(80, 80, 80);
        doc.text("Consulta digital", pageW - 28, pageH - 10, { align: "center" });
      } catch(e) {
        console.warn("QR no insertado:", e);
      }
    }

    doc.setDrawColor(...guinda);
    doc.setLineWidth(0.5);
    doc.line(14, pageH - 18, pageW - 48, pageH - 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(90, 90, 90);
    doc.text("Documento generado automáticamente por el Sistema de Gestión Catastral. Información sujeta a validación institucional.", 14, pageH - 12);

    setEstado("PDF generado correctamente.", "ok");
    doc.save(`ficha_predial_${clave}.pdf`);

  } catch (e) {
    console.error("Error generando PDF:", e);
    alert("No se pudo generar el PDF. Abre la consola del navegador para ver el detalle.");
    setEstado("Error al generar PDF.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = "📄 Generar ficha PDF";
    }
  }
}

function exportarResultadosExcel() {
  if (!requerirPermiso("exportar_excel", "No tienes permisos para exportar a Excel.")) return;

  const datos = gridEstado.filtrados && gridEstado.filtrados.length
    ? gridEstado.filtrados
    : (gridEstado.todos || []);

  if (!datos.length) {
    alert("No hay resultados para exportar.");
    return;
  }

  if (typeof XLSX === "undefined") {
    alert("No se pudo cargar la librería de Excel. Revisa tu conexión a internet.");
    return;
  }

  const columnas = [
    { campo: "clave_catastral", titulo: "Clave catastral" },
    { campo: "nombre_completo", titulo: "Nombre / Razón social" },
    { campo: "delegacion", titulo: "Delegación" },
    { campo: "colonia", titulo: "Colonia" },
    { campo: "calle", titulo: "Calle" },
    { campo: "numof", titulo: "Número oficial" },
    { campo: "zona_homogenea", titulo: "Zona homogénea" },
    { campo: "valor2026", titulo: "Valor 2026" },
    { campo: "sup_documental", titulo: "Superficie documental" },
    { campo: "id_tasa", titulo: "ID tasa" },
    { campo: "porcentaje_tasa", titulo: "Porcentaje tasa" },
    { campo: "condominio", titulo: "Condominio" },
    { campo: "descripcion_uso", titulo: "Uso predial" },
    { campo: "dibujado", titulo: "Dibujado en cartografía" }
  ];

  const filas = datos.map(p => {
    const fila = {};
    columnas.forEach(col => {
      let valor = p[col.campo];

      if (col.campo === "dibujado") {
        valor = valor ? "DIBUJADO" : "SIN GEOMETRÍA";
      }

      if (valor === null || valor === undefined) {
        valor = "";
      }

      fila[col.titulo] = valor;
    });
    return fila;
  });

  const ws = XLSX.utils.json_to_sheet(filas);

  ws["!cols"] = columnas.map(col => ({
    wch: Math.max(14, col.titulo.length + 2)
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resultados");

  // Hoja de resumen para conservar el total real del backend
  const resumen = [{
    "Total encontrado": gridEstado.totalReal || datos.length,
    "Registros cargados/exportados": datos.length,
    "Nota": (gridEstado.totalReal && gridEstado.totalReal > datos.length)
      ? "El total real es mayor que los registros cargados en la tabla."
      : "Exportación completa de los registros cargados."
  }];
  const wsResumen = XLSX.utils.json_to_sheet(resumen);
  wsResumen["!cols"] = [{ wch: 20 }, { wch: 28 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

  const fecha = new Date();
  const yyyy = fecha.getFullYear();
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getDate()).padStart(2, "0");
  const hh = String(fecha.getHours()).padStart(2, "0");
  const mi = String(fecha.getMinutes()).padStart(2, "0");

  XLSX.writeFile(wb, `resultados_catastro_${yyyy}${mm}${dd}_${hh}${mi}.xlsx`);
}

// Alias para compatibilidad con botones anteriores
function exportarResultadosCSV() {
  exportarResultadosExcel();
}



