import type { PredialAdeudoResponse } from "../../types/predial";

interface Props {
  data: PredialAdeudoResponse | null;
  loading?: boolean;
}

export default function PredialAdeudoBadge({ data, loading }: Props) {
  if (loading) {
    return <span className="badge bg-secondary">Consultando adeudo…</span>;
  }

  if (!data) {
    return <span className="badge bg-light text-dark">Sin consultar</span>;
  }

  if (data.estatus_consulta === "con_adeudo") {
    return (
      <span className="badge bg-warning text-dark">
        👁 Con adeudo:{" "}
        {data.total_a_pagar.toLocaleString("es-MX", {
          style: "currency",
          currency: "MXN",
        })}
      </span>
    );
  }

  if (data.estatus_consulta === "sin_adeudo") {
    return <span className="badge bg-success">Sin adeudo</span>;
  }

  if (data.estatus_consulta === "no_encontrado") {
    return <span className="badge bg-success">Sin adeudo</span>;
  }

  return <span className="badge bg-success">Sin adeudo</span>;
}
