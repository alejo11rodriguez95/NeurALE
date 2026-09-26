import { useSearchParams } from 'react-router-dom'

import { PickingHome } from '@/modules/picking/PickingHome'
import { QualityManagementView } from '@/modules/picking/quality-control/QualityManagementView'
import { TacticalCaptureView } from '@/modules/dashboard/tactical/TacticalCaptureView'
import { TACTICAL_VIEW } from '@/modules/dashboard/tactical/TacticalModuleOption'
import { ModuleScreen } from '@/shared/components/ModuleScreen'
import { MODULES } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'picking')!

/**
 * Punto de entrada de Picking. Se agregó "Gestión de Control de Calidad"
 * desde el chat de Outbound (ver ARCHITECTURE.md — es la única pantalla de
 * negocio de Picking hasta que se trabaje su propio chat). Usa el mismo
 * patrón de navegación por `?view=` que Outbound.
 */
export default function PickingModule() {
  const [params, setParams] = useSearchParams()
  const view = params.get('view')

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
          {view === 'calidad' ? <QualityManagementView /> : null}
          {view === TACTICAL_VIEW ? <TacticalCaptureView moduleId="picking" /> : null}
        </div>
      ) : (
        <PickingHome onNavigate={goTo} />
      )}
    </ModuleScreen>
  )
}
