import { OptionCard } from '@/modules/dashboard/components/OptionCard'
import { useAuth } from '@/shared/auth/AuthContext'
import { MODULES, type ModuleId } from '@/shared/modules'

import { processForModule } from './config'

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
  if (!proc || !adminUser || adminUser.access_level === 'operador') return null
  return (
    <OptionCard
      color={mod.color}
      icon="🧭"
      title="Diálogo Táctico"
      description={`Captura los indicadores de ${proc.nombre} para el turno${
        moduleId === 'picking' ? ', el fill rate y la causa del faltante' : ''
      }. Se reflejan al instante en el Dashboard Neuronal.`}
      onClick={() => onNavigate(TACTICAL_VIEW)}
    />
  )
}
