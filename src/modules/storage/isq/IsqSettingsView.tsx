import { useEffect, useState } from 'react'

import { GlassCard } from '@/shared/components/GlassCard'
import { MODULES, withAlpha } from '@/shared/modules'

import {
  ISQ_FIELD_TYPE_LABELS,
  createIsqField,
  createIsqType,
  deleteIsqField,
  deleteIsqType,
  fetchIsqFields,
  fetchIsqSettings,
  fetchIsqTypes,
  fetchPositionNames,
  saveIsqSettings,
  updateIsqField,
  updateIsqType,
  type IsqField,
  type IsqFieldType,
  type IsqType,
} from './lib/isq'
import { GhostButton, PrimaryButton, SectionTitle, fieldControlClass, fieldLabelClass, ringStyle } from './ui'

const storage = MODULES.find((m) => m.id === 'storage')!
const ring = ringStyle(storage.color)
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Storage → Ajustes de Storage → ISQ. Administra el formulario de ISQ:
 * tipos de incidencia, campos extra y qué puestos alimentan "Almacenador".
 * Los 5 campos base (SKU, Referencia, Almacenador, Fecha, Tipo) son fijos.
 * Borrar un tipo o un campo no altera el historial: cada incidencia guarda
 * una copia del nombre del tipo y de los campos extra que se llenaron.
 */
export function IsqSettingsView() {
  return (
    <div className="space-y-6">
      <SectionTitle
        title="Ajustes · ISQ"
        subtitle="Cambia el formulario de Inbound-Storage Quality. Los cambios aplican al siguiente reporte; lo ya reportado conserva sus datos."
      />
      <GlassCard className="p-5 text-sm text-white/55">
        <b className="text-white/80">Campos base (fijos):</b> SKU · Referencia (No. de recepción / OC) · Almacenador · Fecha (automática) · Tipo de incidencia
      </GlassCard>
      <TypesSection />
      <FieldsSection />
      <PositionsSection />
    </div>
  )
}

/* ---------- Tipos de incidencia ---------- */

