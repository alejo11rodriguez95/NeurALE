import { useSearchParams } from 'react-router-dom'

import { OptionCard } from '@/modules/dashboard/components/OptionCard'
import { TacticalCaptureView } from '@/modules/dashboard/tactical/TacticalCaptureView'
import { TACTICAL_VIEW, TacticalModuleOption } from '@/modules/dashboard/tactical/TacticalModuleOption'
import { IsqDashboard } from '@/modules/storage/isq/IsqDashboard'
import { IsqReportView } from '@/modules/storage/isq/IsqReportView'
import { IsqSettingsView } from '@/modules/storage/isq/IsqSettingsView'
import { ISQ_NAME } from '@/modules/storage/isq/lib/isq'
import { canConfigureIsq } from '@/modules/storage/isq/ui'
import { useAuth } from '@/shared/auth/AuthContext'
import { ModuleScreen } from '@/shared/components/ModuleScreen'
import { MODULES } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'storage')!

/** Vistas `?view=` de Storage. */
const VIEWS = {
  isq: 'isq',
  dash: 'dash',
  settings: 'ajustes',
  settingsIsq: 'ajustes-isq',
} as const

/**
 * Punto de entrada de Storage. Menú de opciones con el patrón `?view=` (igual
 * que Outbound). "Diálogo Táctico" la agregó el chat del Dashboard Neuronal —
 * se conserva tal cual. El resto son opciones propias de Storage:
 *   - ISQ (reporte de incidencias de Storage a Inbound)
 *   - Dash Storage (dashboard del módulo; hoy solo ISQ)
 *   - Ajustes de Storage → ISQ (jefe de Storage, gerencia, admin)
 * La tarjeta usa el `OptionCard` del Dashboard (el mismo que ya usa
 * `TacticalModuleOption` aquí) para no crear una quinta copia.
 */
export default function StorageModule() {
  const [params, setParams] = useSearchParams()
  const view = params.get('view')
  const { adminUser } = useAuth()
  const canConfigure = canConfigureIsq(adminUser)

  function goTo(next: string | null) {
    if (next) setParams({ view: next })
    else setParams({})
  }

  const back = view === VIEWS.settingsIsq ? VIEWS.settings : null

  return (
    <ModuleScreen module={moduleDef}>
      {view ? (
        <div>
          <button onClick={() => goTo(back)} className="mb-6 text-sm text-white/50 hover:text-white/80">
            ← {back ? 'Volver a Ajustes de Storage' : 'Volver a Storage'}
          </button>
          {view === TACTICAL_VIEW ? <TacticalCaptureView moduleId="storage" /> : null}
          {view === VIEWS.isq ? <IsqReportView /> : null}
          {view === VIEWS.dash ? <IsqDashboard color={moduleDef.color} /> : null}
          {view === VIEWS.settings ? (
            canConfigure ? <StorageSettingsHome onNavigate={goTo} /> : <NoAccess />
          ) : null}
          {view === VIEWS.settingsIsq ? canConfigure ? <IsqSettingsView /> : <NoAccess /> : null}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <OptionCard
            color={moduleDef.color}
            icon="📦"
            title={ISQ_NAME}
            description="Reporta a Inbound las incidencias encontradas al almacenar: pallet dañado, mal estibado, SKU o etiqueta incorrecta, etc."
            onClick={() => goTo(VIEWS.isq)}
          />
          <OptionCard
            color={moduleDef.color}
            icon="📊"
            title="Dash Storage"
            description="Dashboard de Storage: incidencias ISQ del día (o del rango que elijas) por tipo, almacenador, turno y estado."
            onClick={() => goTo(VIEWS.dash)}
          />
          <TacticalModuleOption moduleId="storage" onNavigate={goTo} />
          {canConfigure ? (
            <OptionCard
              color={moduleDef.color}
              icon="⚙️"
              title="Ajustes de Storage"
              description="Configura las opciones del módulo. Hoy: el formulario de ISQ (tipos de incidencia, campos extra y puestos del almacenador)."
              onClick={() => goTo(VIEWS.settings)}
            />
          ) : null}
        </div>
      )}
    </ModuleScreen>
  )
}

function StorageSettingsHome({ onNavigate }: { onNavigate: (v: string) => void }) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-white">Ajustes de Storage</h2>
      <p className="mt-1 text-sm text-white/50">Solo jefe de Storage, gerencia y admin.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <OptionCard
          color={moduleDef.color}
          icon="📝"
          title="ISQ"
          description="Agrega, edita, ordena o elimina tipos de incidencia y campos del formulario Inbound-Storage Quality."
          onClick={() => onNavigate(VIEWS.settingsIsq)}
        />
      </div>
    </div>
  )
}

function NoAccess() {
  return <p className="text-sm text-white/55">Solo el jefe de Storage, gerencia o admin pueden entrar a Ajustes de Storage.</p>
}
