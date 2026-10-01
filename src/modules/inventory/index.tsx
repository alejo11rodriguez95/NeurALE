import { useSearchParams } from 'react-router-dom'

import { OptionCard } from '@/modules/dashboard/components/OptionCard'
import { TacticalCaptureView } from '@/modules/dashboard/tactical/TacticalCaptureView'
import { TACTICAL_VIEW, TacticalModuleOption } from '@/modules/dashboard/tactical/TacticalModuleOption'
import { isViewDenied } from '@/modules/admin/lib/accessLevels'
import { DamageControlView } from '@/modules/inventory/damages/DamageControlView'
import { DAMAGE_NAME, DAMAGE_VIEW } from '@/modules/inventory/damages/lib/damages'
import { useAuth } from '@/shared/auth/AuthContext'
import { ModuleScreen } from '@/shared/components/ModuleScreen'
import { MODULES } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'inventory')!

/**
 * Punto de entrada de Inventory. Menú de opciones con el patrón `?view=`:
 *   - "Control de Averías" (`?view=averias`, chat de Inventory 2026-10-01):
 *     reportes por QR, trabajo por lotes, mal manejo por departamento.
 *   - "Diálogo Táctico" (agregada desde el chat del Dashboard Neuronal — ver
 *     ARCHITECTURE.md), se conserva tal cual.
 *
 * `?view=` directo se protege además con `isViewDenied` (agregado
 * 2026-09-29 — ver ARCHITECTURE.md → "Niveles de acceso (catálogo
 * dinámico)" → "Ampliación 2026-09-29 (cuarta parte)"); la tarjeta del
 * Diálogo Táctico ya se filtra sola dentro de `TacticalModuleOption`.
 */
export default function InventoryModule() {
  const { adminUser } = useAuth()
  const [params, setParams] = useSearchParams()
  const view = params.get('view')
  const denied = view ? isViewDenied(adminUser, 'inventory', view) : false
  const damagesDenied = isViewDenied(adminUser, 'inventory', DAMAGE_VIEW)

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
          {denied ? (
            <p className="text-sm text-white/55">Tu nivel de acceso no tiene esta pantalla habilitada.</p>
          ) : view === TACTICAL_VIEW ? (
            <TacticalCaptureView moduleId="inventory" />
          ) : view === DAMAGE_VIEW ? (
            <DamageControlView />
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {!damagesDenied ? (
            <OptionCard
              color={moduleDef.color}
              icon="🧯"
              title={DAMAGE_NAME}
              description="Averías reportadas por QR desde las áreas. Trabájalas por lote, detecta mal manejo por departamento, imprime el reporte para el ajuste y confírmalas como ACTUALIZADO."
              onClick={() => goTo(DAMAGE_VIEW)}
            />
          ) : null}
          <TacticalModuleOption moduleId="inventory" onNavigate={goTo} />
        </div>
      )}
    </ModuleScreen>
  )
}
