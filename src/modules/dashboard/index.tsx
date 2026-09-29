import { useSearchParams } from 'react-router-dom'

import { DashboardHome } from '@/modules/dashboard/DashboardHome'
import { TacticalBoard } from '@/modules/dashboard/tactical/TacticalBoard'
import { isViewDenied } from '@/modules/admin/lib/accessLevels'
import { IsqDashboard } from '@/modules/storage/isq/IsqDashboard'
import { useAuth } from '@/shared/auth/AuthContext'
import { ModuleScreen } from '@/shared/components/ModuleScreen'
import { DASHBOARD_MODULE, MODULES } from '@/shared/modules'

const STORAGE_COLOR = MODULES.find((m) => m.id === 'storage')!.color

/**
 * Punto de entrada del Dashboard Neuronal (hemisferio derecho del cerebro).
 * Navegación interna por `?view=` (mismo patrón que Outbound/Picking/Admin).
 *
 * - sin `view`       → menú de opciones
 * - `view=dialogo`   → Diálogo Táctico CD Nneo, a pantalla completa (capa fija
 *                      sobre la app, sin nav — pensado para proyectar en la
 *                      reunión de turno)
 * - `view=isq`       → ISQ · Inbound-Storage: el mismo Dash Storage del módulo
 *                      Storage (agregado desde el chat de Storage, 2026-09-27)
 *
 * El Dashboard Neuronal es un destino más como los demás (agregado
 * 2026-09-29 — ver ARCHITECTURE.md → "Niveles de acceso (catálogo
 * dinámico)" → "Ampliación 2026-09-29 (cuarta parte)"): `?view=` directo se
 * protege igual con `isViewDenied`, incluida la vista `dialogo` (que se sale
 * de `ModuleScreen` a pantalla completa, por eso se chequea antes de ese
 * `return` temprano).
 */
export default function DashboardModule() {
  const { adminUser } = useAuth()
  const [params, setParams] = useSearchParams()
  const view = params.get('view')

  function goTo(next: string | null) {
    if (next) setParams({ view: next })
    else setParams({})
  }

  if (view === 'dialogo') {
    if (isViewDenied(adminUser, 'dashboard', 'dialogo')) {
      return (
        <ModuleScreen module={DASHBOARD_MODULE}>
          <p className="text-sm text-white/55">Tu nivel de acceso no tiene esta pantalla habilitada.</p>
        </ModuleScreen>
      )
    }
    return <TacticalBoard onExit={() => goTo(null)} />
  }

  return (
    <ModuleScreen module={DASHBOARD_MODULE}>
      {view === 'isq' ? (
        isViewDenied(adminUser, 'dashboard', 'isq') ? (
          <p className="text-sm text-white/55">Tu nivel de acceso no tiene esta pantalla habilitada.</p>
        ) : (
          <div>
            <button onClick={() => goTo(null)} className="mb-6 text-sm text-white/50 hover:text-white/80">
              ← Volver al Dashboard Neuronal
            </button>
            {/* Color de Storage (no el rojo del Dashboard): los datos son de Storage y el rojo se lee como alerta. */}
            <IsqDashboard color={STORAGE_COLOR} title="ISQ · Inbound-Storage" />
          </div>
        )
      ) : (
        <DashboardHome onNavigate={goTo} />
      )}
    </ModuleScreen>
  )
}
