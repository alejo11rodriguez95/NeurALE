import { useEffect, useRef, useState } from 'react'

import { fieldControlClass, fieldLabelClass, ringStyle } from '@/modules/admin/components/formStyles'
import {
  bulkImportEmployees,
  createEmployee,
  fetchEmployees,
  updateEmployee,
  type Employee,
} from '@/modules/admin/lib/employees'
import { createPosition, fetchPositions, type Position } from '@/modules/admin/lib/positions'
import { GlassCard } from '@/shared/components/GlassCard'
import { ADMIN_SECTION } from '@/shared/modules'

/**
 * Catálogo maestro de empleados. Cargar un empleado aquí NO da acceso al
 * sistema — solo lo pone disponible en los selects de otros módulos según su
 * puesto (ej. motorista en Rutas). Dar acceso real se hace aparte, en
 * "Usuarios y Roles".
 */
export function EmployeesView() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [positionId, setPositionId] = useState('')
  const [newPosition, setNewPosition] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [importOpen, setImportOpen] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Edición de un empleado ya existente (código, nombre, puesto, estado).
  const [editTarget, setEditTarget] = useState<Employee | null>(null)
  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')
  const [editPositionId, setEditPositionId] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  function reload() {
    Promise.all([fetchEmployees(), fetchPositions()]).then(([e, p]) => {
      setEmployees(e)
      setPositions(p)
    })
  }

  useEffect(() => {
    reload()
    setLoading(false)
  }, [])

  async function handleAddPosition() {
    if (!newPosition.trim()) return
    const created = await createPosition(newPosition.trim())
    setPositions((p) => [...p, created].sort((a, b) => a.name.localeCompare(b.name)))
    setPositionId(created.id)
    setNewPosition('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!code.trim() || !name.trim()) return
    setSaving(true)
    try {
      await createEmployee({
        employee_code: code.trim(),
        full_name: name.trim(),
        position_id: positionId || null,
      })
      setCode('')
      setName('')
      setPositionId('')
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleImportFile(file: File) {
    setImporting(true)
    setImportResult(null)
    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
      const [header, ...rows] = lines
      const cols = header.split(',').map((c) => c.trim().toLowerCase())
      const codeIdx = cols.indexOf('employee_code')
      const nameIdx = cols.indexOf('full_name')
      const posIdx = cols.indexOf('position_name')

      if (codeIdx === -1 || nameIdx === -1) {
        setImportResult({ imported: 0, errors: ['El CSV debe tener columnas: employee_code, full_name, position_name'] })
        return
      }

      const parsed = rows.map((line) => {
        const cells = line.split(',')
        return {
          employee_code: cells[codeIdx]?.trim() ?? '',
          full_name: cells[nameIdx]?.trim() ?? '',
          position_name: posIdx >= 0 ? (cells[posIdx]?.trim() ?? '') : '',
        }
      })

      const result = await bulkImportEmployees(parsed)
      setImportResult(result)
      reload()
    } finally {
      setImporting(false)
    }
  }

  function openEdit(emp: Employee) {
    setEditTarget(emp)
    setEditCode(emp.employee_code)
    setEditName(emp.full_name)
    setEditPositionId(emp.position_id ?? '')
    setEditActive(emp.active)
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
    if (!editCode.trim() || !editName.trim()) return
    setEditSaving(true)
    try {
      await updateEmployee(editTarget.id, {
        employee_code: editCode.trim(),
        full_name: editName.trim(),
        position_id: editPositionId || null,
        active: editActive,
      })
      closeEdit()
      reload()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'No se pudo guardar el cambio')
    } finally {
      setEditSaving(false)
    }
  }

  const filteredEmployees = employees.filter((emp) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      emp.full_name.toLowerCase().includes(q) ||
      emp.employee_code.toLowerCase().includes(q) ||
      (emp.position?.name ?? '').toLowerCase().includes(q)
    )
  })

  if (loading) return <p className="text-sm text-white/40">Cargando…</p>

  return (
    <div className="flex flex-col gap-6">
      <GlassCard className="p-5">
        <h2 className="font-display text-base font-semibold text-white">+ Agregar empleado</h2>
        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={fieldLabelClass}>
            Código de empleado
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={fieldControlClass}
              style={ringStyle(ADMIN_SECTION.color)}
              required
            />
          </label>
          <label className={fieldLabelClass}>
            Nombre completo
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldControlClass}
              style={ringStyle(ADMIN_SECTION.color)}
              required
            />
          </label>
          <label className={fieldLabelClass}>
            Puesto
            <select
              value={positionId}
              onChange={(e) => setPositionId(e.target.value)}
              className={fieldControlClass}
              style={ringStyle(ADMIN_SECTION.color)}
            >
              <option value="">— Sin puesto —</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className={fieldLabelClass}>
            + Agregar puesto nuevo
            <div className="mt-1.5 flex gap-2">
              <input
                value={newPosition}
                onChange={(e) => setNewPosition(e.target.value)}
                placeholder="Nombre del puesto"
                className={fieldControlClass}
                style={ringStyle(ADMIN_SECTION.color)}
              />
              <button
                type="button"
                onClick={handleAddPosition}
                className="shrink-0 rounded-lg border border-neurale-border px-3 py-2 text-sm text-white/70 hover:text-white"
              >
                Agregar
              </button>
            </div>
          </label>

          {error ? <p className="text-sm text-neurale-red sm:col-span-2">{error}</p> : null}

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-neurale-bg disabled:opacity-50 sm:col-span-2 sm:w-fit"
            style={{ background: ADMIN_SECTION.color }}
          >
            {saving ? 'Guardando…' : 'Guardar empleado'}
          </button>
        </form>
      </GlassCard>

      {editTarget ? (
        <GlassCard className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-white">
              Editar empleado — {editTarget.employee_code}
            </h2>
            <button type="button" onClick={closeEdit} className="text-xs text-white/50 hover:text-white/80">
              Cancelar
            </button>
          </div>
          <form onSubmit={handleEditSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={fieldLabelClass}>
              Código de empleado
              <input
                value={editCode}
                onChange={(e) => setEditCode(e.target.value)}
                className={fieldControlClass}
                style={ringStyle(ADMIN_SECTION.color)}
                required
              />
            </label>
            <label className={fieldLabelClass}>
              Nombre completo
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className={fieldControlClass}
                style={ringStyle(ADMIN_SECTION.color)}
                required
              />
            </label>
            <label className={fieldLabelClass}>
              Puesto
              <select
                value={editPositionId}
                onChange={(e) => setEditPositionId(e.target.value)}
                className={fieldControlClass}
                style={ringStyle(ADMIN_SECTION.color)}
              >
                <option value="">— Sin puesto —</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
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

      <GlassCard className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-white">Carga masiva (CSV)</h2>
          <button
            type="button"
            onClick={() => setImportOpen((v) => !v)}
            className="text-sm text-white/50 hover:text-white/80"
          >
            {importOpen ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
        {importOpen ? (
          <div className="mt-4">
            <p className="text-sm text-white/55">
              Columnas esperadas: <code>employee_code, full_name, position_name</code>. Si un puesto no
              existe todavía, se crea automáticamente.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleImportFile(file)
              }}
              className="mt-3 text-sm text-white/70"
            />
            {importing ? <p className="mt-2 text-sm text-white/40">Importando…</p> : null}
            {importResult ? (
              <div className="mt-3 text-sm">
                <p className="text-white/70">{importResult.imported} empleados importados.</p>
                {importResult.errors.length > 0 ? (
                  <ul className="mt-1 list-disc pl-5 text-neurale-red">
                    {importResult.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </GlassCard>

      <GlassCard className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-neurale-border p-4">
          <h2 className="font-display text-sm font-semibold text-white/80">
            Empleados ({filteredEmployees.length})
          </h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, código o puesto…"
            className="w-64 rounded-lg border border-neurale-border bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2"
            style={ringStyle(ADMIN_SECTION.color)}
          />
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-neurale-border text-left text-xs text-white/45 uppercase">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Puesto</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map((emp) => (
              <tr key={emp.id} className="border-b border-neurale-border/60 last:border-0">
                <td className="px-4 py-3 text-white/80">{emp.employee_code}</td>
                <td className="px-4 py-3 text-white/80">{emp.full_name}</td>
                <td className="px-4 py-3 text-white/55">{emp.position?.name ?? '—'}</td>
                <td className="px-4 py-3 text-white/55">{emp.active ? 'Activo' : 'Inactivo'}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => openEdit(emp)}
                    className="text-xs text-white/50 hover:text-white/80"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-white/40">
                  {employees.length === 0 ? 'Sin empleados todavía.' : 'Sin resultados para esa búsqueda.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </GlassCard>
    </div>
  )
}
