import { useSearchParams } from 'react-router-dom'

import type { AdminView } from '@/lib/supabase'
import { AdminHome } from '@/modules/admin/AdminHome'
import { AccessLevelsView } from '@/modules/admin/access-levels/AccessLevelsView'
import { BranchesView } from '@/modules/admin/branches/BranchesView'
import { DocksView } from '@/modules/admin/docks/DocksView'
import { EmployeesView } from '@/modules/admin/employees/EmployeesView'
import { canSeeAdminView } from '@/modules/admin/lib/accessLevels'
import { PositionsView } from '@/modules/admin/positions/PositionsView'
import { SettingsView } from '@/modules/admin/settings/SettingsView'
import { UsersRolesView } from '@/modules/admin/users/UsersRolesView'
import { ModuleScreen } from '@/shared/components/ModuleScreen'
import { useAuth } from '@/shared/auth/AuthContext'
import { ADMIN_SECTION } from '@/shared/modules'

const ADMIN_VIEW_IDS: AdminView[] = ['ajustes', 'usuarios', 'niveles', 'empleados', 'puestos', 'muelles', 'sucursales']

/**
 * Punto de entrada de Configuraciones y Administradores. Mismo patrón `?view=`
 * que Outbound/Picking — ver ARCHITECTURE.md → "Convenciones de Setup y
 * Diseño". Cada pantalla se protege también por URL directa (no solo
 * ocultando la tarjeta en `AdminHome`), con `canSeeAdminView`.
 */
export default function AdminModule() {
  const { adminUser } = useAuth()
  const [params, setParams] = useSearchParams()
  const view = params.get('view')

  function goTo(next: string | null) {
    if (next) setParams({ view: next })
    else setParams({})
  }

  const isKnownView = (v: string): v is AdminView => (ADMIN_VIEW_IDS as string[]).includes(v)
  const allowed = view && isKnownView(view) && adminUser ? canSeeAdminView(adminUser, view) : false

  return (
    <ModuleScreen module={ADMIN_SECTION}>
      {view ? (
        <div>
          <button
            onClick={() => goTo(null)}
            className="mb-6 text-sm text-white/50 hover:text-white/80"
          >
            ← Volver a Configuraciones y Administradores
          </button>
          {!allowed ? (
            <p className="text-sm text-white/55">Tu nivel de acceso no tiene esta pantalla habilitada.</p>
          ) : (
            <>
              {view === 'ajustes' ? <SettingsView /> : null}
              {view === 'usuarios' ? <UsersRolesView /> : null}
              {view === 'niveles' ? <AccessLevelsView /> : null}
              {view === 'empleados' ? <EmployeesView /> : null}
              {view === 'puestos' ? <PositionsView /> : null}
              {view === 'muelles' ? <DocksView /> : null}
              {view === 'sucursales' ? <BranchesView /> : null}
            </>
          )}
        </div>
      ) : (
        <AdminHome onNavigate={goTo} />
      )}
    </ModuleScreen>
  )
}
