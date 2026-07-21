export type PredialEstatusConsulta =
  | "con_adeudo"
  | "sin_adeudo"
  | "no_encontrado"
  | "error";

export interface PredialAdeudoResponse {
  clave_catastral: string;
  tiene_adeudo: boolean;
  estatus_consulta: PredialEstatusConsulta;
  periodo: string | null;
  subtotal_importes: number;
  sobretasa_seguridad_publica: number;
  fomento_deportivo: number;
  rezago_fomento_deportivo: number;
  servicio_alumbrado: number;
  recargos: number;
  multas: number;
  gastos_ejecucion: number;
  descuentos: number;
  donativo_cruz_roja: number;
  donativo_bomberos: number;
  total_a_pagar: number;
  consultado_en: string;
  fuente: string;
  mensaje?: string;
  error?: string;
}
