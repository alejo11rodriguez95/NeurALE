import { OptionCard } from '@/modules/dashboard/components/OptionCard'
import { useAuth } from '@/shared/auth/AuthContext'
import { MODULES, type ModuleId } from '@/shared/modules'

import { hasTacticalOption, processForModule } from './config'

/** Vista `?view=` que usa cada módulo para su opción "Diálogo Táctico". */
export const TACTICAL_VIEW = 'dialogo-tactico'

/**
 * Tarjeta "Diálogo Táctico" para el menú de opciones de un módulo. Solo la ve
 * quien puede capturar (jefe de área del módulo, gerencia, admin).
 */
export function TacticalModuleOption({
  moduleId,
  onNavigate,
}: {
  moduleId: ModuleId
  onNavigate: (view: string) => void
}) {
  const { adminUser } = useAuth()
  const mod = MODULES.find((m) => m.id === moduleId)!
  const proc = processForModule(moduleId)
  if (!hasTacticalOption(moduleId) || !adminUser || adminUser.access_level === 'operador') return null
  return (
    <OptionCard
      color={mod.color}
      icon="🧭"
      title="Diálogo Táctico"
      description={
        proc
          ? `Captura los indicadores de ${proc.nombre} para el turno${
              moduleId === 'picking' ? ', el fill rate y la causa del faltante' : ''
            }${moduleId === 'outbound' ? ' y los rechazos a Picking' : ''}. Se reflejan al instante en el Dashboard Neuronal.`
          : 'Captura las ubicaciones erróneas de Storage y las inconsistencias en sucursales del turno. Se reflejan al instante en el Dashboard Neuronal.'
      }
      onClick={() => onNavigate(TACTICAL_VIEW)}
    />
  )
}
