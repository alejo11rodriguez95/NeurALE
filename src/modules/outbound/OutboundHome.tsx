import { OptionCard } from '@/modules/outbound/components/OptionCard'
import { TacticalModuleOption } from '@/modules/dashboard/tactical/TacticalModuleOption'
import { isViewDenied } from '@/modules/admin/lib/accessLevels'
import { useAuth } from '@/shared/auth/AuthContext'
import { MODULES } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'outbound')!

/**
 * Menú de opciones de Outbound. Cada opción nueva del módulo se agrega aquí
 * como una tarjeta más — no cambia rutas en `routes.tsx`, la navegación entre
 * opciones vive dentro del propio módulo (`?view=`).
 *
 * Cada tarjeta se oculta si el nivel de acceso del usuario marcó "Sin
 * acceso" para esa pantalla en modo "opciones específicas" (`isViewDenied`,
 * agregado 2026-09-29 — ver ARCHITECTURE.md).
 */
export function OutboundHome({ onNavigate }: { onNavigate: (view: string) => void }) {
  const { adminUser } = useAuth()
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {!isViewDenied(adminUser, 'outbound', 'calidad') ? (
        <OptionCard
          color={moduleDef.color}
          icon="⚠️"
          title="Control de Calidad"
          description="Reporta y consulta incidencias encontradas durante la preparación de pedidos (faltantes, averías, producto incorrecto, etc.)."
          onClick={() => onNavigate('calidad')}
        />
      ) : null}
      {!isViewDenied(adminUser, 'outbound', 'rutas') ? (
        <OptionCard
          color={moduleDef.color}
          icon="🚚"
          title="Gestión de Rutas"
          description="Escanea el QR de un muelle para registrar la llegada de un camión y da seguimiento hasta su salida."
          onClick={() => onNavigate('rutas')}
        />
      ) : null}
      <TacticalModuleOption moduleId="outbound" onNavigate={onNavigate} />
    </div>
  )
}
