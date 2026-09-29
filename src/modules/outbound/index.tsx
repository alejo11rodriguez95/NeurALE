import { useSearchParams } from 'react-router-dom'

import { DockRoutesView } from '@/modules/outbound/dock-routes/DockRoutesView'
import { OutboundHome } from '@/modules/outbound/OutboundHome'
import { QualityIncidentsView } from '@/modules/outbound/quality/QualityIncidentsView'
import { TacticalCaptureView } from '@/modules/dashboard/tactical/TacticalCaptureView'
import { TACTICAL_VIEW } from '@/modules/dashboard/tactical/TacticalModuleOption'
import { isViewDenied } from '@/modules/admin/lib/accessLevels'
import { useAuth } from '@/shared/auth/AuthContext'
import { ModuleScreen } from '@/shared/components/ModuleScreen'
import { MODULES } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'outbound')!

/**
 * Punto de entrada de Outbound. La navegación entre las opciones del módulo
 * (menú, Control de Calidad, Gestión de Rutas) se maneja con `?view=` dentro
 * de esta misma ruta — así no hace falta tocar `routes.tsx` cada vez que se
 * agrega una opción nueva al módulo.
 *
 * `?view=` directo se protege además con `isViewDenied` (agregado
 * 2026-09-29 — ver ARCHITECTURE.md → "Niveles de acceso (catálogo
 * dinámico)" → "Ampliación 2026-09-29 (cuarta parte)"); el filtro de cada
 * tarjeta vive en `OutboundHome.tsx`.
 */
export default function OutboundModule() {
  const { adminUser } = useAuth()
  const [params, setParams] = useSearchParams()
  const view = params.get('view')
  const denied = view ? isViewDenied(adminUser, 'outbound', view) : false

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
          {denied ? (
            <p className="text-sm text-white/55">Tu nivel de acceso no tiene esta pantalla habilitada.</p>
          ) : (
            <>
              {view === 'calidad' ? <QualityIncidentsView /> : null}
              {view === TACTICAL_VIEW ? <TacticalCaptureView moduleId="outbound" /> : null}
              {view === 'rutas' ? <DockRoutesView /> : null}
            </>
          )}
        </div>
      ) : (
        <OutboundHome onNavigate={goTo} />
      )}
    </ModuleScreen>
  )
}
