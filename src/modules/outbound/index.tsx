import { useSearchParams } from 'react-router-dom'

import { DockRoutesView } from '@/modules/outbound/dock-routes/DockRoutesView'
import { OutboundHome } from '@/modules/outbound/OutboundHome'
import { QualityIncidentsView } from '@/modules/outbound/quality/QualityIncidentsView'
import { TacticalCaptureView } from '@/modules/dashboard/tactical/TacticalCaptureView'
import { TACTICAL_VIEW } from '@/modules/dashboard/tactical/TacticalModuleOption'
import { ModuleScreen } from '@/shared/components/ModuleScreen'
import { MODULES } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'outbound')!

/**
 * Punto de entrada de Outbound. La navegación entre las opciones del módulo
 * (menú, Control de Calidad, Gestión de Rutas) se maneja con `?view=` dentro
 * de esta misma ruta — así no hace falta tocar `routes.tsx` cada vez que se
 * agrega una opción nueva al módulo.
 */
export default function OutboundModule() {
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
            ← Volver a Outbound
          </button>
          {view === 'calidad' ? <QualityIncidentsView /> : null}
          {view === TACTICAL_VIEW ? <TacticalCaptureView moduleId="outbound" /> : null}
          {view === 'rutas' ? <DockRoutesView /> : null}
        </div>
      ) : (
        <OutboundHome onNavigate={goTo} />
      )}
    </ModuleScreen>
  )
}
