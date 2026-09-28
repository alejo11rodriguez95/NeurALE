import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import type { AccessDestination, AdminUser, ModulePermission } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'

const PERMISSION_RANK: Record<ModulePermission, number> = { ver: 1, editar: 2 }

/**
 * Sesión + rol real del usuario actual (ver ARCHITECTURE.md → "Roles y
 * accesos" → "Gestión de usuarios adelantada"). El Núcleo Neuronal (home) no
 * depende de esto — se ve completo sin sesión. Lo usan `RequireAccess`
 * (protección de entrada a los módulos) y las pantallas de Configuraciones y
 * Administradores.
 */
interface AuthState {
  /** `undefined` mientras se resuelve la sesión inicial (evita parpadeo a "sin acceso"). */
  session: Session | null | undefined
  /** La fila de `admin_users` del usuario logueado, o `null` si no tiene una (o no hay sesión). */
  adminUser: AdminUser | null
  loading: boolean
  signOut: () => Promise<void>
  refreshAdminUser: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadAdminUser(userId: string | undefined) {
    if (!userId) {
      setAdminUser(null)
      return
    }
    const { data, error } = await supabase
      .from('admin_users')
      .select(
        'id, employee_id, auth_user_id, email, access_level, module, active, must_change_password, created_at, access_level_id',
      )
      .eq('auth_user_id', userId)
      .eq('active', true)
      .maybeSingle()

    if (error) {
      // No tapar el error: si esto falla (p.ej. una migración pendiente que
      // agregó una columna que la consulta de arriba todavía no tiene),
      // `data` queda null y el usuario se ve "sin acceso" para TODOS, no solo
      // para él — que quede en la consola ayuda a diagnosticarlo rápido en
      // vez de parecer un problema de su cuenta en particular.
      console.error('[auth] No se pudo cargar admin_users:', error.message)
    }

    const user = (data as AdminUser | null) ?? null

    // Matriz de "Niveles de acceso" (ver ARCHITECTURE.md → "Niveles de acceso
    // (catálogo dinámico)"): se resuelve para CUALQUIER nivel con
    // access_level_id, no solo custom (desde 2026-09-29) — para
    // admin/gerencia/jefe_area/operador es acceso EXTRA sobre lo de siempre
    // (`RequireAccess` los deja pasar por su regla de siempre primero); para
    // custom es su única fuente de acceso.
    if (user && user.access_level_id) {
      const { data: rows } = await supabase
        .from('admin_access_level_modules')
        .select('module, view, permission')
        .eq('access_level_id', user.access_level_id)

      const moduleAccess: Partial<Record<AccessDestination, ModulePermission>> = {}
      const adminViewAccess: Partial<Record<string, ModulePermission>> = {}

      for (const row of rows ?? []) {
        const mod = row.module as AccessDestination
        const permission = row.permission as ModulePermission
        const current = moduleAccess[mod]
        if (!current || PERMISSION_RANK[permission] > PERMISSION_RANK[current]) {
          moduleAccess[mod] = permission
        }
        // 'all' es el valor por defecto (módulo completo) — no es una
        // pantalla real, así que no entra al desglose por pantalla.
        if (mod === 'admin' && row.view !== 'all') {
          adminViewAccess[row.view] = permission
        }
      }

      user.moduleAccess = moduleAccess
      user.adminViewAccess = adminViewAccess as AdminUser['adminViewAccess']
    }

    setAdminUser(user)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      loadAdminUser(data.session?.user.id).finally(() => setLoading(false))
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      loadAdminUser(next?.user.id)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const value: AuthState = {
    session,
    adminUser,
    loading,
    signOut: async () => {
      await supabase.auth.signOut()
    },
    refreshAdminUser: () => loadAdminUser(session?.user.id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
