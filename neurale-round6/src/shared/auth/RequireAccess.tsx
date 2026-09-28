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
 * admin/gerencia entran a todo; jefe_area/operador solo a su propio módulo;
 * un nivel de acceso "custom" (ver ARCHITECTURE.md → "Niveles de acceso
 * (catálogo dinámico)") entra a lo que su matriz de módulos le asigne (ver o
 * editar, cualquiera de los dos cuenta como acceso a la pantalla).
 */
export function allowModule(moduleId: AccessDestination) {
  return (user: AdminUser) => {
    if (user.access_level === 'admin' || user.access_level === 'gerencia') return true
    if (user.access_level === 'custom') return !!user.moduleAccess?.[moduleId]
    return user.module === moduleId
  }
}

/** Dashboard Neuronal: transversales, o un nivel custom con ese destino en su matriz. */
export function allowDashboard(user: AdminUser) {
  if (user.access_level === 'admin' || user.access_level === 'gerencia') return true
  if (user.access_level === 'custom') return !!user.moduleAccess?.dashboard
  return false
}

/** Configuraciones y Administradores: todo menos operador, o un custom con ese destino en su matriz. */
export function allowAdminSection(user: AdminUser) {
  if (user.access_level === 'custom') return !!user.moduleAccess?.admin
  return user.access_level !== 'operador'
}
