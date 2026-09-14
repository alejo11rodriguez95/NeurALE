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
 * Roles de usuario (ver ARCHITECTURE.md → "Roles y accesos"). Cada usuario tiene un
 * rol asociado a un módulo, o el rol `gerencia` con acceso al Dashboard Neuronal y
 * visibilidad de todos los módulos. Se espera en una tabla `profiles` (o metadata de
 * `auth.users`) con columna `role`.
 */
export type ModuleRole =
  | 'inbound'
  | 'storage'
  | 'picking'
  | 'outbound'
  | 'inventory'
export type UserRole = ModuleRole | 'gerencia'
