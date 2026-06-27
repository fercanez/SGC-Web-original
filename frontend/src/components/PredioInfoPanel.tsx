import { useEffect, useState } from "react";
import { formatMoney } from "../utils/geometry";
import {
  fiscalClaveClass,
  fiscalLabel,
  fiscalStatusFromAdeudos,
  type FiscalStatus,
} from "../utils/fiscal";
import {
  getPredioPropietarios,
  getExpediente,
  getExpedienteHistorial,
  getMovimientosSGC,
  type MovimientoSGC,
  type OwnershipRow,
  type ParcelSummary,
  type PredioAlfanumericoRecord,
  type PredioPropietarioItem,
  type ExpedienteInfo,
  type ExpedienteHistorialItem,
} from "../api";

export type PredioInfoTab =
  | "identificacion"
  | "valores"
  | "propietarios"
  | "expediente"
  | "movimientos"
  | "historial"
  | "ubicacion"
  | "adeudos"
  | "docs";

interface Props {
  clave: string;
  padron: PredioAlfanumericoRecord | null;
  cartography: ParcelSummary | null;
  cartographyMatches: boolean;
  /** Polígono visible en mapa (WFS o enlace correcto). */
  dibujadoEnMapa: boolean;
  geometryLoading?: boolean;
  ownerships: OwnershipRow[];
  currency: string;
  tab: PredioInfoTab;
  onTabChange: (t: PredioInfoTab) => void;
  onClose?: () => void;
}

function badgeDibujado(dibujadoEnMapa: boolean, geometryLoading?: boolean) {
  if (geometryLoading) return { label: "CARGANDO MAPA…", cls: "cm-badge-warn" };
  if (dibujadoEnMapa) return { label: "DIBUJADO", cls: "cm-badge-ok" };
  return { label: "SIN CARTOGRAFÍA", cls: "cm-badge-warn" };
}

function badgeFiscal(status: FiscalStatus) {
  if (status === "con_adeudo") {
    return { label: fiscalLabel(status), cls: "cm-badge-debt" };
  }
  return { label: fiscalLabel(status), cls: "cm-badge-ok" };
}

