import { OptionCard } from '@/modules/picking/components/OptionCard'
import { TacticalModuleOption } from '@/modules/dashboard/tactical/TacticalModuleOption'
import { isViewDenied } from '@/modules/admin/lib/accessLevels'
import { useAuth } from '@/shared/auth/AuthContext'
import { MODULES } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'picking')!

/**
 * Menú de opciones de Picking. Por ahora solo trae "Gestión de Control de
 * Calidad" (pedida desde el chat de Outbound, ver ARCHITECTURE.md). El resto
 * de las pantallas de Picking (preparación de pedidos, etc.) se agregan aquí
 * como tarjetas nuevas cuando se trabaje el chat propio de este módulo.
 *
 * La tarjeta se oculta si el nivel de acceso del usuario marcó "Sin acceso"
 * para esta pantalla en modo "opciones específicas" (`isViewDenied`,
 * agregado 2026-09-29 — ver ARCHITECTURE.md).
 */
export function PickingHome({ onNavigate }: { onNavigate: (view: string) => void }) {
  const { adminUser } = useAuth()
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {!isViewDenied(adminUser, 'picking', 'calidad') ? (
        <OptionCard
          color={moduleDef.color}
          icon="🛠️"
          title="Gestión de Control de Calidad"
          description="Seguimiento de las incidencias de calidad reportadas por Outbound durante la preparación de pedidos."
          onClick={() => onNavigate('calidad')}
        />
      ) : null}
      <TacticalModuleOption moduleId="picking" onNavigate={onNavigate} />
    </div>
  )
}
