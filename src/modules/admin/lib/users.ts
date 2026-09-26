import type { AccessLevel, AdminUser, ModuleRole } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'

/**
 * Usuarios y Roles — tabla `admin_users`. El alta/edición real (incluida la
 * contraseña) pasa por la Edge Function `admin-manage-user`: no se puede
 * hacer desde el frontend con la anon key (ver comentario en esa función).
 * La RLS de `admin_users` solo permite `select`, así que aquí solo se lee
 * directo y se escribe vía `invoke`.
 */
export interface AdminUserWithEmployee extends AdminUser {
  employee?: { employee_code: string; full_name: string } | null
}

export async function fetchUsers(): Promise<AdminUserWithEmployee[]> {
  const { data, error } = await supabase
    .from('admin_users')
    .select(
      'id, employee_id, auth_user_id, email, access_level, module, active, must_change_password, created_at, employee:admin_employees(employee_code, full_name)',
    )
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as AdminUserWithEmployee[]
}

async function invokeManageUser(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-manage-user', { body })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data.data
}

export async function createUser(input: {
  employee_id: string
  /** Vacío/omitido: el empleado no tiene correo real, inicia sesión con su código de empleado. */
  email?: string
  password: string
  access_level: AccessLevel
  module: ModuleRole | null
}): Promise<AdminUser> {
  return invokeManageUser({ action: 'create', ...input, email: input.email || null })
}

export async function updateUser(
  user_id: string,
  patch: {
    access_level?: AccessLevel
    module?: ModuleRole | null
    active?: boolean
    password?: string
  },
): Promise<AdminUser> {
  return invokeManageUser({ action: 'update', user_id, patch })
}
