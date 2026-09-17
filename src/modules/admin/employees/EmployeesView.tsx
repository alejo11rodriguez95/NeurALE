import { useEffect, useRef, useState } from 'react'

import { fieldControlClass, fieldLabelClass, ringStyle } from '@/modules/admin/components/formStyles'
import {
  bulkImportEmployees,
  createEmployee,
  fetchEmployees,
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
        <table className="w-full text-sm">
          <thead className="border-b border-neurale-border text-left text-xs text-white/45 uppercase">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Puesto</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id} className="border-b border-neurale-border/60 last:border-0">
                <td className="px-4 py-3 text-white/80">{emp.employee_code}</td>
                <td className="px-4 py-3 text-white/80">{emp.full_name}</td>
                <td className="px-4 py-3 text-white/55">{emp.position?.name ?? '—'}</td>
                <td className="px-4 py-3 text-white/55">{emp.active ? 'Activo' : 'Inactivo'}</td>
              </tr>
            ))}
            {employees.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-white/40">
                  Sin empleados todavía.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </GlassCard>
    </div>
  )
}
