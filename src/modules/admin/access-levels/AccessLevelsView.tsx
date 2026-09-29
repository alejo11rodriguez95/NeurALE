import { useEffect, useState } from 'react'

import type { AccessDestination, ModulePermission } from '@/lib/supabase'
import { fieldControlClass, fieldLabelClass, ringStyle } from '@/modules/admin/components/formStyles'
import {
  ACCESS_DESTINATIONS,
  MODULE_VIEWS,
  createAccessLevel,
  deleteAccessLevel,
  fetchAccessLevels,
  updateAccessLevel,
  type AccessLevelModuleRow,
  type AccessLevelWithModules,
} from '@/modules/admin/lib/accessLevels'
import { GlassCard } from '@/shared/components/GlassCard'
import { ADMIN_SECTION } from '@/shared/modules'

const LEGACY_LABEL: Record<string, string> = {
  admin: 'Admin',
  gerencia: 'Gerencia',
  jefe_area: 'Jefe de área',
  operador: 'Operador',
}

/** Selector de permiso: 'none' = sin acceso a esa pantalla/módulo. */
type Selection = 'none' | ModulePermission
type SelectionMap = Record<string, Selection>

interface MatrixState {
  /** Selección por destino — "todas las opciones del módulo" (solo se usa cuando ese destino NO está en modo específico). */
  selections: SelectionMap
  /** Por destino: true = "elegir opciones específicas" (mostrar el desglose por pantalla en vez del selector único). */
  specificMode: Record<string, boolean>
  /** Selección por pantalla, por destino — solo relevante cuando `specificMode[destino]` es true. */
  viewSelections: Record<string, SelectionMap>
}

function emptyViewSelections(destination: AccessDestination): SelectionMap {
  const views = MODULE_VIEWS[destination] ?? []
  return Object.fromEntries(views.map((v) => [v.id, 'none' as Selection]))
}

function emptyMatrixState(): MatrixState {
  return {
    selections: Object.fromEntries(ACCESS_DESTINATIONS.map((d) => [d.id, 'none' as Selection])),
    specificMode: Object.fromEntries(ACCESS_DESTINATIONS.map((d) => [d.id, false])),
    viewSelections: Object.fromEntries(ACCESS_DESTINATIONS.map((d) => [d.id, emptyViewSelections(d.id)])),
  }
}

function matrixStateFromModules(modules: AccessLevelModuleRow[]): MatrixState {
  const state = emptyMatrixState()
  for (const d of ACCESS_DESTINATIONS) {
    const rows = modules.filter((m) => m.module === d.id)
    if (!rows.length) continue
    const hasSpecific = rows.some((m) => m.view !== 'all')
    if (hasSpecific) {
      state.specificMode[d.id] = true
      for (const m of rows) {
        if (m.view !== 'all') state.viewSelections[d.id][m.view] = m.permission
      }
    } else {
      state.selections[d.id] = rows[0].permission
    }
  }
  return state
}

/**
 * Por destino: si está en modo "opciones específicas" se guarda una fila por
 * pantalla elegida (nunca una fila "todas"); si no, una única fila
 * `view: 'all'` si se eligió algo — nunca ambas para el mismo destino. Una
 * fila `'all'` cubre automáticamente cualquier pantalla nueva que un chat de
 * módulo agregue después (ver comentario de `MODULE_VIEWS`); las filas
 * específicas no.
 */
function modulesFromMatrixState(state: MatrixState): AccessLevelModuleRow[] {
  const rows: AccessLevelModuleRow[] = []
  for (const d of ACCESS_DESTINATIONS) {
    if (state.specificMode[d.id]) {
      const views = MODULE_VIEWS[d.id] ?? []
      for (const v of views) {
        const sel = state.viewSelections[d.id][v.id]
        if (sel !== 'none') rows.push({ module: d.id, view: v.id, permission: sel as ModulePermission })
      }
    } else {
      const sel = state.selections[d.id]
      if (sel !== 'none') rows.push({ module: d.id, view: 'all', permission: sel as ModulePermission })
    }
  }
  return rows
}

/** Resumen legible de la matriz para la columna "Accesos" de la tabla. */
function summarizeModules(modules: AccessLevelModuleRow[]): string {
  if (!modules.length) return 'Sin accesos asignados'
  const parts: string[] = []
  for (const d of ACCESS_DESTINATIONS) {
    const rows = modules.filter((m) => m.module === d.id)
    if (!rows.length) continue
    const specificRows = rows.filter((m) => m.view !== 'all')
    if (specificRows.length) {
      const total = MODULE_VIEWS[d.id]?.length ?? specificRows.length
      parts.push(`${d.label} (${specificRows.length} de ${total} opción${specificRows.length > 1 ? 'es' : ''})`)
    } else {
      parts.push(`${d.label} (${rows[0].permission})`)
    }
  }
  return parts.join(', ')
}

