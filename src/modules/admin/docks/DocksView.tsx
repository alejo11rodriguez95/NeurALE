import { useEffect, useState } from 'react'

import { fieldControlClass, fieldLabelClass, ringStyle } from '@/modules/admin/components/formStyles'
import { createDock, deleteDock, fetchDocks, type Dock } from '@/modules/admin/lib/docks'
import { GlassCard } from '@/shared/components/GlassCard'
import { ADMIN_SECTION } from '@/shared/modules'

/**
 * Muelles de Outbound — Gestión de Rutas (tabla `outbound_docks`). Antes se
 * administraba por SQL manual; desde el 2026-09-16 se agrega/quita aquí.
 */
export function DocksView() {
  const [docks, setDocks] = useState<Dock[]>([])
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    fetchDocks().then(setDocks)
  }

  useEffect(reload, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!code.trim() || !label.trim()) return
    setSaving(true)
    try {
      await createDock({ code: code.trim(), label: label.trim() })
      setCode('')
      setLabel('')
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(dock: Dock) {
    setError(null)
    try {
      await deleteDock(dock.id)
      reload()
    } catch (err) {
      setError(
        err instanceof Error
          ? `No se pudo quitar "${dock.label}": ${err.message}. Es probable que ya tenga visitas registradas.`
          : 'No se pudo quitar el muelle',
      )
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <GlassCard className="p-5">
        <h2 className="font-display text-base font-semibold text-white">+ Agregar muelle</h2>
        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr_auto]">
          <label className={fieldLabelClass}>
            Código (ej. M10)
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={fieldControlClass}
              style={ringStyle(ADMIN_SECTION.color)}
              required
            />
          </label>
          <label className={fieldLabelClass}>
            Etiqueta (ej. Muelle 10)
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
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
        <p className="mt-2 text-xs text-white/40">
          El código es el mismo texto que lleva el QR impreso del muelle — al agregar uno nuevo, genera e
          imprime su QR desde Gestión de Rutas (Outbound).
        </p>
      </GlassCard>

      <GlassCard className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-neurale-border text-left text-xs text-white/45 uppercase">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Etiqueta</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {docks.map((d) => (
              <tr key={d.id} className="border-b border-neurale-border/60 last:border-0">
                <td className="px-4 py-3 text-white/80">{d.code}</td>
                <td className="px-4 py-3 text-white/80">{d.label}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(d)}
                    className="text-xs text-white/50 hover:text-neurale-red"
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
            {docks.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-white/40">
                  Sin muelles todavía.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </GlassCard>
    </div>
  )
}
