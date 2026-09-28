import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import type { AdminUser } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'

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
    const { data } = await supabase
      .from('admin_users')
      .select(
        'id, employee_id, auth_user_id, email, access_level, module, active, must_change_password, created_at, access_level_id',
      )
      .eq('auth_user_id', userId)
      .eq('active', true)
      .maybeSingle()

    const user = (data as AdminUser | null) ?? null

    // Nivel de acceso "custom" (ver ARCHITECTURE.md → "Niveles de acceso
    // (catálogo dinámico)"): admin/gerencia/jefe_area/operador siguen
    // resolviéndose solo con access_level/module (como siempre); solo un
    // nivel custom necesita esta consulta extra para saber a qué puede
    // entrar y con qué permiso (ver/editar).
    if (user && user.access_level === 'custom' && user.access_level_id) {
      const { data: modules } = await supabase
        .from('admin_access_level_modules')
        .select('module, permission')
        .eq('access_level_id', user.access_level_id)
      user.moduleAccess = Object.fromEntries(
        (modules ?? []).map((m) => [m.module, m.permission]),
      ) as AdminUser['moduleAccess']
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
