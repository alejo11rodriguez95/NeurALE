import { OptionCard } from '@/modules/dashboard/components/OptionCard'
import { isViewDenied } from '@/modules/admin/lib/accessLevels'
import { useAuth } from '@/shared/auth/AuthContext'
import { DASHBOARD_MODULE } from '@/shared/modules'

/**
 * Menú de opciones del Dashboard Neuronal. Cada vista nueva (Pulso del CD,
 * detalle por módulo, etc.) se agrega aquí como una tarjeta más.
 *
 * Cada tarjeta se oculta si el nivel de acceso del usuario marcó "Sin
 * acceso" para esa pantalla en modo "opciones específicas" (`isViewDenied`,
 * agregado 2026-09-29 — ver ARCHITECTURE.md).
 */
export function DashboardHome({ onNavigate }: { onNavigate: (view: string) => void }) {
  const { adminUser } = useAuth()
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {!isViewDenied(adminUser, 'dashboard', 'dialogo') ? (
        <OptionCard
          color={DASHBOARD_MODULE.color}
          icon="🧭"
          title="Diálogo Táctico CD Nneo"
          description="Tablero del turno en una sola pantalla completa: procesos, fill rate, seguridad, orden y compromisos. Cada módulo llena su parte; el gerente llena compromisos y seguridad."
          onClick={() => onNavigate('dialogo')}
        />
      ) : null}
      {/* Agregada desde el chat de Storage (2026-09-27): reutiliza el Dash Storage. */}
      {!isViewDenied(adminUser, 'dashboard', 'isq') ? (
        <OptionCard
          color={DASHBOARD_MODULE.color}
          icon="📦"
          title="ISQ · Inbound-Storage"
          description="Incidencias que Storage reporta a Inbound (Inbound-Storage Quality): del día o por rango, por tipo, almacenador, turno, estado y causa raíz."
          onClick={() => onNavigate('isq')}
        />
      ) : null}
    </div>
  )
}
