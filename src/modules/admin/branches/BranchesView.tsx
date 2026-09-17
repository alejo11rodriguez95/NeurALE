import { useEffect, useState } from 'react'

import { fieldControlClass, fieldLabelClass, ringStyle } from '@/modules/admin/components/formStyles'
import { createBranch, fetchBranches, updateBranch, type Branch } from '@/modules/admin/lib/branches'
import { GlassCard } from '@/shared/components/GlassCard'
import { ADMIN_SECTION } from '@/shared/modules'

/** Catálogo de sucursales — resuelve `branch`/`branches_loaded` en Outbound (hoy texto libre). */
export function BranchesView() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    fetchBranches().then(setBranches)
  }

  useEffect(reload, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!code.trim() || !name.trim()) return
    setSaving(true)
    try {
      await createBranch({ code: code.trim(), name: name.trim() })
      setCode('')
      setName('')
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(branch: Branch) {
    await updateBranch(branch.id, { active: !branch.active })
    reload()
  }

  return (
    <div className="flex flex-col gap-6">
      <GlassCard className="p-5">
        <h2 className="font-display text-base font-semibold text-white">+ Agregar sucursal</h2>
        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr_auto]">
          <label className={fieldLabelClass}>
            Código
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={fieldControlClass}
              style={ringStyle(ADMIN_SECTION.color)}
              required
            />
          </label>
          <label className={fieldLabelClass}>
            Nombre
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

      <GlassCard className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-neurale-border text-left text-xs text-white/45 uppercase">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id} className="border-b border-neurale-border/60 last:border-0">
                <td className="px-4 py-3 text-white/80">{b.code}</td>
                <td className="px-4 py-3 text-white/80">{b.name}</td>
                <td className="px-4 py-3 text-white/55">{b.active ? 'Activa' : 'Inactiva'}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => toggleActive(b)}
                    className="text-xs text-white/50 hover:text-white/80"
                  >
                    {b.active ? 'Desactivar' : 'Reactivar'}
                  </button>
                </td>
              </tr>
            ))}
            {branches.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-white/40">
                  Sin sucursales todavía.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </GlassCard>
    </div>
  )
}
