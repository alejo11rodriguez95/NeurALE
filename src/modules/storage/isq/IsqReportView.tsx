import { useEffect, useMemo, useState } from 'react'

import { useAuth } from '@/shared/auth/AuthContext'
import { GlassCard } from '@/shared/components/GlassCard'
import { MODULES, withAlpha } from '@/shared/modules'

import {
  ISQ_NAME,
  createIsqIncident,
  deleteIsqIncident,
  fetchEmployeesForPositions,
  fetchIsqFields,
  fetchIsqIncidents,
  fetchIsqSettings,
  fetchIsqTypes,
  formatDateLongSV,
  formatTimeSV,
  todaySV,
  type EmployeeOption,
  type IsqField,
  type IsqType,
} from './lib/isq'
import {
  PrimaryButton,
  SectionTitle,
  StatusBadge,
  canConfigureIsq,
  canReportIsq,
  fieldControlClass,
  fieldLabelClass,
  ringStyle,
  useIsqLive,
} from './ui'

const storage = MODULES.find((m) => m.id === 'storage')!

interface FormState {
  sku: string
  reference: string
  stowerId: string
  typeId: string
  extra: Record<string, string>
}

const EMPTY: FormState = { sku: '', reference: '', stowerId: '', typeId: '', extra: {} }

/**
 * Storage → "Inbound-Storage Quality (ISQ)": el almacenador reporta a Inbound
 * lo que encontró al almacenar un pallet. La fecha la pone el servidor (hoy,
 * hora El Salvador); debajo se listan los reportes del día.
 */
