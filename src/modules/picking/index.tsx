import { useSearchParams } from 'react-router-dom'

import { PickingHome } from '@/modules/picking/PickingHome'
import { QualityManagementView } from '@/modules/picking/quality-control/QualityManagementView'
import { TacticalCaptureView } from '@/modules/dashboard/tactical/TacticalCaptureView'
import { TACTICAL_VIEW } from '@/modules/dashboard/tactical/TacticalModuleOption'
import { isViewDenied } from '@/modules/admin/lib/accessLevels'
import { useAuth } from '@/shared/auth/AuthContext'
import { ModuleScreen } from '@/shared/components/ModuleScreen'
import { MODULES } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'picking')!

/**
 * Punto de entrada de Picking. Se agregó "Gestión de Control de Calidad"
 * desde el chat de Outbound (ver ARCHITECTURE.md — es la única pantalla de
 * negocio de Picking hasta que se trabaje su propio chat). Usa el mismo
 * patrón de navegación por `?view=` que Outbound.
 *
 * `?view=` directo se protege además con `isViewDenied` (agregado
 * 2026-09-29 — ver ARCHITECTURE.md → "Niveles de acceso (catálogo
 * dinámico)" → "Ampliación 2026-09-29 (cuarta parte)"); el filtro de la
 * tarjeta en sí vive en `PickingHome.tsx`.
 */
export default function PickingModule() {
  const { adminUser } = useAuth()
  const [params, setParams] = useSearchParams()
  const view = params.get('view')
  const denied = view ? isViewDenied(adminUser, 'picking', view) : false

  function goTo(next: string | null) {
    if (next) setParams({ view: next })
    else setParams({})
  }

  return (
    <ModuleScreen module={moduleDef}>
      {view ? (
        <div>
          <button
            onClick={() => goTo(null)}
            className="mb-6 text-sm text-white/50 hover:text-white/80"
          >
            ← Volver a Picking
          </button>
          {denied ? (
            <p className="text-sm text-white/55">Tu nivel de acceso no tiene esta pantalla habilitada.</p>
          ) : (
            <>
              {view === 'calidad' ? <QualityManagementView /> : null}
              {view === TACTICAL_VIEW ? <TacticalCaptureView moduleId="picking" /> : null}
            </>
          )}
        </div>
      ) : (
        <PickingHome onNavigate={goTo} />
      )}
    </ModuleScreen>
  )
}
