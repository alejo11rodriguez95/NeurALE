import { OptionCard } from '@/modules/admin/components/OptionCard'
import { useAuth } from '@/shared/auth/AuthContext'
import { ADMIN_SECTION } from '@/shared/modules'

/**
 * Menú de Configuraciones y Administradores. `jefe_area` no ve "Ajustes de la
 * plataforma" (es transversal, para admin/gerencia) — el resto de tarjetas sí
 * las ve, cada pantalla restringe internamente qué puede hacer.
 */
export function AdminHome({ onNavigate }: { onNavigate: (view: string) => void }) {
  const { adminUser } = useAuth()
  const isTransversal = adminUser?.access_level === 'admin' || adminUser?.access_level === 'gerencia'
  const color = ADMIN_SECTION.color

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {isTransversal ? (
        <OptionCard
          color={color}
          icon="⚙️"
          title="Ajustes de la plataforma"
          description="Nombre del CD y parámetros generales de NeurALE."
          onClick={() => onNavigate('ajustes')}
        />
      ) : null}
      <OptionCard
        color={color}
        icon="👤"
        title="Usuarios y Roles"
        description="Crear cuentas de acceso y asignar rol/módulo a los empleados ya registrados."
        onClick={() => onNavigate('usuarios')}
      />
      <OptionCard
        color={color}
        icon="🧾"
        title="Empleados"
        description="Catálogo maestro del personal del CD por código de empleado y puesto."
        onClick={() => onNavigate('empleados')}
      />
      <OptionCard
        color={color}
        icon="🚚"
        title="Muelles"
        description="Agregar o quitar los muelles de Outbound — Gestión de Rutas."
        onClick={() => onNavigate('muelles')}
      />
      <OptionCard
        color={color}
        icon="🏬"
        title="Sucursales"
        description="Catálogo de sucursales, compartido con Outbound."
        onClick={() => onNavigate('sucursales')}
      />
    </div>
  )
}
