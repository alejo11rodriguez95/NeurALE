import { useEffect, useMemo, useState, type FormEvent } from 'react'

import { useAuth } from '@/shared/auth/AuthContext'
import { GlassCard } from '@/shared/components/GlassCard'
import { MODULES, withAlpha } from '@/shared/modules'

import {
  fetchEmployeesForPositions,
  fetchIsqSettings,
  formatDateLongSV,
  formatDateTimeSV,
  formatTimeSV,
  todaySV,
  type EmployeeOption,
} from '../isq/lib/isq'
import {
  Chip,
  GhostButton,
  PrimaryButton,
  SectionTitle,
  canConfigureIsq,
  canFollowUpIsq,
  canReportIsq,
  fieldControlClass,
  fieldLabelClass,
  isManager,
  ringStyle,
} from '../isq/ui'
import {
  PALLETS_NAME,
  REFERENCES_NAME,
  REFERENCE_STATUSES,
  REFERENCE_STATUS_COLORS,
  REFERENCE_STATUS_LABELS,
  createPalletRecord,
  deletePalletRecord,
  fetchPalletRecords,
  fetchReferences,
  setReferenceStatus,
  subscribePallets,
  type ReferenceStatus,
} from './lib/pallets'

const storage = MODULES.find((m) => m.id === 'storage')!
const inbound = MODULES.find((m) => m.id === 'inbound')!

/** Carga + Realtime (registros y referencias) + respaldo cada 60 s. */
function usePalletsLive<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    let t: ReturnType<typeof setTimeout> | undefined
    const run = () =>
      load()
        .then((d) => {
          if (alive) {
            setData(d)
            setError(null)
          }
        })
        .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
    run()
    const unsub = subscribePallets(() => {
      clearTimeout(t)
      t = setTimeout(run, 300)
    })
    const poll = setInterval(run, 60_000)
    return () => {
      alive = false
      unsub()
      clearTimeout(t)
      clearInterval(poll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { data, error, reload: () => setTick((x) => x + 1) }
}

function ReferenceBadge({ status }: { status: ReferenceStatus }) {
  const c = REFERENCE_STATUS_COLORS[status]
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wider whitespace-nowrap"
      style={{ background: withAlpha(c, 0.15), color: c }}
    >
      {REFERENCE_STATUS_LABELS[status]}
    </span>
  )
}

/* =====================================================================
 * Storage → Registro x Pallet
 * ===================================================================== */

interface FormState {
  stowerId: string
  reference: string
  pallets: string
  sku: string
}

const EMPTY: FormState = { stowerId: '', reference: '', pallets: '', sku: '' }

/**
 * Cada registro suma sus pallets a los "pallets reales" de Storage en el
 * Diálogo Táctico y a su referencia en Control de Referencias. La fecha y la
 * hora las pone el servidor.
 */
