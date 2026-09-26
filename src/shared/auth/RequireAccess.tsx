import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import type { AdminUser } from '@/lib/supabase'

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

/** admin/gerencia entran a todo; jefe_area/operador solo a su propio módulo. */
export function allowModule(moduleId: string) {
  return (user: AdminUser) =>
    user.access_level === 'admin' ||
    user.access_level === 'gerencia' ||
    user.module === moduleId
}

/** Dashboard Neuronal: solo transversales. */
export function allowDashboard(user: AdminUser) {
  return user.access_level === 'admin' || user.access_level === 'gerencia'
}

/** Configuraciones y Administradores: todo menos operador. */
export function allowAdminSection(user: AdminUser) {
  return user.access_level !== 'operador'
}
