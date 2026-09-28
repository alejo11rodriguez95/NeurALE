import type { AccessDestination, ModulePermission } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'
import { ALL_MODULES } from '@/shared/modules'

/**
 * Niveles de acceso (catálogo dinámico) — ver ARCHITECTURE.md → "Roles y
 * accesos" → "Niveles de acceso (catálogo dinámico, 2026-09-28)".
 *
 * Admin, Gerencia, Jefe de área y Operador son niveles "de sistema"
 * (`legacy_key` no nulo): siguen funcionando exactamente igual que siempre
 * (ligados a `admin_users.access_level`/`module`), aparecen aquí listados
 * pero de solo lectura — no se pueden editar, desactivar ni eliminar desde
 * esta pantalla. Un nivel nuevo (creado aquí) tiene `legacy_key: null` y su
 * propia matriz de módulos + ver/editar en `admin_access_level_modules`.
 */
export type LegacyAccessKey = 'admin' | 'gerencia' | 'jefe_area' | 'operador'

export interface AccessLevel {
  id: string
  name: string
  legacy_key: LegacyAccessKey | null
  active: boolean
}

export interface AccessLevelModuleRow {
  module: AccessDestination
  permission: ModulePermission
}

export interface AccessLevelWithModules extends AccessLevel {
  modules: AccessLevelModuleRow[]
}

/** Los 7 destinos que una matriz puede cubrir (5 módulos de negocio + Dashboard + esta sección). */
export const ACCESS_DESTINATIONS: { id: AccessDestination; label: string }[] = ALL_MODULES.map((m) => ({
  id: m.id as AccessDestination,
  label: m.label,
}))

export async function fetchAccessLevels(): Promise<AccessLevelWithModules[]> {
  const [{ data: levels, error: levelsError }, { data: mods, error: modsError }] = await Promise.all([
    supabase
      .from('admin_access_levels')
      .select('id, name, legacy_key, active')
      .order('created_at', { ascending: true }),
    supabase.from('admin_access_level_modules').select('access_level_id, module, permission'),
  ])

  if (levelsError) throw levelsError
  if (modsError) throw modsError

  return ((levels ?? []) as AccessLevel[]).map((level) => ({
    ...level,
    modules: (mods ?? [])
      .filter((m) => m.access_level_id === level.id)
      .map((m) => ({ module: m.module as AccessDestination, permission: m.permission as ModulePermission })),
  }))
}

/** Solo los activos, sin importar el tipo — para el select de "Nivel de acceso" en Usuarios y Roles. */
export async function fetchActiveAccessLevels(): Promise<AccessLevelWithModules[]> {
  const levels = await fetchAccessLevels()
  return levels.filter((l) => l.active)
}

export async function createAccessLevel(
  name: string,
  modules: AccessLevelModuleRow[],
): Promise<AccessLevelWithModules> {
  const { data: level, error } = await supabase
    .from('admin_access_levels')
    .insert({ name })
    .select('id, name, legacy_key, active')
    .single()
  if (error) throw error

  if (modules.length) {
    const { error: modError } = await supabase
      .from('admin_access_level_modules')
      .insert(modules.map((m) => ({ access_level_id: level.id, module: m.module, permission: m.permission })))
    if (modError) {
      // No dejar un nivel a medias (sin su matriz) si esto falla.
      await supabase.from('admin_access_levels').delete().eq('id', level.id)
      throw modError
    }
  }

  return { ...(level as AccessLevel), modules }
}

/**
 * Edita un nivel (solo aplica a niveles "custom" — la pantalla no ofrece
 * editar los de sistema). `modules`, si se manda, reemplaza la matriz
 * completa (borra las filas viejas e inserta las nuevas).
 */
export async function updateAccessLevel(
  id: string,
  patch: { name?: string; active?: boolean; modules?: AccessLevelModuleRow[] },
): Promise<void> {
  const { name, active, modules } = patch

  if (name !== undefined || active !== undefined) {
    const { error } = await supabase
      .from('admin_access_levels')
      .update({
        ...(name !== undefined ? { name } : {}),
        ...(active !== undefined ? { active } : {}),
      })
      .eq('id', id)
    if (error) throw error
  }

  if (modules !== undefined) {
    const { error: delError } = await supabase
      .from('admin_access_level_modules')
      .delete()
      .eq('access_level_id', id)
    if (delError) throw delError

    if (modules.length) {
      const { error: insError } = await supabase
        .from('admin_access_level_modules')
        .insert(modules.map((m) => ({ access_level_id: id, module: m.module, permission: m.permission })))
      if (insError) throw insError
    }
  }
}

/**
 * Elimina un nivel en firme. Bloqueado para los 4 niveles de sistema (la
 * pantalla ni siquiera ofrece el botón para esos, esto es un respaldo) y si
 * algún usuario ya lo tiene asignado (foreign key en `admin_users.access_level_id`).
 */
export async function deleteAccessLevel(level: Pick<AccessLevel, 'id' | 'legacy_key'>): Promise<void> {
  if (level.legacy_key) {
    throw new Error('Los niveles de sistema (Admin, Gerencia, Jefe de área, Operador) no se pueden eliminar.')
  }
  const { error } = await supabase.from('admin_access_levels').delete().eq('id', level.id)
  if (error) {
    if (error.code === '23503' || /foreign key/i.test(error.message)) {
      throw new Error(
        'No se puede eliminar: hay usuarios con este nivel de acceso asignado. Desactívalo en su lugar.',
      )
    }
    throw error
  }
}
