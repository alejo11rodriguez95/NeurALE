import type { AccessDestination, AdminUser, AdminView, ModulePermission } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'
import { ALL_MODULES } from '@/shared/modules'

/**
 * Niveles de acceso (catálogo dinámico) — ver ARCHITECTURE.md → "Roles y
 * accesos" → "Niveles de acceso (catálogo dinámico, 2026-09-28)" y su
 * ampliación "Niveles de sistema editables + granularidad por pantalla
 * (2026-09-29)".
 *
 * Admin, Gerencia, Jefe de área y Operador son niveles "de sistema"
 * (`legacy_key` no nulo): su acceso base sigue viniendo exactamente igual que
 * siempre de `admin_users.access_level`/`module` — eso nunca se toca desde
 * aquí. Lo que SÍ se puede editar desde esta pantalla, para Gerencia/Jefe de
 * área/Operador (nunca para Admin, que queda totalmente bloqueado):
 *   - el nombre del nivel;
 *   - una matriz de acceso EXTRA (`admin_access_level_modules`), aditiva —
 *     agrega entrada a más módulos/pantallas, nunca quita las que ya tenían.
 * Un nivel nuevo (creado aquí, `legacy_key: null`) usa esa misma matriz como
 * su única fuente de acceso.
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
  /** 'all' = el módulo completo. Solo 'admin' admite un id de pantalla suelto. */
  view: string
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

/**
 * Las 7 pantallas de Configuraciones y Administradores — único destino con
 * desglose por pantalla (ver comentario de la migración
 * `20260929090000_admin_access_levels_view_and_editable.sql` sobre por qué
 * los otros 6 destinos se quedan en "módulo completo" por ahora).
 */
export const ADMIN_VIEWS: { id: AdminView; label: string }[] = [
  { id: 'ajustes', label: 'Ajustes de la plataforma' },
  { id: 'usuarios', label: 'Usuarios y Roles' },
  { id: 'niveles', label: 'Niveles de Acceso' },
  { id: 'empleados', label: 'Empleados' },
  { id: 'puestos', label: 'Puestos' },
  { id: 'muelles', label: 'Muelles' },
  { id: 'sucursales', label: 'Sucursales' },
]

/**
 * Pantallas de Configuraciones y Administradores que cada nivel de sistema ve
 * por defecto, sin depender de la matriz — es exactamente el comportamiento
 * de siempre (ver `AdminHome.tsx`, antes hardcodeado ahí). `'all'` = las 7.
 */
const DEFAULT_ADMIN_VIEWS: Partial<Record<LegacyAccessKey, AdminView[] | 'all'>> = {
  admin: 'all',
  gerencia: 'all',
  jefe_area: ['usuarios', 'empleados', 'puestos', 'muelles', 'sucursales'],
  operador: [],
}

/**
 * ¿Puede este usuario ver esta pantalla de Configuraciones y Administradores?
 * Primero su acceso de siempre (por nivel de sistema); si no, lo que su nivel
 * tenga EXTRA en la matriz (desglose por pantalla si lo tiene, si no la fila
 * "todas las pantallas" si la tiene). Aditivo: nunca le quita a nadie lo que
 * ya veía por defecto.
 */
export function canSeeAdminView(user: AdminUser, view: AdminView): boolean {
  const legacy = user.access_level in DEFAULT_ADMIN_VIEWS ? (user.access_level as LegacyAccessKey) : null
  const byDefault = legacy ? DEFAULT_ADMIN_VIEWS[legacy] : undefined
  if (byDefault === 'all') return true
  if (Array.isArray(byDefault) && byDefault.includes(view)) return true

  if (user.adminViewAccess && Object.keys(user.adminViewAccess).length > 0) {
    return !!user.adminViewAccess[view]
  }
  return !!user.moduleAccess?.admin
}

export async function fetchAccessLevels(): Promise<AccessLevelWithModules[]> {
  const [{ data: levels, error: levelsError }, { data: mods, error: modsError }] = await Promise.all([
    supabase
      .from('admin_access_levels')
      .select('id, name, legacy_key, active')
      .order('created_at', { ascending: true }),
    supabase.from('admin_access_level_modules').select('access_level_id, module, view, permission'),
  ])

  if (levelsError) throw levelsError
  if (modsError) throw modsError

  return ((levels ?? []) as AccessLevel[]).map((level) => ({
    ...level,
    modules: (mods ?? [])
      .filter((m) => m.access_level_id === level.id)
      .map((m) => ({
        module: m.module as AccessDestination,
        view: m.view as string,
        permission: m.permission as ModulePermission,
      })),
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
    const { error: modError } = await supabase.from('admin_access_level_modules').insert(
      modules.map((m) => ({ access_level_id: level.id, module: m.module, view: m.view, permission: m.permission })),
    )
    if (modError) {
      // No dejar un nivel a medias (sin su matriz) si esto falla.
      await supabase.from('admin_access_levels').delete().eq('id', level.id)
      throw modError
    }
  }

  return { ...(level as AccessLevel), modules }
}

/**
 * Edita un nivel. Admin queda siempre bloqueado (ni nombre ni matriz). Para
 * Gerencia/Jefe de área/Operador solo se permite nombre + matriz EXTRA (el
 * estado activo/inactivo no se toca desde aquí para no arriesgar que alguien
 * desactive por error un nivel de sistema — su acceso base no depende de
 * `active` de todas formas). Para un nivel personalizado (`legacy_key: null`)
 * se permite todo. `modules`, si se manda, reemplaza la matriz completa
 * (borra las filas viejas e inserta las nuevas).
 */
export async function updateAccessLevel(
  level: Pick<AccessLevel, 'id' | 'legacy_key'>,
  patch: { name?: string; active?: boolean; modules?: AccessLevelModuleRow[] },
): Promise<void> {
  if (level.legacy_key === 'admin') {
    throw new Error('El nivel "Admin" no se puede editar.')
  }

  const { name, modules } = patch
  // Ver comentario arriba: para los 3 niveles de sistema editables, `active`
  // se ignora aunque venga en el patch (la pantalla tampoco lo ofrece para
  // ellos, esto es un respaldo).
  const active = level.legacy_key ? undefined : patch.active

  if (name !== undefined || active !== undefined) {
    const { error } = await supabase
      .from('admin_access_levels')
      .update({
        ...(name !== undefined ? { name } : {}),
        ...(active !== undefined ? { active } : {}),
      })
      .eq('id', level.id)
    if (error) throw error
  }

  if (modules !== undefined) {
    const { error: delError } = await supabase
      .from('admin_access_level_modules')
      .delete()
      .eq('access_level_id', level.id)
    if (delError) throw delError

    if (modules.length) {
      const { error: insError } = await supabase.from('admin_access_level_modules').insert(
        modules.map((m) => ({ access_level_id: level.id, module: m.module, view: m.view, permission: m.permission })),
      )
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