function TypesSection() {
  const [items, setItems] = useState<IsqType[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => fetchIsqTypes(true).then(setItems).catch((e) => setError(errMsg(e)))
  useEffect(() => {
    load()
  }, [])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const add = () =>
    newLabel.trim() &&
    run(async () => {
      const max = Math.max(0, ...(items ?? []).map((t) => t.sort_order))
      await createIsqType(newLabel.trim(), max + 10)
      setNewLabel('')
    })

  const move = (idx: number, dir: -1 | 1) =>
    run(async () => {
      const list = [...(items ?? [])]
      const j = idx + dir
      if (j < 0 || j >= list.length) return
      ;[list[idx], list[j]] = [list[j], list[idx]]
      await Promise.all(list.map((t, i) => (t.sort_order !== (i + 1) * 10 ? updateIsqType(t.id, { sort_order: (i + 1) * 10 }) : null)))
    })

  return (
    <GlassCard className="p-5">
      <h3 className="font-display text-base font-semibold text-white">Tipos de incidencia</h3>
      <p className="mt-1 text-xs text-white/45">Desactivar lo quita del formulario sin borrar nada. Eliminar lo borra del catálogo (las incidencias ya reportadas conservan el nombre).</p>

      <div className="mt-4 space-y-1.5">
        {items === null ? (
          <p className="text-sm text-white/45">Cargando…</p>
        ) : (
          items.map((t, idx) => (
            <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-neurale-border bg-white/[0.03] px-3 py-2">
              <div className="flex flex-col">
                <button type="button" disabled={busy || idx === 0} onClick={() => move(idx, -1)} className="text-[10px] leading-none text-white/40 hover:text-white disabled:opacity-20" aria-label="Subir">▲</button>
                <button type="button" disabled={busy || idx === items.length - 1} onClick={() => move(idx, 1)} className="text-[10px] leading-none text-white/40 hover:text-white disabled:opacity-20" aria-label="Bajar">▼</button>
              </div>
              {editing?.id === t.id ? (
                <input
                  className={`${fieldControlClass} mt-0 min-w-0 flex-1`}
                  style={ring}
                  value={editing.label}
                  autoFocus
                  onChange={(e) => setEditing({ id: t.id, label: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') run(async () => { await updateIsqType(t.id, { label: editing.label.trim() }); setEditing(null) })
                    if (e.key === 'Escape') setEditing(null)
                  }}
                />
              ) : (
                <span className={`min-w-0 flex-1 text-sm ${t.active ? 'text-white' : 'text-white/35 line-through'}`}>{t.label}</span>
              )}
              {editing?.id === t.id ? (
                <>
                  <GhostButton disabled={busy || !editing.label.trim()} onClick={() => run(async () => { await updateIsqType(t.id, { label: editing.label.trim() }); setEditing(null) })}>Guardar</GhostButton>
                  <GhostButton onClick={() => setEditing(null)}>Cancelar</GhostButton>
                </>
              ) : (
                <>
                  <GhostButton disabled={busy} onClick={() => setEditing({ id: t.id, label: t.label })}>Editar</GhostButton>
                  <GhostButton disabled={busy} onClick={() => run(() => updateIsqType(t.id, { active: !t.active }))}>{t.active ? 'Desactivar' : 'Activar'}</GhostButton>
                  <GhostButton
                    disabled={busy}
                    className="hover:!text-rose-400"
                    onClick={() => window.confirm(`¿Eliminar "${t.label}" del catálogo?`) && run(() => deleteIsqType(t.id))}
                  >
                    Eliminar
                  </GhostButton>
                </>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className={fieldLabelClass}>Nuevo tipo de incidencia</span>
          <input className={fieldControlClass} style={ring} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Ej. Producto vencido" />
        </label>
        <PrimaryButton color={storage.color} disabled={busy || !newLabel.trim()} onClick={add}>
          + Agregar
        </PrimaryButton>
      </div>
      {error ? <p className="mt-2 text-sm text-rose-400">{error}</p> : null}
    </GlassCard>
  )
}

/* ---------- Campos extra ---------- */

interface FieldDraft {
  label: string
  field_type: IsqFieldType
  options: string
  required: boolean
}

const EMPTY_FIELD: FieldDraft = { label: '', field_type: 'text', options: '', required: false }
const parseOptions = (s: string) => [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))]

function FieldsSection() {
  const [items, setItems] = useState<IsqField[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<FieldDraft>(EMPTY_FIELD)
  const [editing, setEditing] = useState<{ id: string; draft: FieldDraft } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => fetchIsqFields(true).then(setItems).catch((e) => setError(errMsg(e)))
  useEffect(() => {
    load()
  }, [])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  function validate(d: FieldDraft): string | null {
    if (!d.label.trim()) return 'Ponle nombre al campo.'
    if (d.field_type === 'select' && parseOptions(d.options).length < 2) return 'Una lista necesita al menos 2 opciones, separadas por coma.'
    return null
  }

  const toRow = (d: FieldDraft) => ({
    label: d.label.trim(),
    field_type: d.field_type,
    options: d.field_type === 'select' ? parseOptions(d.options) : [],
    required: d.required,
  })

  const add = () => {
    const v = validate(draft)
    if (v) return setError(v)
    run(async () => {
      const max = Math.max(0, ...(items ?? []).map((f) => f.sort_order))
      await createIsqField({ ...toRow(draft), sort_order: max + 10 })
      setDraft(EMPTY_FIELD)
    })
  }

  const move = (idx: number, dir: -1 | 1) =>
    run(async () => {
      const list = [...(items ?? [])]
      const j = idx + dir
      if (j < 0 || j >= list.length) return
      ;[list[idx], list[j]] = [list[j], list[idx]]
      await Promise.all(list.map((f, i) => (f.sort_order !== (i + 1) * 10 ? updateIsqField(f.id, { sort_order: (i + 1) * 10 }) : null)))
    })

  return (
    <GlassCard className="p-5">
      <h3 className="font-display text-base font-semibold text-white">Campos extra del formulario</h3>
      <p className="mt-1 text-xs text-white/45">Aparecen debajo de los campos base, en este orden. Ej.: Cantidad, Ubicación, Observaciones, Lote.</p>

      <div className="mt-4 space-y-1.5">
        {items === null ? (
          <p className="text-sm text-white/45">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-white/40">Sin campos extra por ahora.</p>
        ) : (
          items.map((f, idx) =>
            editing?.id === f.id ? (
              <div key={f.id} className="rounded-xl border p-3" style={{ borderColor: withAlpha(storage.color, 0.35) }}>
                <FieldEditor draft={editing.draft} onChange={(d) => setEditing({ id: f.id, draft: d })} />
                <div className="mt-3 flex gap-2">
                  <GhostButton
                    disabled={busy}
                    onClick={() => {
                      const v = validate(editing.draft)
                      if (v) return setError(v)
                      run(async () => {
                        await updateIsqField(f.id, toRow(editing.draft))
                        setEditing(null)
                      })
                    }}
                  >
                    Guardar
                  </GhostButton>
                  <GhostButton onClick={() => setEditing(null)}>Cancelar</GhostButton>
                </div>
              </div>
            ) : (
              <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-neurale-border bg-white/[0.03] px-3 py-2">
                <div className="flex flex-col">
                  <button type="button" disabled={busy || idx === 0} onClick={() => move(idx, -1)} className="text-[10px] leading-none text-white/40 hover:text-white disabled:opacity-20" aria-label="Subir">▲</button>
                  <button type="button" disabled={busy || idx === items.length - 1} onClick={() => move(idx, 1)} className="text-[10px] leading-none text-white/40 hover:text-white disabled:opacity-20" aria-label="Bajar">▼</button>
                </div>
                <div className="min-w-0 flex-1">
                  <span className={`text-sm ${f.active ? 'text-white' : 'text-white/35 line-through'}`}>
                    {f.label}
                    {f.required ? ' *' : ''}
                  </span>
                  <span className="ml-2 text-xs text-white/40">
                    {ISQ_FIELD_TYPE_LABELS[f.field_type]}
                    {f.field_type === 'select' ? `: ${f.options.join(', ')}` : ''}
                  </span>
                </div>
                <GhostButton
                  disabled={busy}
                  onClick={() => setEditing({ id: f.id, draft: { label: f.label, field_type: f.field_type, options: f.options.join(', '), required: f.required } })}
                >
                  Editar
                </GhostButton>
                <GhostButton disabled={busy} onClick={() => run(() => updateIsqField(f.id, { active: !f.active }))}>{f.active ? 'Desactivar' : 'Activar'}</GhostButton>
                <GhostButton
                  disabled={busy}
                  className="hover:!text-rose-400"
                  onClick={() => window.confirm(`¿Eliminar el campo "${f.label}"? Los reportes anteriores conservan lo que se llenó.`) && run(() => deleteIsqField(f.id))}
                >
                  Eliminar
                </GhostButton>
              </div>
            ),
          )
        )}
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-neurale-border p-3">
        <span className={fieldLabelClass}>Nuevo campo</span>
        <FieldEditor draft={draft} onChange={setDraft} />
        <PrimaryButton className="mt-3" color={storage.color} disabled={busy} onClick={add}>
          + Agregar campo
        </PrimaryButton>
      </div>
      {error ? <p className="mt-2 text-sm text-rose-400">{error}</p> : null}
    </GlassCard>
  )
}

function FieldEditor({ draft, onChange }: { draft: FieldDraft; onChange: (d: FieldDraft) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
      <label>
        <span className={fieldLabelClass}>Nombre</span>
        <input className={fieldControlClass} style={ring} value={draft.label} onChange={(e) => onChange({ ...draft, label: e.target.value })} placeholder="Ej. Cantidad afectada" />
      </label>
      <label>
        <span className={fieldLabelClass}>Tipo</span>
        <select className={fieldControlClass} style={ring} value={draft.field_type} onChange={(e) => onChange({ ...draft, field_type: e.target.value as IsqFieldType })}>
          {(Object.keys(ISQ_FIELD_TYPE_LABELS) as IsqFieldType[]).map((k) => (
            <option key={k} value={k} className="bg-neurale-deep">
              {ISQ_FIELD_TYPE_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-white/70">
        <input type="checkbox" checked={draft.required} onChange={(e) => onChange({ ...draft, required: e.target.checked })} style={{ accentColor: storage.color }} />
        Obligatorio
      </label>
      {draft.field_type === 'select' ? (
        <label className="sm:col-span-3">
          <span className={fieldLabelClass}>Opciones (separadas por coma)</span>
          <input className={fieldControlClass} style={ring} value={draft.options} onChange={(e) => onChange({ ...draft, options: e.target.value })} placeholder="Ej. Mañana, Tarde, Noche" />
        </label>
      ) : null}
    </div>
  )
}

/* ---------- Puestos que alimentan "Almacenador" ---------- */

function PositionsSection() {
  const [all, setAll] = useState<string[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [saved, setSaved] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([fetchPositionNames(), fetchIsqSettings()])
      .then(([p, s]) => {
        setAll([...new Set([...p, ...s.reporter_positions])])
        setSelected(s.reporter_positions)
        setSaved(s.reporter_positions)
      })
      .catch((e) => setError(errMsg(e)))
  }, [])

  const dirty = [...selected].sort().join('|') !== [...saved].sort().join('|')

  async function save() {
    if (!selected.length) return setError('Elige al menos un puesto.')
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      await saveIsqSettings({ reporter_positions: selected })
      setSaved(selected)
      setMsg('Guardado.')
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlassCard className="p-5">
      <h3 className="font-display text-base font-semibold text-white">Quién aparece en "Almacenador"</h3>
      <p className="mt-1 text-xs text-white/45">Empleados activos del catálogo (Configuraciones → Empleados) con alguno de estos puestos.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {all === null ? (
          <p className="text-sm text-white/45">Cargando…</p>
        ) : (
          all.map((p) => {
            const on = selected.includes(p)
            return (
              <button
                key={p}
                type="button"
                onClick={() => setSelected(on ? selected.filter((x) => x !== p) : [...selected, p])}
                className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                style={
                  on
                    ? { background: withAlpha(storage.color, 0.18), borderColor: storage.color, color: storage.color }
                    : { borderColor: 'var(--color-neurale-border)', color: 'rgba(255,255,255,0.55)' }
                }
              >
                {on ? '✓ ' : ''}
                {p}
              </button>
            )
          })
        )}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <PrimaryButton color={storage.color} disabled={busy || !dirty} onClick={save}>
          Guardar puestos
        </PrimaryButton>
        {msg ? <span className="text-sm" style={{ color: storage.color }}>{msg}</span> : null}
      </div>
      {error ? <p className="mt-2 text-sm text-rose-400">{error}</p> : null}
    </GlassCard>
  )
}