export function IsqReportView() {
  const { adminUser } = useAuth()
  const [types, setTypes] = useState<IsqType[] | null>(null)
  const [fields, setFields] = useState<IsqField[]>([])
  const [stowers, setStowers] = useState<EmployeeOption[]>([])
  const [positions, setPositions] = useState<string[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [today, setToday] = useState(todaySV)

  useEffect(() => {
    Promise.all([fetchIsqTypes(), fetchIsqFields(), fetchIsqSettings()])
      .then(async ([t, f, s]) => {
        setTypes(t)
        setFields(f)
        setPositions(s.reporter_positions)
        setStowers(await fetchEmployeesForPositions(s.reporter_positions))
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)))
    const i = setInterval(() => setToday(todaySV()), 60_000)
    return () => clearInterval(i)
  }, [])

  const list = useIsqLive(() => fetchIsqIncidents(today, today), [today])
  const ring = ringStyle(storage.color)
  const canReport = canReportIsq(adminUser)
  const canDelete = canConfigureIsq(adminUser)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }))
  const setExtra = (id: string, v: string) => setForm((p) => ({ ...p, extra: { ...p.extra, [id]: v } }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSavedMsg(null)
    const type = types?.find((t) => t.id === form.typeId)
    const stower = stowers.find((s) => s.id === form.stowerId)
    const missing: string[] = []
    if (!form.sku.trim()) missing.push('SKU')
    if (!form.reference.trim()) missing.push('Referencia')
    if (!stower) missing.push('Almacenador')
    if (!type) missing.push('Tipo de incidencia')
    fields.forEach((f) => f.required && !(form.extra[f.id] ?? '').trim() && missing.push(f.label))
    if (missing.length) {
      setError(`Completa: ${missing.join(', ')}.`)
      return
    }
    setSaving(true)
    try {
      await createIsqIncident({
        sku: form.sku.trim(),
        reference: form.reference.trim(),
        stower_employee_id: stower!.id,
        stower_name: stower!.full_name,
        type_id: type!.id,
        type_label: type!.label,
        extra: fields
          .filter((f) => (form.extra[f.id] ?? '').trim())
          .map((f) => ({ field_id: f.id, label: f.label, value: form.extra[f.id].trim() })),
      })
      // Se conserva el almacenador: suele reportar varias seguidas.
      setForm({ ...EMPTY, stowerId: form.stowerId })
      setSavedMsg(`Incidencia enviada a Inbound: ${type!.label} · SKU ${form.sku.trim()}`)
      list.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la incidencia.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('¿Eliminar este reporte? Esta acción no se puede deshacer.')) return
    try {
      await deleteIsqIncident(id)
      list.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const byType = useMemo(() => {
    const m = new Map<string, number>()
    list.data?.forEach((i) => m.set(i.type_label, (m.get(i.type_label) ?? 0) + 1))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [list.data])

  return (
    <div className="space-y-6">
      <SectionTitle
        title={ISQ_NAME}
        subtitle="Reporta a Inbound lo que encontraste al almacenar. La incidencia llega al instante a Inbound, al Dash Storage y al Diálogo Táctico."
      />

      {loadError ? (
        <GlassCard className="p-6 text-sm text-rose-400">{loadError}</GlassCard>
      ) : !canReport ? (
        <GlassCard className="p-6 text-sm text-white/55">Solo los usuarios de Storage, gerencia o admin pueden reportar ISQ.</GlassCard>
      ) : (
        <GlassCard className="p-6">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className={fieldLabelClass}>SKU *</span>
              <input className={fieldControlClass} style={ring} value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder="Ej. 0012345" autoFocus />
            </label>
            <label>
              <span className={fieldLabelClass}>Referencia (No. de recepción / OC) *</span>
              <input className={fieldControlClass} style={ring} value={form.reference} onChange={(e) => set('reference', e.target.value)} placeholder="Ej. OC-45879" />
            </label>
            <label>
              <span className={fieldLabelClass}>Almacenador *</span>
              <select className={fieldControlClass} style={ring} value={form.stowerId} onChange={(e) => set('stowerId', e.target.value)}>
                <option value="" className="bg-neurale-deep">
                  {stowers.length ? 'Selecciona…' : 'No hay empleados activos con ese puesto'}
                </option>
                {stowers.map((s) => (
                  <option key={s.id} value={s.id} className="bg-neurale-deep">
                    {s.full_name} · {s.employee_code}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-white/35">Puestos: {positions.join(', ') || '—'} (se cambia en Ajustes de Storage)</span>
            </label>
            <label>
              <span className={fieldLabelClass}>Fecha</span>
              <input className={`${fieldControlClass} capitalize`} value={formatDateLongSV(today)} disabled readOnly />
              <span className="mt-1 block text-[11px] text-white/35">Automática: la pone el sistema al guardar.</span>
            </label>
            <label className="sm:col-span-2">
              <span className={fieldLabelClass}>Tipo de incidencia *</span>
              <select className={fieldControlClass} style={ring} value={form.typeId} onChange={(e) => set('typeId', e.target.value)}>
                <option value="" className="bg-neurale-deep">
                  {types === null ? 'Cargando…' : 'Selecciona…'}
                </option>
                {types?.map((t) => (
                  <option key={t.id} value={t.id} className="bg-neurale-deep">
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            {fields.map((f) => (
              <label key={f.id} className={f.field_type === 'text' ? 'sm:col-span-2' : ''}>
                <span className={fieldLabelClass}>
                  {f.label}
                  {f.required ? ' *' : ''}
                </span>
                {f.field_type === 'select' ? (
                  <select className={fieldControlClass} style={ring} value={form.extra[f.id] ?? ''} onChange={(e) => setExtra(f.id, e.target.value)}>
                    <option value="" className="bg-neurale-deep">
                      Selecciona…
                    </option>
                    {f.options.map((o) => (
                      <option key={o} value={o} className="bg-neurale-deep">
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={f.field_type === 'number' ? 'number' : f.field_type === 'date' ? 'date' : 'text'}
                    step={f.field_type === 'number' ? 'any' : undefined}
                    className={`${fieldControlClass} ${f.field_type === 'date' ? '[color-scheme:dark]' : ''}`}
                    style={ring}
                    value={form.extra[f.id] ?? ''}
                    onChange={(e) => setExtra(f.id, e.target.value)}
                  />
                )}
              </label>
            ))}

            {error ? <p className="text-sm text-rose-400 sm:col-span-2">{error}</p> : null}
            {savedMsg ? <p className="text-sm sm:col-span-2" style={{ color: storage.color }}>✓ {savedMsg}</p> : null}

            <div className="sm:col-span-2">
              <PrimaryButton type="submit" color={storage.color} disabled={saving || types === null}>
                {saving ? 'Enviando…' : 'Reportar a Inbound'}
              </PrimaryButton>
            </div>
          </form>
        </GlassCard>
      )}

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-base font-semibold text-white">
            Reportadas hoy <span className="text-white/45">· {list.data?.length ?? '…'}</span>
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {byType.slice(0, 4).map(([label, n]) => (
              <span key={label} className="rounded-full px-2.5 py-0.5 text-[11px]" style={{ background: withAlpha(storage.color, 0.12), color: storage.color }}>
                {label} · {n}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {list.error ? (
            <GlassCard className="p-5 text-sm text-rose-400">{list.error}</GlassCard>
          ) : list.data === null ? (
            <GlassCard className="p-5 text-sm text-white/50">Cargando…</GlassCard>
          ) : list.data.length === 0 ? (
            <GlassCard className="p-5 text-sm text-white/50">Todavía no hay incidencias reportadas hoy.</GlassCard>
          ) : (
            list.data.map((i) => (
              <GlassCard key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-semibold text-white">{i.type_label}</span>
                    <StatusBadge status={i.status} />
                  </div>
                  <p className="mt-0.5 text-sm text-white/60">
                    SKU {i.sku} · Ref. {i.reference} · {i.stower_name}
                  </p>
                  {i.extra.length ? (
                    <p className="mt-0.5 text-xs text-white/40">{i.extra.map((x) => `${x.label}: ${x.value}`).join(' · ')}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white/40 tabular-nums">{formatTimeSV(i.reported_at)}</span>
                  {canDelete ? (
                    <button type="button" onClick={() => remove(i.id)} className="text-xs text-white/35 hover:text-rose-400" title="Eliminar reporte (solo jefe de Storage, gerencia, admin)">
                      Eliminar
                    </button>
                  ) : null}
                </div>
              </GlassCard>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
