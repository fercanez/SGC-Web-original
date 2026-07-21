import type { PredialAdeudoResponse } from "../../types/predial";

interface Props {
  open: boolean;
  onClose: () => void;
  data: PredialAdeudoResponse | null;
}

function money(value: number) {
  return value.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });
}

function estatusLabel(value: string) {
  switch (value) {
    case "con_adeudo":
      return "Con adeudo";
    case "sin_adeudo":
      return "Sin adeudo";
    case "no_encontrado":
      return "No encontrado";
    case "error":
      return "Error";
    default:
      return value;
  }
}

export default function PredialAdeudoModal({ open, onClose, data }: Props) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="predial-adeudo-title"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.45)",
        zIndex: 5000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: "12px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          width: "900px",
          maxWidth: "95vw",
          maxHeight: "90vh",
          overflow: "auto",
          padding: "20px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h3 id="predial-adeudo-title" style={{ margin: 0 }}>
            Detalle de adeudo predial
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "1px solid #ccc",
              background: "#fff",
              borderRadius: "8px",
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            Cerrar
          </button>
        </div>

        {!data ? (
          <p>No hay información disponible.</p>
        ) : (
          <>
            <div style={{ marginBottom: "16px", lineHeight: 1.7 }}>
              <div><strong>Clave catastral:</strong> {data.clave_catastral}</div>
              <div><strong>Estatus:</strong> {estatusLabel(data.estatus_consulta)}</div>
              <div><strong>Periodo:</strong> {data.periodo ?? "N/D"}</div>
              <div><strong>Consultado en:</strong> {data.consultado_en || "N/D"}</div>
              <div><strong>Fuente:</strong> {data.fuente}</div>
            </div>

            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
              }}
            >
              <tbody>
                <tr><th style={th}>Subtotal de importes</th><td style={td}>{money(data.subtotal_importes)}</td></tr>
                <tr><th style={th}>Sobretasa seguridad pública</th><td style={td}>{money(data.sobretasa_seguridad_publica)}</td></tr>
                <tr><th style={th}>Fomento deportivo</th><td style={td}>{money(data.fomento_deportivo)}</td></tr>
                <tr><th style={th}>Rezago fomento deportivo</th><td style={td}>{money(data.rezago_fomento_deportivo)}</td></tr>
                <tr><th style={th}>Servicio alumbrado</th><td style={td}>{money(data.servicio_alumbrado)}</td></tr>
                <tr><th style={th}>Recargos</th><td style={td}>{money(data.recargos)}</td></tr>
                <tr><th style={th}>Multas</th><td style={td}>{money(data.multas)}</td></tr>
                <tr><th style={th}>Gastos de ejecución</th><td style={td}>{money(data.gastos_ejecucion)}</td></tr>
                <tr><th style={th}>Descuentos</th><td style={td}>{money(data.descuentos)}</td></tr>
                <tr><th style={th}>Donativo Cruz Roja</th><td style={td}>{money(data.donativo_cruz_roja)}</td></tr>
                <tr><th style={th}>Donativo Bomberos</th><td style={td}>{money(data.donativo_bomberos)}</td></tr>
                <tr>
                  <th style={{ ...th, background: "#fff3cd" }}>Total a pagar</th>
                  <td style={{ ...td, background: "#fff3cd", fontWeight: 700 }}>
                    {money(data.total_a_pagar)}
                  </td>
                </tr>
              </tbody>
            </table>

            {data.mensaje && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "#f1f3f5",
                }}
              >
                {data.mensaje}
              </div>
            )}

            {data.error && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "#f8d7da",
                  color: "#842029",
                }}
              >
                {data.error}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px",
  border: "1px solid #ddd",
  background: "#f8f9fa",
  width: "60%",
};

const td: React.CSSProperties = {
  padding: "10px",
  border: "1px solid #ddd",
};
