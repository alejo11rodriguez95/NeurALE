/**
 * Registro único de módulos de negocio (ver ARCHITECTURE.md → "Módulos y orden de
 * trabajo"). Este archivo es la fuente de verdad para: los nodos de la vía neuronal
 * del Núcleo Neuronal, la barra de navegación, las rutas en `routes.tsx` y el color
 * de acento con el que se tiñe cada módulo por dentro.
 *
 * Convención para módulos nuevos: agrega su entrada aquí (no hardcodees rutas,
 * labels ni colores en otros componentes), y crea `src/modules/<id>/index.tsx` como
 * punto de entrada del módulo — ese es el archivo que el chat de ese módulo va a
 * construir.
 */

export type ModuleId =
  | 'inbound'
  | 'storage'
  | 'picking'
  | 'outbound'
  | 'inventory'

export type AnyModuleId = ModuleId | 'dashboard' | 'admin'

export interface ModuleDef<Id extends AnyModuleId = AnyModuleId> {
  id: Id
  path: string
  label: string
  /** Frase corta que acompaña al nombre en el Núcleo Neuronal. */
  tagline: string
  description: string
  /** Color de acento del módulo (hex). Tiñe su nodo en el hub y su pantalla interna. */
  color: string
  /**
   * Tono claro del acento, para bordes y luces. Solo lo usan las dos mitades del
   * cerebro, donde hace falta separar el cuerpo (oscuro) del brillo (claro).
   */
  glow?: string
  /**
   * `false` mientras la sección todavía no tiene ruta ni pantalla: se muestra en el
   * Núcleo Neuronal pero no navega. Distinto de "sin acceso" (que dependerá del rol).
   */
  available?: boolean
}

/** Los 5 módulos de negocio que cuelgan de la vía neuronal, de arriba hacia abajo. */
export const MODULES: ModuleDef<ModuleId>[] = [
  {
    id: 'inbound',
    path: '/inbound',
    label: 'Inbound',
    tagline: 'Entrada de señal',
    description: 'Recepción de mercancía entrante al centro de distribución.',
    color: '#22d3ee',
  },
  {
    id: 'storage',
    path: '/storage',
    label: 'Storage',
    tagline: 'Memoria',
    description: 'Ubicación, acomodo y almacenamiento de mercancía.',
    color: '#34d399',
  },
  {
    id: 'picking',
    path: '/picking',
    label: 'Picking',
    tagline: 'Impulso motor',
    description: 'Preparación y surtido de pedidos.',
    color: '#fbbf24',
  },
  {
    id: 'outbound',
    path: '/outbound',
    label: 'Outbound',
    tagline: 'Salida de señal',
    description: 'Despacho y salida de mercancía.',
    // Rosa, no rojo: el hemisferio derecho ya ocupa el rojo de la marca.
    color: '#f472b6',
  },
  {
    id: 'inventory',
    path: '/inventory',
    label: 'Inventory',
    tagline: 'Equilibrio',
    description: 'Control y ajustes de inventario.',
    color: '#a78bfa',
  },
]

/**
 * Dashboard Neuronal (módulo gerencial): es el cerebro que corona el Núcleo
 * Neuronal. Visualización en tiempo real de todos los módulos, para jefes de área y
 * gerencia (rol `gerencia`).
 */
export const DASHBOARD_MODULE: ModuleDef<'dashboard'> = {
  id: 'dashboard',
  path: '/dashboard',
  label: 'Dashboard Neuronal',
  tagline: 'Corteza · Gerencia',
  description:
    'Visualización en tiempo real de todos los módulos, para jefes de área y gerencia.',
  // Hemisferio derecho: rojo VIDRI.
  color: '#e30613',
  glow: '#ff4d5e',
}

/**
 * Configuraciones y Administradores: el hemisferio IZQUIERDO del cerebro.
 * Gestión de administradores y usuarios, catálogos compartidos y configuración
 * general de la plataforma.
 *
 * `path` es provisional: lo define el chat de Configuraciones y Administradores.
 * Mientras `available` sea false, el hemisferio izquierdo se ve y responde al hover
 * pero no navega — cuando ese chat cree su ruta, basta poner `available: true` (y
 * ajustar `path` si eligió otro) para cablearlo.
 */
export const ADMIN_SECTION: ModuleDef<'admin'> = {
  id: 'admin',
  path: '/admin',
  label: 'Configuraciones y Administradores',
  tagline: 'Corteza · Administración',
  description:
    'Gestión de administradores y usuarios, catálogos compartidos y configuración general de la plataforma.',
  // Hemisferio izquierdo: azul.
  color: '#2f86d8',
  glow: '#7cc4fb',
  available: true,
}

export const ALL_MODULES: ModuleDef<AnyModuleId>[] = [
  ...MODULES,
  DASHBOARD_MODULE,
  ADMIN_SECTION,
]

/** Convierte un color hex del registro a rgba con la opacidad indicada. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
