import { OptionCard } from '@/modules/dashboard/components/OptionCard'
import { DASHBOARD_MODULE } from '@/shared/modules'

/**
 * Menú de opciones del Dashboard Neuronal. Cada vista nueva (Pulso del CD,
 * detalle por módulo, etc.) se agrega aquí como una tarjeta más.
 */
export function DashboardHome({ onNavigate }: { onNavigate: (view: string) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <OptionCard
        color={DASHBOARD_MODULE.color}
        icon="🧭"
        title="Diálogo Táctico CD Nneo"
        description="Tablero del turno en una sola pantalla completa: procesos, fill rate, seguridad, orden y compromisos. Cada módulo llena su parte; el gerente llena compromisos y seguridad."
        onClick={() => onNavigate('dialogo')}
      />
    </div>
  )
}
