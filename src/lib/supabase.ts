import { createClient } from '@supabase/supabase-js'

/**
 * Cliente único de Supabase, compartido por todos los módulos (ver ARCHITECTURE.md
 * → "Supabase — proyecto único"). Las credenciales viven en variables de entorno de
 * Vite (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) — nunca hardcodeadas aquí.
 *
 * En local: crea un archivo `.env` (a partir de `.env.example`) con las credenciales
 * del proyecto de Supabase. En Vercel: defínelas en Project Settings → Environment
 * Variables.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // No lanzamos un error para no romper el build/preview cuando aún no hay
  // credenciales configuradas (por ejemplo, en este chat de Setup y Diseño).
  console.warn(
    '[supabase] Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Configura las variables de entorno (ver .env.example) antes de usar autenticación o datos reales.',
  )
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '')

/**
 * Roles de usuario (ver ARCHITECTURE.md → "Roles y accesos").
 *
 * `ModuleRole`: el módulo de negocio al que pertenece un usuario (aplica a los
 * niveles `jefe_area` y `operador` — ver `AccessLevel`).
 *
 * `AccessLevel`: nivel de acceso real, gestionado en Configuraciones y
 * Administradores (tabla `admin_users`, vinculada a `auth.users`):
 *   - `admin` / `gerencia`: transversales, sin módulo (`module: null`), ven y
 *     administran todo. Son dos niveles distintos con permisos diferentes,
 *     aunque hoy ambos puedan crear/editar cualquier usuario.
 *   - `jefe_area`: administra los operadores de su propio módulo.
 *   - `operador`: opera dentro de su propio módulo, sin permisos de gestión.
 *
 * `UserRole` se mantiene como alias de compatibilidad — antes de la decisión
 * del 2026-09-16, mezclaba "módulo" y "gerencia" en un solo valor.
 */
export type ModuleRole =
  | 'inbound'
  | 'storage'
  | 'picking'
  | 'outbound'
  | 'inventory'

export type AccessLevel = 'admin' | 'gerencia' | 'jefe_area' | 'operador'

export type UserRole = ModuleRole | 'gerencia'

/** Fila de `admin_users` tal como la usa el frontend (ver módulo Configuraciones y Administradores). */
export interface AdminUser {
  id: string
  employee_id: string
  auth_user_id: string
  email: string
  access_level: AccessLevel
  module: ModuleRole | null
  active: boolean
  created_at: string
}
