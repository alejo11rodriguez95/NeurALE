import { useSearchParams } from 'react-router-dom'

import { OptionCard } from '@/modules/dashboard/components/OptionCard'
import { TacticalCaptureView } from '@/modules/dashboard/tactical/TacticalCaptureView'
import { TACTICAL_VIEW, TacticalModuleOption } from '@/modules/dashboard/tactical/TacticalModuleOption'
import { isViewDenied } from '@/modules/admin/lib/accessLevels'
import { IsqFollowUpView } from '@/modules/storage/isq/IsqFollowUpView'
import { useAuth } from '@/shared/auth/AuthContext'
import { ModuleScreen } from '@/shared/components/ModuleScreen'
import { MODULES } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'inbound')!

/**
 * Punto de entrada de Inbound. Menú de opciones con el patrón `?view=`:
 *   - "Diálogo Táctico" (agregada desde el chat del Dashboard Neuronal)
 *   - "ISQ" (agregada desde el chat de Storage, 2026-09-27): seguimiento de las
 *     incidencias Inbound-Storage Quality que reporta Storage. La pantalla y
 *     los datos son de Storage (`src/modules/storage/isq/`).
 * El chat propio de Inbound agrega sus pantallas como tarjetas nuevas en este
 * menú, sin reemplazar el archivo ni quitar estas dos.
 *
 * Cada tarjeta y cada `?view=` directo se protegen además con `isViewDenied`
 * (agregado 2026-09-29 — ver ARCHITECTURE.md → "Niveles de acceso (catálogo
 * dinámico)" → "Ampliación 2026-09-29 (cuarta parte)"): un nivel de acceso en
 * modo "opciones específicas" que marcó "Sin acceso" para una de estas
 * pantallas no debe poder entrar ni por URL directa, no solo no ver la
 * tarjeta.
 */
export default function InboundModule() {
  const { adminUser } = useAuth()
  const [params, setParams] = useSearchParams()
  const view = params.get('view')
  const denied = view ? isViewDenied(adminUser, 'inbound', view) : false

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
            ← Volver a Inbound
          </button>
          {denied ? (
            <p className="text-sm text-white/55">Tu nivel de acceso no tiene esta pantalla habilitada.</p>
          ) : (
            <>
              {view === TACTICAL_VIEW ? <TacticalCaptureView moduleId="inbound" /> : null}
              {view === 'isq' ? <IsqFollowUpView /> : null}
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {!isViewDenied(adminUser, 'inbound', 'isq') ? (
            <OptionCard
              color={moduleDef.color}
              icon="📦"
              title="ISQ · Inbound-Storage Quality"
              description="Incidencias que Storage reporta al almacenar lo recibido. Asigna responsable, registra causa y acción correctiva, y ciérralas."
              onClick={() => goTo('isq')}
            />
          ) : null}
          <TacticalModuleOption moduleId="inbound" onNavigate={goTo} />
        </div>
      )}
    </ModuleScreen>
  )
}
