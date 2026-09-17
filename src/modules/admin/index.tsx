import { useSearchParams } from 'react-router-dom'

import { AdminHome } from '@/modules/admin/AdminHome'
import { BranchesView } from '@/modules/admin/branches/BranchesView'
import { DocksView } from '@/modules/admin/docks/DocksView'
import { EmployeesView } from '@/modules/admin/employees/EmployeesView'
import { SettingsView } from '@/modules/admin/settings/SettingsView'
import { UsersRolesView } from '@/modules/admin/users/UsersRolesView'
import { ModuleScreen } from '@/shared/components/ModuleScreen'
import { ADMIN_SECTION } from '@/shared/modules'

/**
 * Punto de entrada de Configuraciones y Administradores. Mismo patrón `?view=`
 * que Outbound/Picking — ver ARCHITECTURE.md → "Convenciones de Setup y
 * Diseño".
 */
export default function AdminModule() {
  const [params, setParams] = useSearchParams()
  const view = params.get('view')

  function goTo(next: string | null) {
    if (next) setParams({ view: next })
    else setParams({})
  }

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
          {view === 'ajustes' ? <SettingsView /> : null}
          {view === 'usuarios' ? <UsersRolesView /> : null}
          {view === 'empleados' ? <EmployeesView /> : null}
          {view === 'muelles' ? <DocksView /> : null}
          {view === 'sucursales' ? <BranchesView /> : null}
        </div>
      ) : (
        <AdminHome onNavigate={goTo} />
      )}
    </ModuleScreen>
  )
}