/** Texto de la columna "Accesos" para los niveles de sistema — su acceso base nunca cambia, solo se le puede sumar. */
function accessSummary(level: AccessLevelWithModules): string {
  if (level.legacy_key === 'admin') return 'Todos los módulos, fijo — no editable'
  if (level.legacy_key === 'gerencia') return 'Todos los módulos, fijo'
  if (level.legacy_key === 'jefe_area' || level.legacy_key === 'operador') {
    const base = 'Según el módulo asignado a cada usuario'
    return modules_extra(level.modules) ? `${base} + ${summarizeModules(level.modules)}` : base
  }
  return summarizeModules(level.modules)
}

function modules_extra(modules: AccessLevelModuleRow[]): boolean {
  return modules.length > 0
}

function PermissionSelect({
  value,
  onChange,
  disabled,
}: {
  value: Selection
  onChange: (value: Selection) => void
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Selection)}
      className="rounded-lg border border-neurale-border bg-white/5 px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 disabled:opacity-50"
      style={ringStyle(ADMIN_SECTION.color)}
      disabled={disabled}
    >
      <option value="none">Sin acceso</option>
      <option value="ver">Ver</option>
      <option value="editar">Editar</option>
    </select>
  )
}

/**
 * Matriz de acceso: un bloque por destino. Si el destino tiene pantallas
 * conocidas en `MODULE_VIEWS`, se puede marcar "Elegir opciones específicas"
 * para pasar del selector único (todo el módulo) a un desglose pantalla por
 * pantalla — igual que ya existía solo para Configuraciones y Administradores
 * (ampliado 2026-09-29 a los 7 destinos, ver ARCHITECTURE.md).
 */
