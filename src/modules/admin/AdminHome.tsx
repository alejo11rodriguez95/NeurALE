import { OptionCard } from '@/modules/admin/components/OptionCard'
import { canSeeAdminView } from '@/modules/admin/lib/accessLevels'
import { useAuth } from '@/shared/auth/AuthContext'
import { ADMIN_SECTION } from '@/shared/modules'

/**
 * Menú de Configuraciones y Administradores. Cada tarjeta se muestra según
 * `canSeeAdminView` (ver `lib/accessLevels.ts`): admin/gerencia ven las 7,
 * jefe_area ve las mismas 5 de siempre (no Ajustes/Niveles) y operador/custom
 * solo lo que su nivel tenga EXTRA en la matriz de "Niveles de Acceso" — es
 * el mismo comportamiento de siempre, con la posibilidad de sumar más.
 */
export function AdminHome({ onNavigate }: { onNavigate: (view: string) => void }) {
  const { adminUser } = useAuth()
  const color = ADMIN_SECTION.color
  if (!adminUser) return null
  const show = (view: Parameters<typeof canSeeAdminView>[1]) => canSeeAdminView(adminUser, view)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {show('ajustes') ? (
        <OptionCard
          color={color}
          icon="⚙️"
          title="Ajustes de la plataforma"
          description="Nombre del CD y parámetros generales de NeurALE."
          onClick={() => onNavigate('ajustes')}
        />
      ) : null}
      {show('usuarios') ? (
        <OptionCard
          color={color}
          icon="👤"
          title="Usuarios y Roles"
          description="Crear cuentas de acceso y asignar rol/módulo a los empleados ya registrados."
          onClick={() => onNavigate('usuarios')}
        />
      ) : null}
      {show('niveles') ? (
        <OptionCard
          color={color}
          icon="🛡️"
          title="Niveles de Acceso"
          description="Crear niveles de acceso a la medida: a qué módulos entran y si pueden ver o editar."
          onClick={() => onNavigate('niveles')}
        />
      ) : null}
      {show('empleados') ? (
        <OptionCard
          color={color}
          icon="🧾"
          title="Empleados"
          description="Catálogo maestro del personal del CD por código de empleado y puesto."
          onClick={() => onNavigate('empleados')}
        />
      ) : null}
      {show('puestos') ? (
        <OptionCard
          color={color}
          icon="🪪"
          title="Puestos"
          description="Agregar, editar o eliminar los puestos del catálogo de Empleados."
          onClick={() => onNavigate('puestos')}
        />
      ) : null}
      {show('muelles') ? (
        <OptionCard
          color={color}
          icon="🚚"
          title="Muelles"
          description="Agregar o quitar los muelles de Outbound — Gestión de Rutas."
          onClick={() => onNavigate('muelles')}
        />
      ) : null}
      {show('sucursales') ? (
        <OptionCard
          color={color}
          icon="🏬"
          title="Sucursales"
          description="Catálogo de sucursales, compartido con Outbound."
          onClick={() => onNavigate('sucursales')}
        />
      ) : null}
    </div>
  )
}
