import { useEffect, useState } from 'react'

import { fieldControlClass, fieldLabelClass, ringStyle } from '@/modules/admin/components/formStyles'
import { fetchSettings, updateSetting, type Setting } from '@/modules/admin/lib/settings'
import { GlassCard } from '@/shared/components/GlassCard'
import { ADMIN_SECTION } from '@/shared/modules'

/** Ajustes de la plataforma: hoy solo el nombre del CD — cada fila nueva de `admin_settings` aparece aquí sola. */
export function SettingsView() {
  const [settings, setSettings] = useState<Setting[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSettings()
      .then((rows) => {
        setSettings(rows)
        setDrafts(
          Object.fromEntries(rows.map((r) => [r.key, typeof r.value === 'string' ? r.value : JSON.stringify(r.value)])),
        )
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(key: string) {
    setSaving(key)
    try {
      const raw = drafts[key]
      let value: unknown = raw
      try {
        value = JSON.parse(raw)
      } catch {
        value = raw
      }
      await updateSetting(key, value)
      setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)))
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <p className="text-sm text-white/40">Cargando…</p>

  return (
    <div className="flex flex-col gap-4">
      {settings.map((s) => (
        <GlassCard key={s.key} className="p-5">
          <label className={fieldLabelClass}>
            {s.description ?? s.key}
            <div className="mt-1.5 flex gap-2">
              <input
                value={drafts[s.key] ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                className={fieldControlClass}
                style={ringStyle(ADMIN_SECTION.color)}
              />
              <button
                type="button"
                onClick={() => handleSave(s.key)}
                disabled={saving === s.key}
                className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-neurale-bg disabled:opacity-50"
                style={{ background: ADMIN_SECTION.color }}
              >
                {saving === s.key ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </label>
        </GlassCard>
      ))}
    </div>
  )
}
