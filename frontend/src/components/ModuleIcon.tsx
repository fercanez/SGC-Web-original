/** Iconos monocromáticos guinda (#703341) — un glifo distinto por módulo. */

export type ModuleIconId =
  | "gestion-catastral"
  | "movimientos"
  | "zonas-homogeneas"
  | "condominios"
  | "modulo-cartografico"
  | "administracion"
  | "portal-completo";

const COLOR = "currentColor";

export default function ModuleIcon({
  id,
  className,
  size = 16,
}: {
  id: ModuleIconId;
  className?: string;
  size?: number;
}) {
  const props = {
    className,
    width: size,
    height: size,
    viewBox: "0 0 32 32",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true as const,
  };

  switch (id) {
    case "gestion-catastral":
      return (
        <svg {...props}>
          <path
            d="M4 24V8l12-4 12 4v16l-12 4-12-4Z"
            stroke={COLOR}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M16 4v24M4 8l12 4 12-4M4 24l12-4 12 4"
            stroke={COLOR}
            strokeWidth="1.4"
          />
        </svg>
      );
    case "movimientos":
      return (
        <svg {...props}>
          <rect
            x="6"
            y="4"
            width="16"
            height="22"
            rx="1.5"
            stroke={COLOR}
            strokeWidth="1.6"
          />
          <path
            d="M10 10h10M10 14h10M10 18h6"
            stroke={COLOR}
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path
            d="M20 20l5 5M20 25l5-5"
            stroke={COLOR}
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case "zonas-homogeneas":
      return (
        <svg {...props}>
          <path
            d="M5 26V14M12 26V8M19 26V18M26 26V11"
            stroke={COLOR}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M4 26h24"
            stroke={COLOR}
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      );
    case "condominios":
      return (
        <svg {...props}>
          <rect
            x="5"
            y="10"
            width="10"
            height="18"
            stroke={COLOR}
            strokeWidth="1.6"
          />
          <rect
            x="17"
            y="6"
            width="10"
            height="22"
            stroke={COLOR}
            strokeWidth="1.6"
          />
          <path
            d="M8 14h4M8 18h4M20 12h4M20 16h4M20 20h4"
            stroke={COLOR}
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "modulo-cartografico":
      return (
        <svg {...props}>
          <path
            d="M6 26 16 6l10 20"
            stroke={COLOR}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M11 18h10"
            stroke={COLOR}
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx="16" cy="6" r="1.5" fill={COLOR} />
        </svg>
      );
    case "administracion":
      return (
        <svg {...props}>
          <circle cx="16" cy="16" r="5" stroke={COLOR} strokeWidth="1.6" />
          <path
            d="M16 4v3M16 25v3M4 16h3M25 16h3M7.5 7.5l2.1 2.1M22.4 22.4l2.1 2.1M7.5 24.5l2.1-2.1M22.4 9.6l2.1-2.1"
            stroke={COLOR}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case "portal-completo":
      return (
        <svg {...props}>
          <rect
            x="4"
            y="6"
            width="24"
            height="16"
            rx="1.5"
            stroke={COLOR}
            strokeWidth="1.6"
          />
          <path d="M4 22h24" stroke={COLOR} strokeWidth="1.6" />
          <path
            d="M13 26h6"
            stroke={COLOR}
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="16" cy="14" r="2" fill={COLOR} />
        </svg>
      );
    default:
      return null;
  }
}
