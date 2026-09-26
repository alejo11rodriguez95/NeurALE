import { useSearchParams } from 'react-router-dom'

import { TacticalCaptureView } from '@/modules/dashboard/tactical/TacticalCaptureView'
import { TACTICAL_VIEW, TacticalModuleOption } from '@/modules/dashboard/tactical/TacticalModuleOption'
import { ModuleScreen } from '@/shared/components/ModuleScreen'
import { MODULES } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'inventory')!

/**
 * Punto de entrada de Inventory. Por ahora su única opción es "Diálogo Táctico"
 * (agregada desde el chat del Dashboard Neuronal — ver ARCHITECTURE.md). El
 * chat propio de Inventory agrega sus pantallas como tarjetas nuevas en este menú,
 * con el mismo patrón `?view=` que Outbound, sin reemplazar el archivo.
 */
export default function InventoryModule() {
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
            ← Volver a Inventory
          </button>
          {view === TACTICAL_VIEW ? <TacticalCaptureView moduleId="inventory" /> : null}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <TacticalModuleOption moduleId="inventory" onNavigate={goTo} />
        </div>
      )}
    </ModuleScreen>
  )
}
