import type { ModuleIconId } from "../components/ModuleIcon";
import type { UserInfo } from "../types/auth";

export type ModuleStatus = "available" | "coming-soon";

export interface ModuleDefinition {
  id: string;
  title: string;
  description: string;
  icon: ModuleIconId;
  /** Ruta interna React Router (sin basename). */
  route: string;
  roles: string[];
  permissions?: string[];
  status: ModuleStatus;
}

/** Catálogo alineado con el portal del SGC institucional. */
export const MODULES: ModuleDefinition[] = [
  {
    id: "gestion-catastral",
    title: "Gestión Catastral",
    description:
      "Mapa de consulta y análisis predial con ficha detallada por predio.",
    icon: "gestion-catastral",
    route: "/gestion-catastral",
    roles: [
      "admin",
      "supervisor",
      "catastro",
      "cartografia",
      "fiscalizacion",
      "consulta",
    ],
    permissions: ["dashboard.view"],
    status: "available",
  },
  {
    id: "movimientos",
    title: "Movimientos Catastrales",
    description:
      "Solicitudes, autorización y aplicación de movimientos al padrón.",
    icon: "movimientos",
    route: "/modulos/movimientos",
    roles: ["admin", "supervisor", "catastro"],
    permissions: ["cadastral.write"],
    status: "coming-soon",
  },
  {
    id: "zonas-homogeneas",
    title: "Análisis de Zonas Homogéneas",
    description: "Catálogo, evolución de valores y cédulas de zona homogénea.",
    icon: "zonas-homogeneas",
    route: "/modulos/zonas-homogeneas",
    roles: [
      "admin",
      "supervisor",
      "catastro",
      "fiscalizacion",
      "cartografia",
      "consulta",
    ],
    status: "coming-soon",
  },
  {
    id: "condominios",
    title: "Régimen en Condominio",
    description: "Consulta y análisis de condominios y unidades.",
    icon: "condominios",
    route: "/modulos/condominios",
    roles: [
      "admin",
      "supervisor",
      "catastro",
      "fiscalizacion",
      "cartografia",
      "consulta",
    ],
    status: "coming-soon",
  },
  {
    id: "modulo-cartografico",
    title: "Módulo Cartográfico",
    description:
      "Edición geométrica de predios: alta de clave, subdivisión, fusión y ajustes.",
    icon: "modulo-cartografico",
    route: "/modulos/cartografico",
    roles: ["admin", "supervisor", "cartografia"],
    permissions: ["cadastral.write", "source.write"],
    status: "coming-soon",
  },
  {
    id: "administracion",
    title: "Administración del Sistema",
    description: "Usuarios, permisos y auditoría institucional.",
    icon: "administracion",
    route: "/admin/usuarios",
    roles: ["admin"],
    permissions: ["users.read"],
    status: "available",
  },
  {
    id: "portal-completo",
    title: "Portal Integral (vista clásica)",
    description: "Acceso a todas las herramientas en el panel lateral completo.",
    icon: "portal-completo",
    route: "/gestion-catastral",
    roles: [
      "admin",
      "supervisor",
      "catastro",
      "cartografia",
      "fiscalizacion",
      "consulta",
    ],
    permissions: ["dashboard.view"],
    status: "available",
  },
];

export function canAccessModule(
  user: UserInfo | null,
  mod: ModuleDefinition
): boolean {
  if (!user) return false;
  const role = (user.role?.code ?? "").toLowerCase();
  if (role === "admin") return true;
  if (mod.roles.map((r) => r.toLowerCase()).includes(role)) return true;
  if (mod.permissions?.some((p) => user.permissions?.includes(p))) return true;
  return false;
}

export function modulesForUser(user: UserInfo | null): ModuleDefinition[] {
  return MODULES.filter((m) => canAccessModule(user, m));
}

export function getModuleById(id: string): ModuleDefinition | undefined {
  return MODULES.find((m) => m.id === id);
}
