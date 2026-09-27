import { useEffect, useState } from 'react'

import { fieldControlClass, fieldLabelClass, ringStyle } from '@/modules/admin/components/formStyles'
import {
  createPosition,
  deletePosition,
  fetchAllPositions,
  updatePosition,
  type Position,
} from '@/modules/admin/lib/positions'
import { GlassCard } from '@/shared/components/GlassCard'
import { ADMIN_SECTION } from '@/shared/modules'

/**
 * Catálogo de puestos — mismo catálogo que alimenta el select de "Puesto" en
 * Empleados (agregar ahí sigue funcionando igual). Esta pantalla es para
 * administrarlo completo: agregar, editar el nombre, desactivar/reactivar, o
 * eliminarlo en firme si nunca se usó.
 */
export function PositionsView() {
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const [editTarget, setEditTarget] = useState<Position | null>(null)
  const [editName, setEditName] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<Position | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  function reload() {
    fetchAllPositions().then(setPositions)
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
      await createPosition(name.trim())
      setName('')
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  function openEdit(p: Position) {
    setDeleteTarget(null)
    setEditTarget(p)
    setEditName(p.name)
    setEditActive(p.active)
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
      await updatePosition(editTarget.id, { name: editName.trim(), active: editActive })
      closeEdit()
      reload()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'No se pudo guardar el cambio')
    } finally {
      setEditSaving(false)
    }
  }

  async function toggleActive(p: Position) {
    try {
      await updatePosition(p.id, { active: !p.active })
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar')
    }
  }

  function askDelete(p: Position) {
    setEditTarget(null)
    setDeleteTarget(p)
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
      await deletePosition(deleteTarget.id)
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
        <h2 className="font-display text-base font-semibold text-white">+ Agregar puesto</h2>
        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[2fr_auto]">
          <label className={fieldLabelClass}>
            Nombre del puesto
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldControlClass}
              style={ringStyle(ADMIN_SECTION.color)}
              required
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg px-4 py-2 text-sm font-semibold text-neurale-bg disabled:opacity-50 sm:w-fit"
              style={{ background: ADMIN_SECTION.color }}
            >
              {saving ? 'Guardando…' : 'Agregar'}
            </button>
          </div>
        </form>
        {error ? <p className="mt-2 text-sm text-neurale-red">{error}</p> : null}
      </GlassCard>

      {editTarget ? (
        <GlassCard className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-white">Editar puesto</h2>
            <button type="button" onClick={closeEdit} className="text-xs text-white/50 hover:text-white/80">
              Cancelar
            </button>
          </div>
          <form onSubmit={handleEditSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={fieldLabelClass}>
              Nombre del puesto
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className={fieldControlClass}
                style={ringStyle(ADMIN_SECTION.color)}
                required
              />
            </label>
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
        <table className="w-full text-sm">
          <thead className="border-b border-neurale-border text-left text-xs text-white/45 uppercase">
            <tr>
              <th className="px-4 py-3">Puesto</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.id} className="border-b border-neurale-border/60 last:border-0">
                <td className="px-4 py-3 text-white/80">{p.name}</td>
                <td className="px-4 py-3 text-white/55">{p.active ? 'Activo' : 'Inactivo'}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {deleteTarget?.id === p.id ? (
                    <span className="inline-flex items-center gap-3">
                      <span className="text-xs text-neurale-red">¿Eliminar "{p.name}"?</span>
                      <button
                        onClick={confirmDelete}
                        disabled={deleting}
                        className="text-xs font-semibold text-neurale-red hover:opacity-80 disabled:opacity-50"
                      >
                        {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                      </button>
                      <button
                        onClick={cancelDelete}
                        className="text-xs text-white/50 hover:text-white/80"
                      >
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <>
                      <button onClick={() => openEdit(p)} className="mr-3 text-xs text-white/50 hover:text-white/80">
                        Editar
                      </button>
                      <button
                        onClick={() => toggleActive(p)}
                        className="mr-3 text-xs text-white/50 hover:text-white/80"
                      >
                        {p.active ? 'Desactivar' : 'Reactivar'}
                      </button>
                      <button onClick={() => askDelete(p)} className="text-xs text-white/50 hover:text-neurale-red">
                        Eliminar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {positions.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-white/40">
                  Sin puestos todavía.
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