function MatrixEditor({
  state,
  onChange,
  onToggleSpecific,
  onViewChange,
  onBulkSet,
  disabled,
}: {
  state: MatrixState
  onChange: (destination: AccessDestination, value: Selection) => void
  onToggleSpecific: (destination: AccessDestination, specific: boolean) => void
  onViewChange: (destination: AccessDestination, view: string, value: Selection) => void
  onBulkSet: (destination: AccessDestination, value: Selection) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      {ACCESS_DESTINATIONS.map((d) => {
        const views = MODULE_VIEWS[d.id] ?? []
        const canBeSpecific = views.length > 0
        const specific = canBeSpecific && state.specificMode[d.id]

        return (
          <div key={d.id} className="rounded-lg border border-neurale-border/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-medium text-white/80">{d.label}</span>
              {!specific ? (
                <PermissionSelect
                  value={state.selections[d.id]}
                  onChange={(value) => onChange(d.id, value)}
                  disabled={disabled}
                />
              ) : null}
            </div>

            {canBeSpecific ? (
              <label className="mt-2 flex items-center gap-2 text-[11px] text-white/50">
                <input
                  type="checkbox"
                  checked={specific}
                  onChange={(e) => onToggleSpecific(d.id, e.target.checked)}
                  disabled={disabled}
                />
                Elegir opciones específicas
              </label>
            ) : null}

            {specific ? (
              <div className="mt-3 border-t border-neurale-border/40 pt-3">
                {!disabled ? (
                  <div className="mb-2 flex gap-3 text-[11px]">
                    <button
                      type="button"
                      onClick={() => onBulkSet(d.id, 'editar')}
                      className="text-white/50 hover:text-white/80"
                    >
                      Marcar todas: Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onBulkSet(d.id, 'ver')}
                      className="text-white/50 hover:text-white/80"
                    >
                      Ver
                    </button>
                    <button
                      type="button"
                      onClick={() => onBulkSet(d.id, 'none')}
                      className="text-white/50 hover:text-white/80"
                    >
                      Ninguna
                    </button>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {views.map((v) => (
                    <label key={v.id} className={`${fieldLabelClass} flex items-center justify-between gap-3`}>
                      <span>{v.label}</span>
                      <PermissionSelect
                        value={state.viewSelections[d.id][v.id]}
                        onChange={(value) => onViewChange(d.id, v.id, value)}
                        disabled={disabled}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Niveles de Acceso (catálogo dinámico) — ver ARCHITECTURE.md → "Roles y
 * accesos" → "Niveles de acceso (catálogo dinámico, 2026-09-28)" y su
 * ampliación del 2026-09-29.
 *
 * Admin, Gerencia, Jefe de área y Operador aparecen listados (son los que ya
 * existían). Admin queda totalmente bloqueado — ni nombre ni matriz. Los
 * otros 3 sí se pueden renombrar y se les puede sumar acceso EXTRA (nunca se
 * les quita el de siempre, que sigue viniendo de las reglas de toda la vida,
 * no de esta matriz). Un nivel nuevo se crea con nombre + una matriz de
 * módulo/pantalla → ver/editar, y luego se asigna en Usuarios y Roles.
 */
export function AccessLevelsView() {
  const [levels, setLevels] = useState<AccessLevelWithModules[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [matrix, setMatrix] = useState<MatrixState>(emptyMatrixState())
  const [saving, setSaving] = useState(false)

  const [editTarget, setEditTarget] = useState<AccessLevelWithModules | null>(null)
  const [editName, setEditName] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [editMatrix, setEditMatrix] = useState<MatrixState>(emptyMatrixState())
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<AccessLevelWithModules | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  function reload() {
    fetchAccessLevels().then(setLevels)
  }

  useEffect(() => {
    reload()
    setLoading(false)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return
    setSaving(true)
    try {
      await createAccessLevel(name.trim(), modulesFromMatrixState(matrix))
      setName('')
      setMatrix(emptyMatrixState())
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el nivel de acceso')
    } finally {
      setSaving(false)
    }
  }

  function openEdit(level: AccessLevelWithModules) {
    setDeleteTarget(null)
    setEditTarget(level)
    setEditName(level.name)
    setEditActive(level.active)
    setEditMatrix(matrixStateFromModules(level.modules))
    setEditError(null)
  }

  function closeEdit() {
    setEditTarget(null)
    setEditError(null)
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editTarget) return
    setEditError(null)
    if (!editName.trim()) return
    setEditSaving(true)
    try {
      await updateAccessLevel(
        { id: editTarget.id, legacy_key: editTarget.legacy_key },
        {
          name: editName.trim(),
          active: editActive,
          modules: modulesFromMatrixState(editMatrix),
        },
      )
      closeEdit()
      reload()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'No se pudo guardar el cambio')
    } finally {
      setEditSaving(false)
    }
  }

  async function toggleActive(level: AccessLevelWithModules) {
    try {
      await updateAccessLevel({ id: level.id, legacy_key: level.legacy_key }, { active: !level.active })
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar')
    }
  }

  function askDelete(level: AccessLevelWithModules) {
    setEditTarget(null)
    setDeleteTarget(level)
    setDeleteError(null)
  }

  function cancelDelete() {
    setDeleteTarget(null)
    setDeleteError(null)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteAccessLevel(deleteTarget)
      setDeleteTarget(null)
      reload()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'No se pudo eliminar')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <p className="text-sm text-white/40">Cargando…</p>

  return (
    <div className="flex flex-col gap-6">
      <GlassCard className="p-5">
        <h2 className="font-display text-base font-semibold text-white">+ Crear nivel de acceso</h2>
        <p className="mt-1 text-sm text-white/55">
          Elige a qué puede entrar este nivel y si puede solo ver o también editar cada uno. En Configuraciones y
          Administradores podés elegir pantalla por pantalla. Después lo asignás a un usuario desde Usuarios y
          Roles.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={`${fieldLabelClass} sm:col-span-2`}>
            Nombre del nivel
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Ej. "Jefe de Turno Storage+Picking"'
              className={fieldControlClass}
              style={ringStyle(ADMIN_SECTION.color)}
              required
            />
          </label>

          <MatrixEditor
            state={matrix}
            onChange={(destination, value) =>
              setMatrix((prev) => ({ ...prev, selections: { ...prev.selections, [destination]: value } }))
            }
            onToggleSpecific={(destination, specific) =>
              setMatrix((prev) => ({ ...prev, specificMode: { ...prev.specificMode, [destination]: specific } }))
            }
            onViewChange={(destination, view, value) =>
              setMatrix((prev) => ({
                ...prev,
                viewSelections: {
                  ...prev.viewSelections,
                  [destination]: { ...prev.viewSelections[destination], [view]: value },
                },
              }))
            }
            onBulkSet={(destination, value) =>
              setMatrix((prev) => ({
                ...prev,
                viewSelections: {
                  ...prev.viewSelections,
                  [destination]: Object.fromEntries(
                    (MODULE_VIEWS[destination] ?? []).map((v) => [v.id, value]),
                  ),
                },
              }))
            }
          />

          {error ? <p className="text-sm text-neurale-red sm:col-span-2">{error}</p> : null}

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-neurale-bg disabled:opacity-50 sm:col-span-2 sm:w-fit"
            style={{ background: ADMIN_SECTION.color }}
          >
            {saving ? 'Creando…' : 'Crear nivel de acceso'}
          </button>
        </form>
      </GlassCard>

      {editTarget ? (
        <GlassCard className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-white">
              Editar nivel — {editTarget.name}
            </h2>
            <button type="button" onClick={closeEdit} className="text-xs text-white/50 hover:text-white/80">
              Cancelar
            </button>
          </div>
          {editTarget.legacy_key ? (
            <p className="mt-2 text-xs text-white/45">
              Este es un nivel de sistema: su acceso de siempre no cambia. Lo que agregués acá es acceso EXTRA,
              sobre lo que ya tenía.
            </p>
          ) : null}
          <form onSubmit={handleEditSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={fieldLabelClass}>
              Nombre del nivel
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className={fieldControlClass}
                style={ringStyle(ADMIN_SECTION.color)}
                required
              />
            </label>
            {!editTarget.legacy_key ? (
              <label className={fieldLabelClass}>
                Estado
                <select
                  value={editActive ? 'activo' : 'inactivo'}
                  onChange={(e) => setEditActive(e.target.value === 'activo')}
                  className={fieldControlClass}
                  style={ringStyle(ADMIN_SECTION.color)}
                >
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </label>
            ) : null}

            <MatrixEditor
              state={editMatrix}
              onChange={(destination, value) =>
                setEditMatrix((prev) => ({ ...prev, selections: { ...prev.selections, [destination]: value } }))
              }
              onToggleSpecific={(destination, specific) =>
                setEditMatrix((prev) => ({ ...prev, specificMode: { ...prev.specificMode, [destination]: specific } }))
              }
              onViewChange={(destination, view, value) =>
                setEditMatrix((prev) => ({
                  ...prev,
                  viewSelections: {
                    ...prev.viewSelections,
                    [destination]: { ...prev.viewSelections[destination], [view]: value },
                  },
                }))
              }
              onBulkSet={(destination, value) =>
                setEditMatrix((prev) => ({
                  ...prev,
                  viewSelections: {
                    ...prev.viewSelections,
                    [destination]: Object.fromEntries(
                      (MODULE_VIEWS[destination] ?? []).map((v) => [v.id, value]),
                    ),
                  },
                }))
              }
            />

            {editError ? <p className="text-sm text-neurale-red sm:col-span-2">{editError}</p> : null}

            <div className="flex gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={editSaving}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-neurale-bg disabled:opacity-50"
                style={{ background: ADMIN_SECTION.color }}
              >
                {editSaving ? 'Guardando…' : 'Guardar cambios'}
              </button>
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-lg border border-neurale-border px-4 py-2 text-sm text-white/70 hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </form>
        </GlassCard>
      ) : null}

      <GlassCard className="overflow-hidden">
        <div className="border-b border-neurale-border p-4">
          <h2 className="font-display text-sm font-semibold text-white/80">Niveles de acceso ({levels.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-neurale-border text-left text-xs text-white/45 uppercase">
            <tr>
              <th className="px-4 py-3">Nivel</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Accesos</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {levels.map((level) => {
              const isAdmin = level.legacy_key === 'admin'
              const isSystem = !!level.legacy_key
              return (
                <tr key={level.id} className="border-b border-neurale-border/60 last:border-0">
                  <td className="px-4 py-3 text-white/80">{level.name}</td>
                  <td className="px-4 py-3 text-white/55">
                    {isSystem ? `Sistema — ${LEGACY_LABEL[level.legacy_key!]}` : 'Personalizado'}
                  </td>
                  <td className="px-4 py-3 text-white/55">{accessSummary(level)}</td>
                  <td className="px-4 py-3 text-white/55">{level.active ? 'Activo' : 'Inactivo'}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {isAdmin ? (
                      <span className="text-xs text-white/30">—</span>
                    ) : deleteTarget?.id === level.id ? (
                      <span className="inline-flex items-center gap-3">
                        <span className="text-xs text-neurale-red">¿Eliminar "{level.name}"?</span>
                        <button
                          onClick={confirmDelete}
                          disabled={deleting}
                          className="text-xs font-semibold text-neurale-red hover:opacity-80 disabled:opacity-50"
                        >
                          {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                        </button>
                        <button onClick={cancelDelete} className="text-xs text-white/50 hover:text-white/80">
                          Cancelar
                        </button>
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => openEdit(level)}
                          className="mr-3 text-xs text-white/50 hover:text-white/80"
                        >
                          Editar
                        </button>
                        {!isSystem ? (
                          <>
                            <button
                              onClick={() => toggleActive(level)}
                              className="mr-3 text-xs text-white/50 hover:text-white/80"
                            >
                              {level.active ? 'Desactivar' : 'Reactivar'}
                            </button>
                            <button
                              onClick={() => askDelete(level)}
                              className="text-xs text-white/50 hover:text-neurale-red"
                            >
                              Eliminar
                            </button>
                          </>
                        ) : null}
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
            {levels.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-white/40">
                  Sin niveles de acceso todavía.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {deleteTarget && deleteError ? (
          <p className="border-t border-neurale-border p-4 text-sm text-neurale-red">{deleteError}</p>
        ) : null}
      </GlassCard>
    </div>
  )
}
