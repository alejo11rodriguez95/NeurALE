import { useSearchParams } from 'react-router-dom'

import { DashboardHome } from '@/modules/dashboard/DashboardHome'
import { TacticalBoard } from '@/modules/dashboard/tactical/TacticalBoard'
import { ModuleScreen } from '@/shared/components/ModuleScreen'
import { DASHBOARD_MODULE } from '@/shared/modules'

/**
 * Punto de entrada del Dashboard Neuronal (hemisferio derecho del cerebro).
 * Navegación interna por `?view=` (mismo patrón que Outbound/Picking/Admin).
 *
 * - sin `view`       → menú de opciones
 * - `view=dialogo`   → Diálogo Táctico CD Nneo, a pantalla completa (capa fija
 *                      sobre la app, sin nav — pensado para proyectar en la
 *                      reunión de turno)
 */
export default function DashboardModule() {
  const [params, setParams] = useSearchParams()
  const view = params.get('view')

  function goTo(next: string | null) {
    if (next) setParams({ view: next })
    else setParams({})
  }

  if (view === 'dialogo') return <TacticalBoard onExit={() => goTo(null)} />

  return (
    <ModuleScreen module={DASHBOARD_MODULE}>
      <DashboardHome onNavigate={goTo} />
    </ModuleScreen>
  )
}