export function PalletRecordView() {
  const { adminUser } = useAuth()
  const [stowers, setStowers] = useState<EmployeeOption[]>([])
  const [positions, setPositions] = useState<string[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [today, setToday] = useState(todaySV)

  useEffect(() => {
    fetchIsqSettings()
      .then(async (s) => {
        setPositions(s.reporter_positions)
        setStowers(await fetchEmployeesForPositions(s.reporter_positions))
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)))
    const i = setInterval(() => setToday(todaySV()), 60_000)
    return () => clearInterval(i)
  }, [])

  const list = usePalletsLive(() => fetchPalletRecords(today, today), [today])
  const ring = ringStyle(storage.color)
  const canReport = canReportIsq(adminUser)
  const canDelete = canConfigureIsq(adminUser)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }))

  const totals = useMemo(() => {
    const d = list.data ?? []
    return { pallets: d.reduce((a, r) => a + r.pallets, 0), sku: d.reduce((a, r) => a + r.sku_count, 0) }
  }, [list.data])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSavedMsg(null)
    const stower = stowers.find((s) => s.id === form.stowerId)
    const pallets = Number(form.pallets)
    const sku = form.sku.trim() === '' ? 0 : Number(form.sku)
    const missing: string[] = []
    if (!stower) missing.push('Almacenador')
    if (!form.reference.trim()) missing.push('Referencia')
    if (!Number.isInteger(pallets) || pallets <= 0) missing.push('Número de pallets (entero mayor a 0)')
    if (!Number.isInteger(sku) || sku < 0) missing.push('Cantidad de SKU (entero)')
    if (missing.length) {
      setError(`Revisa: ${missing.join(', ')}.`)
      return
    }
    setSaving(true)
    try {
      await createPalletRecord({
        stower_employee_id: stower!.id,
        stower_name: stower!.full_name,
        reference: form.reference.trim(),
        pallets,
        sku_count: sku,
      })
      // Se conservan almacenador y referencia: suelen registrar varios seguidos.
      setForm({ ...EMPTY, stowerId: form.stowerId, reference: form.reference })
      setSavedMsg(`Registrado: ${pallets} pallet(s) · Ref. ${form.reference.trim()}`)
      list.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el registro.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('¿Eliminar este registro? Sus pallets se restan del Diálogo Táctico y de la referencia.')) return
    try {
      await deletePalletRecord(id)
      list.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title={PALLETS_NAME}
        subtitle="Registra los pallets almacenados. Se suman al instante a los pallets reales de Storage en el Diálogo Táctico y al total de su referencia en Control de Referencias."
      />

      {loadError ? (
        <GlassCard className="p-6 text-sm text-rose-400">{loadError}</GlassCard>
      ) : !canReport ? (
        <GlassCard className="p-6 text-sm text-white/55">Solo los usuarios de Storage, gerencia o admin pueden registrar pallets.</GlassCard>
      ) : (
        <GlassCard className="p-6">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
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
              <span className="mt-1 block text-[11px] text-white/35">
                Puestos: {positions.join(', ') || '—'} (los mismos del ISQ; se cambian en Ajustes de Storage)
              </span>
            </label>
            <label>
              <span className={fieldLabelClass}>Referencia (No. de recepción / OC) *</span>
              <input className={fieldControlClass} style={ring} value={form.reference} onChange={(e) => set('reference', e.target.value)} placeholder="Ej. OC-45879" />
            </label>
            <label>
              <span className={fieldLabelClass}>Fecha</span>
              <input className={`${fieldControlClass} capitalize`} value={formatDateLongSV(today)} disabled readOnly />
              <span className="mt-1 block text-[11px] text-white/35">Automática: la pone el sistema al guardar.</span>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label>
                <span className={fieldLabelClass}>Número de pallets *</span>
                <input className={fieldControlClass} style={ring} inputMode="numeric" value={form.pallets} onChange={(e) => set('pallets', e.target.value)} placeholder="Ej. 1" />
              </label>
              <label>
                <span className={fieldLabelClass}>Cantidad de SKU</span>
                <input className={fieldControlClass} style={ring} inputMode="numeric" value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder="Ej. 3" />
              </label>
            </div>

            {error ? <p className="text-sm text-rose-400 sm:col-span-2">{error}</p> : null}
            {savedMsg ? (
              <p className="text-sm sm:col-span-2" style={{ color: storage.color }}>
                ✓ {savedMsg}
              </p>
            ) : null}
            <div className="sm:col-span-2">
              <PrimaryButton type="submit" color={storage.color} disabled={saving}>
                {saving ? 'Guardando…' : 'Registrar pallets'}
              </PrimaryButton>
            </div>
          </form>
        </GlassCard>
      )}

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-base font-semibold text-white">
            Registrados hoy <span className="text-white/45">· {list.data?.length ?? '…'}</span>
          </h3>
          <div className="flex gap-2 text-xs">
            <span className="rounded-full px-2.5 py-0.5" style={{ background: withAlpha(storage.color, 0.12), color: storage.color }}>
              {totals.pallets} pallets
            </span>
            <span className="rounded-full px-2.5 py-0.5" style={{ background: withAlpha(storage.color, 0.12), color: storage.color }}>
              {totals.sku} SKU
            </span>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {list.error ? (
            <GlassCard className="p-5 text-sm text-rose-400">{list.error}</GlassCard>
          ) : list.data === null ? (
            <GlassCard className="p-5 text-sm text-white/50">Cargando…</GlassCard>
          ) : list.data.length === 0 ? (
            <GlassCard className="p-5 text-sm text-white/50">Todavía no hay pallets registrados hoy.</GlassCard>
          ) : (
            list.data.map((r) => (
              <GlassCard key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <span className="font-display font-semibold text-white">
                    {r.pallets} pallet{r.pallets === 1 ? '' : 's'} · {r.sku_count} SKU
                  </span>
                  <p className="mt-0.5 text-sm text-white/60">
                    Ref. {r.reference} · {r.stower_name}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white/40 tabular-nums">{formatTimeSV(r.recorded_at)}</span>
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() => remove(r.id)}
                      className="text-xs text-white/35 hover:text-rose-400"
                      title="Eliminar registro (solo jefe de Storage, gerencia, admin)"
                    >
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

/* =====================================================================
 * Control de Referencias (Storage e Inbound)
 * ===================================================================== */

/**
 * Seguimiento por referencia: total de pallets y SKU sumados de todos los
 * registros. Storage la marca ALMACENADO cuando termina; entonces Inbound
 * puede marcarla ACTUALIZADO.
 */
export function ReferenceControlView({ side }: { side: 'storage' | 'inbound' }) {
  const { adminUser } = useAuth()
  const color = side === 'storage' ? storage.color : inbound.color
  const manager = isManager(adminUser)
  const canStore = canConfigureIsq(adminUser) // ALMACENADO / reabrir
  const canUpdate = manager || canFollowUpIsq(adminUser) // ACTUALIZADO / deshacer
  const [filter, setFilter] = useState<ReferenceStatus[]>(side === 'storage' ? ['en_proceso', 'almacenado'] : ['almacenado'])
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const list = usePalletsLive(() => fetchReferences(filter), [filter.join(',')])
  const rows = useMemo(() => {
    const q = search.trim().toUpperCase()
    return (list.data ?? []).filter((r) => !q || r.reference.toUpperCase().includes(q))
  }, [list.data, search])

  async function move(id: string, status: ReferenceStatus, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    setBusyId(id)
    setError(null)
    try {
      await setReferenceStatus(id, status)
      list.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  const toggle = (s: ReferenceStatus) =>
    setFilter((f) => (f.includes(s) ? (f.length > 1 ? f.filter((x) => x !== s) : f) : [...f, s]))

  return (
    <div className="space-y-5">
      <SectionTitle
        title={REFERENCES_NAME}
        subtitle={
          side === 'storage'
            ? 'Total de pallets almacenados por referencia (suma de Registro x Pallet). Cuando termines una referencia, márcala ALMACENADO para que Inbound la actualice.'
            : 'Referencias que Storage ya terminó de almacenar. Cuando la actualices en sistema, márcala ACTUALIZADO.'
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2">
          {REFERENCE_STATUSES.map((s) => (
            <Chip key={s} active={filter.includes(s)} color={REFERENCE_STATUS_COLORS[s]} onClick={() => toggle(s)}>
              {REFERENCE_STATUS_LABELS[s]}
            </Chip>
          ))}
        </div>
        <label className="ml-auto min-w-[14rem]">
          <span className={fieldLabelClass}>Buscar referencia</span>
          <input className={fieldControlClass} style={ringStyle(color)} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ej. OC-45879" />
        </label>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      {list.error ? (
        <GlassCard className="p-5 text-sm text-rose-400">{list.error}</GlassCard>
      ) : list.data === null ? (
        <GlassCard className="p-5 text-sm text-white/50">Cargando…</GlassCard>
      ) : rows.length === 0 ? (
        <GlassCard className="p-5 text-sm text-white/50">No hay referencias con ese filtro.</GlassCard>
      ) : (
        <GlassCard className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-[11px] tracking-wider text-white/45 uppercase">
                <th className="px-4 py-3 font-medium">Referencia</th>
                <th className="px-4 py-3 text-right font-medium">Pallets</th>
                <th className="px-4 py-3 text-right font-medium">SKU</th>
                <th className="px-4 py-3 text-right font-medium">Registros</th>
                <th className="px-4 py-3 font-medium">Último registro</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-neurale-border text-white/80">
                  <td className="px-4 py-2.5 font-display font-semibold text-white">{r.reference}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.pallets}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.sku_count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.records}</td>
                  <td className="px-4 py-2.5 text-xs text-white/55">{r.last_recorded_at ? formatDateTimeSV(r.last_recorded_at) : '—'}</td>
                  <td className="px-4 py-2.5">
                    <ReferenceBadge status={r.status} />
                    {r.status === 'actualizado' && r.system_updated_at ? (
                      <span className="mt-0.5 block text-[10px] text-white/35">{formatDateTimeSV(r.system_updated_at)}</span>
                    ) : r.status === 'almacenado' && r.stored_at ? (
                      <span className="mt-0.5 block text-[10px] text-white/35">{formatDateTimeSV(r.stored_at)}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {side === 'storage' && canStore && r.status === 'en_proceso' ? (
                      <PrimaryButton
                        color={REFERENCE_STATUS_COLORS.almacenado}
                        disabled={busyId === r.id}
                        onClick={() => move(r.id, 'almacenado', `¿Marcar la referencia ${r.reference} como ALMACENADO (${r.pallets} pallets)? Ya no se podrán registrar más pallets en ella hasta reabrirla.`)}
                      >
                        Marcar ALMACENADO
                      </PrimaryButton>
                    ) : null}
                    {side === 'storage' && canStore && r.status === 'almacenado' ? (
                      <GhostButton disabled={busyId === r.id} onClick={() => move(r.id, 'en_proceso', `¿Reabrir la referencia ${r.reference}? Volverá a EN PROCESO.`)}>
                        Reabrir
                      </GhostButton>
                    ) : null}
                    {side === 'inbound' && canUpdate && r.status === 'almacenado' ? (
                      <PrimaryButton
                        color={REFERENCE_STATUS_COLORS.actualizado}
                        disabled={busyId === r.id}
                        onClick={() => move(r.id, 'actualizado', `¿Marcar la referencia ${r.reference} como ACTUALIZADO?`)}
                      >
                        Marcar ACTUALIZADO
                      </PrimaryButton>
                    ) : null}
                    {side === 'inbound' && canUpdate && r.status === 'actualizado' ? (
                      <GhostButton disabled={busyId === r.id} onClick={() => move(r.id, 'almacenado', `¿Deshacer ACTUALIZADO en ${r.reference}?`)}>
                        Deshacer
                      </GhostButton>
                    ) : null}
                    {side === 'inbound' && r.status === 'en_proceso' ? (
                      <span className="text-xs text-white/35">Esperando a Storage</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      )}
    </div>
  )
}
