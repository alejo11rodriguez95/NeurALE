import type { AccessDestination, AdminUser, ModulePermission } from '@/lib/supabase'
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

export interface ViewDef {
  id: string
  label: string
}

/**
 * Pantallas conocidas dentro de cada uno de los 7 destinos — para el modo
 * "elegir opciones específicas" de un nivel de acceso (ampliado 2026-09-29,
 * ver ARCHITECTURE.md → "Niveles de acceso (catálogo dinámico)" →
 * "Granularidad por pantalla en todos los módulos"). Es un registro manual,
 * igual que `shared/modules.ts`: cuando un chat de módulo agregue una
 * pantalla nueva (un `?view=` nuevo), hay que sumarle una línea aquí. Si no
 * se hace, esa pantalla nueva sigue quedando cubierta por el modo "todas las
 * opciones del módulo" quien lo tenga así configurado — nunca queda fuera
 * silenciosamente, solo no aparece como opción individual hasta que se
 * agregue aquí.
 */
export const MODULE_VIEWS: Partial<Record<AccessDestination, ViewDef[]>> = {
  admin: [
    { id: 'ajustes', label: 'Ajustes de la plataforma' },
    { id: 'usuarios', label: 'Usuarios y Roles' },
    { id: 'niveles', label: 'Niveles de Acceso' },
    { id: 'empleados', label: 'Empleados' },
    { id: 'puestos', label: 'Puestos' },
    { id: 'muelles', label: 'Muelles' },
    { id: 'sucursales', label: 'Sucursales' },
  ],
  inbound: [
    { id: 'dialogo-tactico', label: 'Diálogo Táctico' },
    { id: 'isq', label: 'ISQ · Inbound-Storage Quality' },
    { id: 'referencias', label: 'Control de Referencias' },
  ],
  storage: [
    { id: 'dialogo-tactico', label: 'Diálogo Táctico' },
    { id: 'isq', label: 'ISQ (reportar incidencia)' },
    { id: 'dash', label: 'Dash Storage' },
    { id: 'ajustes', label: 'Ajustes de Storage' },
    { id: 'registro-pallet', label: 'Registro x Pallet' },
    { id: 'referencias', label: 'Control de Referencias' },
  ],
  picking: [
    { id: 'dialogo-tactico', label: 'Diálogo Táctico' },
    { id: 'calidad', label: 'Gestión de Control de Calidad' },
  ],
  outbound: [
    { id: 'dialogo-tactico', label: 'Diálogo Táctico' },
    { id: 'calidad', label: 'Control de Calidad' },
    { id: 'rutas', label: 'Gestión de Rutas' },
  ],
  inventory: [{ id: 'dialogo-tactico', label: 'Diálogo Táctico' }],
  dashboard: [
    { id: 'dialogo', label: 'Diálogo Táctico CD Nneo (tablero)' },
    { id: 'isq', label: 'ISQ · Inbound-Storage (tablero)' },
  ],
}

/**
 * Pantallas de Configuraciones y Administradores que cada nivel de sistema ve
 * por defecto, sin depender de la matriz — es exactamente el comportamiento
 * de siempre (ver `AdminHome.tsx`, antes hardcodeado ahí). `'all'` = todas.
 * Los otros 6 destinos no tienen un "de siempre" por pantalla igual de fino:
 * cada uno ya filtra su propia tarjeta a su manera (jefe_area/gerencia/admin
 * de siempre, o `hasModuleAccess`/`canManageModule` para acceso EXTRA vía
 * matriz) — `isViewDenied` (ver abajo) se agrega ENCIMA de esas reglas, sin
 * reemplazarlas, para bloquear puntualmente una pantalla que el nivel de
 * acceso marcó "Sin acceso" en modo "opciones específicas".
 */
const DEFAULT_ADMIN_VIEWS: Partial<Record<LegacyAccessKey, string[] | 'all'>> = {
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
export function canSeeAdminView(user: AdminUser, view: string): boolean {
  const legacy = user.access_level in DEFAULT_ADMIN_VIEWS ? (user.access_level as LegacyAccessKey) : null
  const byDefault = legacy ? DEFAULT_ADMIN_VIEWS[legacy] : undefined
  if (byDefault === 'all') return true
  if (Array.isArray(byDefault) && byDefault.includes(view)) return true

  const adminViews = user.viewAccess?.admin
  if (adminViews && Object.keys(adminViews).length > 0) {
    return !!adminViews[view]
  }
  return !!user.moduleAccess?.admin
}

/**
 * ¿Este usuario tiene BLOQUEADA, específicamente, esta pantalla de este
 * destino? (ampliado 2026-09-29 — ver ARCHITECTURE.md → "Niveles de acceso
 * (catálogo dinámico)" → "Ampliación 2026-09-29 (cuarta parte): Sin acceso
 * bloquea de verdad, no solo la tarjeta"). Josué pidió que "Sin acceso" en
 * un nivel de acceso impida entrar de verdad — ni siquiera ver — en vez de
 * solo ocultar la tarjeta del menú mientras la URL directa seguía abierta.
 *
 * Es puramente RESTRICTIVO y solo sobre acceso EXTRA (matriz): nunca bloquea
 * a admin/gerencia ni al dueño de siempre de un módulo de negocio (jefe_area/
 * operador en su propio `module`, vía `user.module === destination`) — ese
 * acceso de toda la vida nunca se toca, ni para sumar ni para quitar, exista
 * o no una matriz configurada. Si el nivel del usuario no usa "opciones
 * específicas" para este destino (matriz vacía o guardada como "todas las
 * opciones", `view: 'all'`), esta función no bloquea nada nuevo — se sigue
 * dependiendo por completo de las reglas de acceso de siempre de esa
 * pantalla (p. ej. `hasModuleAccess`/`canManageModule`, o el propio filtro
 * de `TacticalModuleOption`), sin tocarlas.
 *
 * Cada módulo de negocio (y el Dashboard Neuronal) debe llamar esta función
 * ADEMÁS de sus propias reglas — nunca en vez de ellas — antes de mostrar
 * una tarjeta o de entrar por `?view=` directo a una de sus pantallas
 * conocidas en `MODULE_VIEWS`. Configuraciones y Administradores no la usa:
 * ya tiene su propio equivalente más fino, `canSeeAdminView` (arriba), que
 * además conoce los defaults de jefe_area/operador para esta sección.
 */
export function isViewDenied(user: AdminUser | null, destination: AccessDestination, viewId: string): boolean {
  if (!user) return false
  if (user.access_level === 'admin' || user.access_level === 'gerencia') return false
  if (user.module === destination) return false
  const views = user.viewAccess?.[destination]
  if (!views || Object.keys(views).length === 0) return false
  return !views[viewId]
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
