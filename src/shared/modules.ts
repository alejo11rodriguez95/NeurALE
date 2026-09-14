/**
 * Registro único de módulos de negocio (ver ARCHITECTURE.md → "Módulos y orden de
 * trabajo"). Este archivo es la fuente de verdad para: las tarjetas del Núcleo
 * Neuronal, la barra de navegación, y las rutas en `routes.tsx`.
 *
 * Convención para módulos nuevos: agrega su entrada aquí (no hardcodees rutas o
 * labels en otros componentes), y crea `src/modules/<id>/index.tsx` como punto de
 * entrada del módulo — ese es el archivo que el chat de ese módulo va a construir.
 */

export type ModuleId =
  | 'inbound'
  | 'storage'
  | 'picking'
  | 'outbound'
  | 'inventory'

export type AnyModuleId = ModuleId | 'dashboard'

export interface ModuleDef<Id extends AnyModuleId = AnyModuleId> {
  id: Id
  path: string
  label: string
  description: string
}

/** Los 5 módulos de negocio que rodean el Núcleo Neuronal en la pantalla de inicio. */
export const MODULES: ModuleDef[] = [
  {
    id: 'inbound',
    path: '/inbound',
    label: 'Inbound',
    description: 'Recepción de mercancía entrante al centro de distribución.',
  },
  {
    id: 'storage',
    path: '/storage',
    label: 'Storage',
    description: 'Ubicación, acomodo y almacenamiento de mercancía.',
  },
  {
    id: 'picking',
    path: '/picking',
    label: 'Picking',
    description: 'Preparación y surtido de pedidos.',
  },
  {
    id: 'outbound',
    path: '/outbound',
    label: 'Outbound',
    description: 'Despacho y salida de mercancía.',
  },
  {
    id: 'inventory',
    path: '/inventory',
    label: 'Inventory',
    description: 'Control y ajustes de inventario.',
  },
]

/**
 * Dashboard Neuronal (módulo 6): visualización en tiempo real de todos los módulos,
 * para jefes de área y gerencia (rol `gerencia`). No aparece como tarjeta alrededor
 * del Núcleo Neuronal — se accede aparte, según el rol del usuario.
 */
export const DASHBOARD_MODULE: ModuleDef<'dashboard'> = {
  id: 'dashboard',
  path: '/dashboard',
  label: 'Dashboard Neuronal',
  description:
    'Visualización en tiempo real de todos los módulos, para jefes de área y gerencia.',
}

export const ALL_MODULES: ModuleDef[] = [...MODULES, DASHBOARD_MODULE]
