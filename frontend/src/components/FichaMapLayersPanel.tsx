import type { BaseMapId } from "./CadastralSidebar";
import {
  layerAccentClass,
  layerRole,
  type LayerRole,
} from "../config/mapLayers";
import type { GeonodeLayer } from "../types/config";
import { BASE_MAP_OPTIONS } from "../map/wms";

export type FichaPlanoLayerId =
  | "highlight"
  | "measure-free"
  | "construcciones-vector"
  | string;

export interface FichaPlanoLayerRow {
  id: FichaPlanoLayerId;
  title: string;
  role: LayerRole | "highlight";
  visible: boolean;
  opacity: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  rows: FichaPlanoLayerRow[];
  baseMap: BaseMapId;
  onBaseMapChange: (id: BaseMapId) => void;
  onToggle: (id: FichaPlanoLayerId, visible: boolean) => void;
  onOpacity: (id: FichaPlanoLayerId, value: number) => void;
  onMove: (id: FichaPlanoLayerId, dir: -1 | 1) => void;
}

export default function FichaMapLayersPanel({
  open,
  onClose,
  rows,
  baseMap,
  onBaseMapChange,
  onToggle,
  onOpacity,
  onMove,
}: Props) {
  if (!open) return null;

  return (
    <div className="ficha-capas-panel" role="dialog" aria-label="Capas del plano">
      <div className="ficha-capas-panel-head">
        <strong>Capas del plano</strong>
        <button
          type="button"
          className="ficha-capas-close"
          onClick={onClose}
          aria-label="Cerrar capas"
        >
          ×
        </button>
      </div>

      <ul className="ficha-capas-lista">
        {rows.map((row, idx) => {
          const pct = Math.round(row.opacity * 100);
          const accent =
            row.role === "highlight"
              ? "cm-layer-accent cm-layer-accent-predios"
              : `cm-layer-accent ${layerAccentClass(row.role as LayerRole)}`;
          const isFixedLayer =
            row.id === "highlight" ||
            row.id === "cotas" ||
            row.id === "vertices";
          return (
            <li key={row.id} className="ficha-capas-item">
              <label className="ficha-capas-item-top">
                <input
                  type="checkbox"
                  checked={row.visible}
                  onChange={(e) => onToggle(row.id, e.target.checked)}
                />
                <span className={`ficha-capas-accent ${accent}`} aria-hidden />
                <span className="ficha-capas-nombre">{row.title}</span>
                <span className="ficha-capas-pct">{pct}%</span>
              </label>
              <input
                type="range"
                className="ficha-capas-slider"
                min={0}
                max={100}
                value={pct}
                disabled={!row.visible || isFixedLayer}
                onChange={(e) =>
                  onOpacity(row.id, Number(e.target.value) / 100)
                }
              />
              <div className="ficha-capas-order">
                <button
                  type="button"
                  disabled={idx === 0 || isFixedLayer}
                  onClick={() => onMove(row.id, -1)}
                  title="Subir capa"
                >
                  ↑ Subir
                </button>
                <button
                  type="button"
                  disabled={idx === rows.length - 1 || isFixedLayer}
                  onClick={() => onMove(row.id, 1)}
                  title="Bajar capa"
                >
                  ↓ Bajar
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="ficha-capas-basemap">
        <strong>Mapas base</strong>
        {BASE_MAP_OPTIONS.map((opt) => (
          <label key={opt.id} className="ficha-capas-basemap-opt">
            <input
              type="radio"
              name="ficha-basemap"
              checked={baseMap === opt.id}
              onChange={() => onBaseMapChange(opt.id)}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export function buildFichaLayerOrder(layers: GeonodeLayer[]): FichaPlanoLayerId[] {
  const wms = [...layers]
    .sort((a, b) => {
      const rank = (r: ReturnType<typeof layerRole>) =>
        r === "predios" ? 0 : r === "colonias" ? 1 : 2;
      return rank(layerRole(a)) - rank(layerRole(b));
    })
    .map((l) => l.id);
  return ["highlight", ...wms];
}

export function buildFichaConstruccionLayerOrder(
  layers: GeonodeLayer[]
): FichaPlanoLayerId[] {
  const wms = [...layers]
    .sort((a, b) => {
      const rank = (r: ReturnType<typeof layerRole>) => {
        if (r === "predios") return 0;
        if (r === "construcciones") return 1;
        if (r === "colonias") return 2;
        return 3;
      };
      return rank(layerRole(a)) - rank(layerRole(b));
    })
    .map((l) => l.id);
  return ["highlight", ...wms, "construcciones-vector", "measure-free"];
}

export function layerTitle(
  id: FichaPlanoLayerId,
  layers: GeonodeLayer[]
): string {
  if (id === "highlight") return "Predio consultado";
  if (id === "measure-free") return "Medición libre";
  if (id === "construcciones-vector") return "Construcciones (vector)";
  return layers.find((l) => l.id === id)?.title ?? id;
}
