import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import type { AccessDestination, AdminUser } from '@/lib/supabase'

import { useAuth } from './AuthContext'
import { ForcePasswordChange } from './ForcePasswordChange'

/**
 * Protege la entrada a un módulo (o a Configuraciones y Administradores):
 * el Núcleo Neuronal (home) sigue público, pero entrar a una ruta envuelta en
 * este componente exige sesión iniciada y el rol correcto (decisión
 * 2026-09-16, ver ARCHITECTURE.md → "Roles y accesos").
 *
 * `allow` decide si el usuario logueado puede entrar. Los helpers de abajo
 * (`allowModule`, `allowDashboard`, `allowAdminSection`) cubren los tres
 * casos que hoy existen en `routes.tsx`.
 */
export function RequireAccess({
  allow,
  children,
}: {
  allow: (user: AdminUser) => boolean
  children: ReactNode
}) {
  const { session, adminUser, loading } = useAuth()
  const location = useLocation()

  if (loading || session === undefined) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-white/40">
        Cargando…
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (adminUser?.must_change_password) {
    return <ForcePasswordChange />
  }

  if (!adminUser || !allow(adminUser)) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
        <h1 className="font-display text-lg font-semibold text-white">Sin acceso</h1>
        <p className="text-sm text-white/55">
          Tu usuario no tiene permiso para entrar aquí. Pídele acceso a tu jefe de área
          o a gerencia desde Configuraciones y Administradores.
        </p>
      </div>
    )
  }

  return <>{children}</>
}

/**
 * ¿Este usuario tiene ALGÚN acceso (ver o editar) a este destino? admin/
 * gerencia siempre; jefe_area/operador por su `module` de siempre; cualquier
 * nivel (incluido jefe_area/operador con acceso EXTRA, o un nivel
 * personalizado) por su matriz en `admin_access_level_modules`. Es el mismo
 * chequeo que ya usaba `allowModule` — se nombra aparte para que otros chats
 * de módulo (Dashboard, Storage) lo reutilicen en vez de comparar
 * `access_level === 'jefe_area'` a mano (ver ARCHITECTURE.md → "Niveles de
 * acceso (catálogo dinámico)" → "Ampliación 2026-09-29: acceso real dentro
 * de cada módulo"). Acepta `null` para no obligar a los call sites (varios
 * módulos manejan `AdminUser | null`) a chequear antes.
 */
export function hasModuleAccess(user: AdminUser | null, moduleId: AccessDestination): boolean {
  if (!user) return false
  if (user.access_level === 'admin' || user.access_level === 'gerencia') return true
  if (user.module === moduleId) return true
  return !!user.moduleAccess?.[moduleId]
}

/**
 * ¿Este usuario puede GESTIONAR este destino (el mismo nivel que ya tenía
 * jefe_area de ese módulo: capturar el Diálogo Táctico, configurar el ISQ de
 * Storage, etc.)? admin/gerencia siempre; jefe_area por su `module` de
 * siempre; cualquier nivel con 'editar' en su matriz para ese destino —
 * incluido un nivel personalizado, o jefe_area/operador con 'editar' EXTRA
 * agregado en Niveles de Acceso. 'ver' en la matriz da entrada
 * (`hasModuleAccess`) pero no gestión.
 */
export function canManageModule(user: AdminUser | null, moduleId: AccessDestination): boolean {
  if (!user) return false
  if (user.access_level === 'admin' || user.access_level === 'gerencia') return true
  if (user.access_level === 'jefe_area' && user.module === moduleId) return true
  return user.moduleAccess?.[moduleId] === 'editar'
}

/**
 * admin/gerencia entran a todo. Los demás niveles (jefe_area/operador/custom)
 * entran por su regla de siempre (jefe_area/operador: su único `module`; sin
 * regla propia para custom) MÁS lo que su nivel tenga de EXTRA en
 * `admin_access_level_modules` — ver o editar, cualquiera de los dos cuenta
 * como acceso a la pantalla (agregado 2026-09-29: antes ese extra solo
 * aplicaba a custom; ahora también a jefe_area/operador, para poder darles
 * acceso a más de un módulo sin volverlos custom — ver ARCHITECTURE.md →
 * "Niveles de acceso (catálogo dinámico)" → "Niveles de sistema editables").
 * Es puramente aditivo: nunca le quita a nadie el acceso que ya tenía.
 */
export function allowModule(moduleId: AccessDestination) {
  return (user: AdminUser) => hasModuleAccess(user, moduleId)
}

/** Dashboard Neuronal: transversales, o cualquier nivel con ese destino extra en su matriz. */
export function allowDashboard(user: AdminUser) {
  if (user.access_level === 'admin' || user.access_level === 'gerencia') return true
  return !!user.moduleAccess?.dashboard
}

/**
 * Configuraciones y Administradores: transversales y jefe_area entran como
 * siempre (jefe_area no ve Ajustes/Niveles — eso lo filtra `AdminHome` por
 * pantalla); operador y custom solo si su nivel tiene 'admin' extra en su
 * matriz.
 */
export function allowAdminSection(user: AdminUser) {
  if (user.access_level === 'admin' || user.access_level === 'gerencia' || user.access_level === 'jefe_area') {
    return true
  }
  return !!user.moduleAccess?.admin
}
