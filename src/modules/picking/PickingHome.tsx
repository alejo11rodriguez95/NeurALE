import { OptionCard } from '@/modules/picking/components/OptionCard'
import { TacticalModuleOption } from '@/modules/dashboard/tactical/TacticalModuleOption'
import { MODULES } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'picking')!

/**
 * Menú de opciones de Picking. Por ahora solo trae "Gestión de Control de
 * Calidad" (pedida desde el chat de Outbound, ver ARCHITECTURE.md). El resto
 * de las pantallas de Picking (preparación de pedidos, etc.) se agregan aquí
 * como tarjetas nuevas cuando se trabaje el chat propio de este módulo.
 */
export function PickingHome({ onNavigate }: { onNavigate: (view: string) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <OptionCard
        color={moduleDef.color}
        icon="🛠️"
        title="Gestión de Control de Calidad"
        description="Seguimiento de las incidencias de calidad reportadas por Outbound durante la preparación de pedidos."
        onClick={() => onNavigate('calidad')}
      />
      <TacticalModuleOption moduleId="picking" onNavigate={onNavigate} />
    </div>
  )
}