export default function PredioInfoPanel({
  clave,
  padron,
  cartography,
  cartographyMatches,
  dibujadoEnMapa,
  geometryLoading = false,
  ownerships,
  currency,
  tab,
  onTabChange,
  onClose,
}: Props) {
  const titular =
    padron?.nombre_completo ??
    ownerships[0]?.party?.full_name ??
    "Sin titular registrado";
  const dib = badgeDibujado(dibujadoEnMapa, geometryLoading);
  const fiscalStatus = fiscalStatusFromAdeudos(
    padron?.adeudo_2026,
    padron?.adeudo_total
  );
  const fiscal = badgeFiscal(fiscalStatus);
  const [propietarios, setPropietarios] = useState<PredioPropietarioItem[]>([]);
  const [propietariosTotal, setPropietariosTotal] = useState<number>(0);
  const [propietariosLoading, setPropietariosLoading] = useState(false);
  const [propietariosError, setPropietariosError] = useState<string | null>(null);
  const [expediente, setExpediente] =
  useState<ExpedienteInfo | null>(null);

const [expedienteLoading, setExpedienteLoading] =
  useState(false);

const [historial, setHistorial] =
  useState<ExpedienteHistorialItem[]>([]);
const [movimientos, setMovimientos] =
  useState<MovimientoSGC[]>([]);

const [movimientosLoading, setMovimientosLoading] =
  useState(false);

const [historialLoading, setHistorialLoading] =
  useState(false);

useEffect(() => {
  if (!clave || tab !== "propietarios") return;

  setPropietariosLoading(true);
  setPropietariosError(null);

  getPredioPropietarios(clave)
    .then((res) => {
      setPropietarios(res.items ?? []);
      setPropietariosTotal(res.total_participacion ?? 0);
    })
    .catch((err) => {
      setPropietariosError(
        err instanceof Error ? err.message : "No se pudieron cargar propietarios"
      );
    })
    .finally(() => setPropietariosLoading(false));
}, [clave, tab]);
useEffect(() => {
  if (!clave || tab !== "movimientos") return;

  setMovimientosLoading(true);

  getMovimientosSGC(clave)
    .then((data) => {
      setMovimientos(data ?? []);
    })
    .catch(() => {
      setMovimientos([]);
    })
    .finally(() => {
      setMovimientosLoading(false);
    });
}, [clave, tab]);
/* ===== NUEVO BLOQUE ===== */

useEffect(() => {
  if (!clave || tab !== "expediente") return;

  setExpedienteLoading(true);

  getExpediente(clave)
    .then((data) => {
      setExpediente(data);
    })
    .catch(() => {
      setExpediente(null);
    })
    .finally(() => {
      setExpedienteLoading(false);
    });
}, [clave, tab]);
useEffect(() => {
  if (!clave || tab !== "historial") return;

  setHistorialLoading(true);

  getExpedienteHistorial(clave)
    .then((data) => {
      setHistorial(data ?? []);
    })
    .catch(() => {
      setHistorial([]);
    })
    .finally(() => {
      setHistorialLoading(false);
    });
}, [clave, tab]);

/* ===== FIN NUEVO BLOQUE ===== */

const tabs: { id: PredioInfoTab; label: string }[] = [
  { id: "identificacion", label: "Identificación" },
  { id: "propietarios", label: "Propietarios" },
  { id: "valores", label: "Valores" },
  { id: "expediente", label: "Expediente" },
  { id: "historial", label: "Historial" },
  { id: "movimientos", label: "Movimientos" },
  { id: "ubicacion", label: "Ubicación" },
  { id: "adeudos", label: "Adeudos" },
  { id: "docs", label: "Docs" },
];
  return (
    <div className="cm-float cm-float-info">
      <div className="cm-float-header">
        <div>
          <span className="cm-float-kicker">Información del predio</span>
          <h2 className={`cm-float-title ${fiscalClaveClass(fiscalStatus)}`}>
            {clave}
          </h2>
          <p className="cm-float-subtitle">{titular}</p>
        </div>
        {onClose && (
          <button type="button" className="cm-icon-btn" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        )}
      </div>
      <div className="cm-badge-row">
        <span className={`cm-badge ${dib.cls}`}>{dib.label}</span>
        <span className={`cm-badge ${fiscal.cls}`}>{fiscal.label}</span>
      </div>
      <div className="cm-info-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "active" : ""}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="cm-info-body">
        {tab === "identificacion" && (
          <table className="cm-kv-table">
            <tbody>
              <tr>
                <th>Clave</th>
                <td>{padron?.clave_catastral ?? clave}</td>
              </tr>
              <tr>
                <th>Nombre / Razón social</th>
                <td>{titular}</td>
              </tr>
              <tr>
                <th>RFC</th>
                <td className="muted">Sin dato</td>
              </tr>
              <tr>
                <th>Cuenta predial</th>
                <td>{cartography?.predial_account ?? "Sin dato"}</td>
              </tr>
              <tr>
                <th>Estado cartográfico</th>
                <td>{cartography?.status ?? "—"}</td>
              </tr>
            </tbody>
          </table>
        )}
        {tab === "valores" && (
          <table className="cm-kv-table">
            <tbody>
              <tr>
                <th>Valor 2026</th>
                <td>{formatMoney(padron?.valor2026, currency)}</td>
              </tr>
              <tr>
                <th>Avalúo cartográfico</th>
                <td>
                  {cartography?.cadastral_value != null
                    ? cartography.cadastral_value.toLocaleString("es-MX", {
                        style: "currency",
                        currency,
                        maximumFractionDigits: 0,
                      })
                    : "Sin dato"}
                </td>
              </tr>
              <tr>
                <th>Zona homogénea</th>
                <td>{padron?.zonah ?? "Sin dato"}</td>
              </tr>
              <tr>
                <th>Tasa</th>
                <td>
                  {padron?.porcentaje_tasa != null
                    ? `${padron.porcentaje_tasa}%`
                    : "Sin dato"}
                </td>
              </tr>
            </tbody>
          </table>
        )}
        {tab === "propietarios" && (
          <div>
            {propietariosLoading && (
              <p className="cm-muted-inline">Cargando propietarios…</p>
            )}

            {propietariosError && (
              <p className="cm-muted-inline">Error: {propietariosError}</p>
            )}

            {!propietariosLoading && !propietariosError && propietarios.length === 0 && (
              <p className="cm-muted-inline">Sin propietarios registrados.</p>
            )}

            {!propietariosLoading && !propietariosError && propietarios.length > 0 && (
              <table className="cm-kv-table">
                <tbody>
                  {propietarios.map((p) => (
                    <tr key={p.id_predio_propietario}>
                      <th>{p.tipo_titularidad}</th>
                      <td>
                        <strong>{p.nombre_completo}</strong>
                        <br />
                        <span className="muted">
                          {p.porcentaje_propiedad}% — RFC: {p.rfc ?? "Sin dato"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <th>Total</th>
                    <td>{propietariosTotal}%</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        )}
                {tab === "expediente" && (
          <>
            {expedienteLoading ? (
              <p className="cm-muted-inline">Cargando expediente...</p>
            ) : expediente ? (
              <table className="cm-kv-table">
                <tbody>
                  <tr>
                    <th>ID Expediente</th>
                    <td>{expediente.id}</td>
                  </tr>
                  <tr>
                    <th>Estado</th>
                    <td>{expediente.estado}</td>
                  </tr>
                  <tr>
                    <th>Fecha creación</th>
                    <td>{new Date(expediente.fecha_creacion).toLocaleDateString()}</td>
                  </tr>
                  <tr>
                    <th>Última actualización</th>
                    <td>{new Date(expediente.fecha_actualizacion).toLocaleDateString()}</td>
                  </tr>
                  <tr>
                    <th>Observaciones</th>
                    <td>{expediente.observaciones ?? "Sin observaciones"}</td>
                  </tr>
                  <tr>
                    <th>Condominio</th>
                    <td>{padron?.condominio ?? "Sin dato"}</td>
                  </tr>
                  <tr>
                    <th>Sup. física</th>
                    <td>
                      {padron?.sup_fisica != null
                        ? `${padron.sup_fisica} m²`
                        : "Sin dato"}
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="cm-muted-inline">No existe expediente.</p>
            )}
          </>
             )}   
             {tab === "historial" && (
          <>
            {historialLoading ? (
              <p className="cm-muted-inline">Cargando historial...</p>
            ) : historial.length > 0 ? (
              <table className="cm-kv-table">
                <tbody>
                  {historial.map((h) => (
                    <tr key={h.id}>
                      <th>{h.tipo_evento}</th>
                      <td>
                        <strong>
                          {new Date(h.fecha_evento).toLocaleDateString()}
                        </strong>
                        <br />
                        <span className="muted">
                          {h.descripcion ?? "Sin descripción"}
                        </span>
                        <br />
                        <span className="muted">
                          Usuario: {h.usuario ?? "Sin dato"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="cm-muted-inline">Sin historial registrado.</p>
            )}
          </>
        )}
                {tab === "movimientos" && (
          <>
            {movimientosLoading ? (
              <p className="cm-muted-inline">Cargando movimientos...</p>
            ) : movimientos.length > 0 ? (
              <table className="cm-kv-table">
                <tbody>
                  {movimientos.map((m) => (
                    <tr key={m.id}>
                      <th>{m.folio}</th>
                      <td>
                        <strong>{m.tipo_movimiento}</strong>
                        <br />
                        Estado: {m.estado}
                        <br />
                        <span className="muted">
                          {m.descripcion ?? "Sin descripción"}
                        </span>
                        <br />
                        <span className="muted">
                          Usuario: {m.usuario_captura ?? "Sin dato"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="cm-muted-inline">Sin movimientos registrados.</p>
            )}
          </>
        )}
        {tab === "ubicacion" && (
          <table className="cm-kv-table">
            <tbody>
              <tr>
                <th>Delegación</th>
                <td>{padron?.delegacion ?? "Sin dato"}</td>
              </tr>
              <tr>
                <th>Colonia</th>
                <td>{padron?.colonia ?? cartography?.colony ?? "Sin dato"}</td>
              </tr>
              <tr>
                <th>Calle</th>
                <td>
                  {[padron?.calle, padron?.numof, padron?.numint, padron?.letra]
                    .filter(Boolean)
                    .join(" ") || cartography?.address || "Sin dato"}
                </td>
              </tr>
              <tr>
                <th>Uso de suelo</th>
                <td>{padron?.descripcion_uso ?? cartography?.land_use ?? "Sin dato"}</td>
              </tr>
              <tr>
                <th>Sup. documental</th>
                <td>
                  {padron?.sup_documental != null
                    ? `${padron.sup_documental} m²`
                    : "Sin dato"}
                </td>
              </tr>
            </tbody>
          </table>
        )}
        {tab === "adeudos" && (
          <table className="cm-kv-table">
            <tbody>
              <tr>
                <th>Adeudo 2026</th>
                <td>{formatMoney(padron?.adeudo_2026, currency)}</td>
              </tr>
              <tr>
                <th>Adeudo total</th>
                <td>{formatMoney(padron?.adeudo_total, currency)}</td>
              </tr>
            </tbody>
          </table>
        )}
        {tab === "docs" && (
          <p className="cm-muted-inline">
            Documentos digitalizados — disponible en una versión posterior.
          </p>
        )}
      </div>
    </div>
  );
}
