import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

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
  DISCREPANCY_KINDS,
  DISCREPANCY_LABELS,
  PALLETS_NAME,
  REFERENCES_NAME,
  REFERENCE_STATUSES,
  REFERENCE_STATUS_COLORS,
  REFERENCE_STATUS_LABELS,
  createPalletRecord,
  deletePalletRecord,
  deleteReference,
  editReference,
  fetchIsSupervisor,
  fetchPalletRecords,
  fetchReferenceLines,
  fetchReferences,
  inboundUndoReference,
  inboundUpdateReference,
  processReference,
  reopenReference,
  subscribePallets,
  type Discrepancy,
  type DiscrepancyKind,
  type ReferenceLine,
  type ReferenceStatus,
  type ReferenceSummary,
} from './lib/pallets'

const storage = MODULES.find((m) => m.id === 'storage')!
const inbound = MODULES.find((m) => m.id === 'inbound')!
const ORANGE = REFERENCE_STATUS_COLORS.discrepancia

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

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
        .catch((e) => alive && setError(errMsg(e)))
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

/** Coordinador / jefe / gerente con acceso a Storage, gerencia o admin (lo decide la base). */
function useSupervisor() {
  const { adminUser } = useAuth()
  const [ok, setOk] = useState(false)
  useEffect(() => {
    if (!adminUser) return setOk(false)
    if (isManager(adminUser)) return setOk(true)
    let alive = true
    fetchIsSupervisor().then((v) => alive && setOk(v))
    return () => {
      alive = false
    }
  }, [adminUser])
  return ok
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

/** Recuadro modal (portal: `.neural-enter` deja un transform que atrapa a `position: fixed`). */
function Modal({ title, subtitle, onClose, children, footer }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border border-neurale-border bg-neurale-deep shadow-2xl">
        <div className="border-b border-neurale-border px-6 py-4">
          <h3 className="font-display text-lg font-semibold text-white">{title}</h3>
          {subtitle ? <div className="mt-1 text-sm text-white/55">{subtitle}</div> : null}
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-neurale-border px-6 py-4">{footer}</div>
      </div>
    </div>,
    document.body,
  )
}

function DiscrepancyList({ items }: { items: Discrepancy[] }) {
  if (!items.length) return null
  return (
    <ul className="space-y-1">
      {items.map((d, i) => (
        <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-md px-2 py-0.5 font-mono text-xs" style={{ background: withAlpha(ORANGE, 0.15), color: ORANGE }}>
            SKU {d.sku}
          </span>
          <span className="text-white/75">
            {DISCREPANCY_LABELS[d.kind] ?? d.kind} · {d.qty}
          </span>
        </li>
      ))}
    </ul>
  )
}

/* =====================================================================
 * Storage → Registro x Pallet
 * ===================================================================== */

interface RefRow {
  reference: string
  sku: string
}

const EMPTY_REF: RefRow = { reference: '', sku: '' }

/**
 * Cada registro suma sus pallets a los "pallets reales" de Storage en el
 * Diálogo Táctico (una sola vez) y aparece en cada una de sus referencias en
 * Control de Referencias. La fecha y la hora las pone el servidor.
 */
export function PalletRecordView() {
  const { adminUser } = useAuth()
  const supervisor = useSupervisor()
  const [stowers, setStowers] = useState<EmployeeOption[]>([])
  const [positions, setPositions] = useState<string[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [stowerId, setStowerId] = useState('')
  const [pallets, setPallets] = useState('')
  const [refs, setRefs] = useState<RefRow[]>([EMPTY_REF])
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
      .catch((e) => setLoadError(errMsg(e)))
    const i = setInterval(() => setToday(todaySV()), 60_000)
    return () => clearInterval(i)
  }, [])

  const list = usePalletsLive(() => fetchPalletRecords(today, today), [today])
  const ring = ringStyle(storage.color)
  const canReport = canReportIsq(adminUser)

  const totals = useMemo(() => {
    const d = list.data ?? []
    return { pallets: d.reduce((a, r) => a + r.pallets, 0), sku: d.reduce((a, r) => a + r.sku_count, 0) }
  }, [list.data])

  const setRef = (i: number, k: keyof RefRow, v: string) => setRefs((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSavedMsg(null)
    const stower = stowers.find((s) => s.id === stowerId)
    const n = Number(pallets)
    const clean = refs.map((r) => ({ reference: r.reference.trim(), sku_count: r.sku.trim() === '' ? 0 : Number(r.sku) }))
    const missing: string[] = []
    if (!stower) missing.push('Almacenador')
    if (!Number.isInteger(n) || n <= 0) missing.push('Número de pallets (entero mayor a 0)')
    if (clean.some((r) => !r.reference)) missing.push('Referencia (no puede quedar vacía)')
    if (clean.some((r) => !Number.isInteger(r.sku_count) || r.sku_count < 0)) missing.push('Cantidad de SKU (entero)')
    const keys = clean.map((r) => r.reference.toUpperCase())
    if (new Set(keys).size !== keys.length) missing.push('Referencias repetidas en el mismo pallet')
    if (missing.length) {
      setError(`Revisa: ${missing.join(', ')}.`)
      return
    }
    setSaving(true)
    try {
      await createPalletRecord({ stower_employee_id: stower!.id, stower_name: stower!.full_name, pallets: n, refs: clean })
      // Se conservan almacenador y referencias: suelen registrar varios seguidos.
      setPallets('')
      setRefs((rs) => rs.map((r) => ({ ...r, sku: '' })))
      setSavedMsg(`Registrado: ${n} pallet(s) · ${clean.map((r) => r.reference).join(' + ')}`)
      list.reload()
    } catch (err) {
      setError(errMsg(err) || 'No se pudo guardar el registro.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('¿Eliminar este registro? Sus pallets se restan del Diálogo Táctico y de sus referencias.')) return
    try {
      await deletePalletRecord(id)
      list.reload()
    } catch (err) {
      setError(errMsg(err))
    }
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title={PALLETS_NAME}
        subtitle="Registra los pallets almacenados. Se suman al instante a los pallets reales de Storage en el Diálogo Táctico y a cada una de sus referencias en Control de Referencias."
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
              <select className={fieldControlClass} style={ring} value={stowerId} onChange={(e) => setStowerId(e.target.value)}>
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
            <div className="grid grid-cols-2 gap-4">
              <label>
                <span className={fieldLabelClass}>Fecha</span>
                <input className={`${fieldControlClass} capitalize`} value={formatDateLongSV(today)} disabled readOnly />
                <span className="mt-1 block text-[11px] text-white/35">Automática al guardar.</span>
              </label>
              <label>
                <span className={fieldLabelClass}>Número de pallets *</span>
                <input className={fieldControlClass} style={ring} inputMode="numeric" value={pallets} onChange={(e) => setPallets(e.target.value)} placeholder="Ej. 1" />
              </label>
            </div>

            <div className="sm:col-span-2">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className={fieldLabelClass}>Referencias del pallet *</span>
                <span className="text-[11px] text-white/35">
                  Si en el mismo pallet va más de una referencia, agrégalas aquí: el pallet cuenta 1 vez en el Diálogo Táctico y cada referencia se procesa por separado.
                </span>
              </div>
              <div className="space-y-2">
                {refs.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_8rem_auto] items-end gap-3">
                    <label>
                      {i === 0 ? <span className="mb-1 block text-[11px] text-white/45">Referencia (No. de recepción / OC)</span> : null}
                      <input className={fieldControlClass} style={ring} value={r.reference} onChange={(e) => setRef(i, 'reference', e.target.value)} placeholder="Ej. OC-45879" />
                    </label>
                    <label>
                      {i === 0 ? <span className="mb-1 block text-[11px] text-white/45">Cantidad de SKU</span> : null}
                      <input className={fieldControlClass} style={ring} inputMode="numeric" value={r.sku} onChange={(e) => setRef(i, 'sku', e.target.value)} placeholder="Ej. 3" />
                    </label>
                    <button
                      type="button"
                      className="mb-2 px-1 text-lg leading-none text-white/35 hover:text-rose-400 disabled:opacity-20"
                      disabled={refs.length === 1}
                      onClick={() => setRefs((rs) => rs.filter((_, j) => j !== i))}
                      title="Quitar referencia"
                      aria-label="Quitar referencia"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="mt-2 text-sm font-medium" style={{ color: storage.color }} onClick={() => setRefs((rs) => [...rs, EMPTY_REF])}>
                + Agregar otra referencia
              </button>
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
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-white/60">
                    {r.refs.map((x) => (
                      <span
                        key={x.id}
                        className="rounded-md px-2 py-0.5 text-xs"
                        style={{ background: withAlpha(x.status ? REFERENCE_STATUS_COLORS[x.status] : storage.color, 0.12), color: 'var(--color-white)' }}
                      >
                        {x.reference} · {x.sku_count} SKU
                      </span>
                    ))}
                    <span className="text-white/50">· {r.stower_name}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white/40 tabular-nums">{formatTimeSV(r.recorded_at)}</span>
                  {supervisor ? (
                    <button
                      type="button"
                      onClick={() => remove(r.id)}
                      className="text-xs text-white/35 hover:text-rose-400"
                      title="Eliminar registro (coordinadores, jefes, gerencia, admin)"
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

type Dialog =
  | { kind: 'process'; ref: ReferenceSummary }
  | { kind: 'followup'; ref: ReferenceSummary }
  | { kind: 'edit'; ref: ReferenceSummary }
  | null

/**
 * Seguimiento por referencia: total de pallets y SKU de sus registros.
 * Storage la PROCESA (Almacenado total o Referencia con discrepancia, con
 * observación); Inbound la ACTUALIZA — con discrepancia, primero da
 * seguimiento.
 */
export function ReferenceControlView({ side }: { side: 'storage' | 'inbound' }) {
  const { adminUser } = useAuth()
  const supervisor = useSupervisor()
  const color = side === 'storage' ? storage.color : inbound.color
  const manager = isManager(adminUser)
  const canProcess = canConfigureIsq(adminUser)
  const canUpdate = manager || canFollowUpIsq(adminUser)
  const [filter, setFilter] = useState<ReferenceStatus[]>(
    side === 'storage' ? ['en_proceso', 'almacenado', 'discrepancia'] : ['almacenado', 'discrepancia'],
  )
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)

  const list = usePalletsLive(() => fetchReferences(filter), [filter.join(',')])
  const rows = useMemo(() => {
    const q = search.trim().toUpperCase()
    const data = (list.data ?? []).filter((r) => !q || r.reference.toUpperCase().includes(q))
    // En Inbound, las discrepancias van primero.
    return side === 'inbound' ? [...data].sort((a, b) => Number(b.status === 'discrepancia') - Number(a.status === 'discrepancia')) : data
  }, [list.data, search, side])
  const pendingDiscrepancies = (list.data ?? []).filter((r) => r.status === 'discrepancia').length

  async function run(id: string, fn: () => Promise<unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    setBusyId(id)
    setError(null)
    try {
      await fn()
      list.reload()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusyId(null)
    }
  }

  const toggle = (s: ReferenceStatus) =>
    setFilter((f) => (f.includes(s) ? (f.length > 1 ? f.filter((x) => x !== s) : f) : [...f, s]))

  const closeDialog = (changed?: boolean) => {
    setDialog(null)
    if (changed) list.reload()
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title={REFERENCES_NAME}
        subtitle={
          side === 'storage'
            ? 'Total de pallets almacenados por referencia (suma de Registro x Pallet). Cuando termines una referencia, dale Procesar: Almacenado total o Referencia con discrepancia.'
            : 'Referencias que Storage ya procesó. Las de discrepancia (naranja) necesitan seguimiento antes de actualizarlas en sistema.'
        }
      />

      {side === 'inbound' && pendingDiscrepancies > 0 ? (
        <div className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: withAlpha(ORANGE, 0.5), background: withAlpha(ORANGE, 0.1), color: ORANGE }}>
          <span className="text-lg leading-none">⚠</span>
          <span>
            {pendingDiscrepancies} referencia{pendingDiscrepancies === 1 ? '' : 's'} con discrepancia requiere{pendingDiscrepancies === 1 ? '' : 'n'} seguimiento antes de actualizar.
          </span>
        </div>
      ) : null}

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
          <table className="w-full min-w-[820px] text-sm">
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
              {rows.map((r) => {
                const alert = r.status === 'discrepancia'
                const busy = busyId === r.id
                return (
                  <tr
                    key={r.id}
                    className="border-t border-neurale-border align-top text-white/80"
                    style={alert ? { background: withAlpha(ORANGE, side === 'inbound' ? 0.1 : 0.05), boxShadow: `inset 3px 0 0 ${ORANGE}` } : undefined}
                  >
                    <td className="max-w-[20rem] px-4 py-2.5">
                      <span className="font-display font-semibold text-white">
                        {alert ? <span style={{ color: ORANGE }}>⚠ </span> : null}
                        {r.reference}
                      </span>
                      {r.process_note ? <p className="mt-0.5 text-xs text-white/55">Obs. Storage: {r.process_note}</p> : null}
                      {alert && r.discrepancies.length ? (
                        <p className="mt-0.5 text-xs" style={{ color: ORANGE }}>
                          {r.discrepancies.length} SKU con discrepancia: {r.discrepancies.map((d) => d.sku).join(', ')}
                        </p>
                      ) : null}
                      {r.followup_note ? <p className="mt-0.5 text-xs text-white/55">Seguimiento Inbound: {r.followup_note}</p> : null}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.pallets}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.sku_count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.records}</td>
                    <td className="px-4 py-2.5 text-xs text-white/55">{r.last_recorded_at ? formatDateTimeSV(r.last_recorded_at) : '—'}</td>
                    <td className="px-4 py-2.5">
                      <ReferenceBadge status={r.status} />
                      {r.status === 'actualizado' && r.system_updated_at ? (
                        <span className="mt-0.5 block text-[10px] text-white/35">{formatDateTimeSV(r.system_updated_at)}</span>
                      ) : r.status !== 'en_proceso' && r.stored_at ? (
                        <span className="mt-0.5 block text-[10px] text-white/35">{formatDateTimeSV(r.stored_at)}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2 [&_button]:whitespace-nowrap">
                        {side === 'storage' ? (
                          <>
                            {canProcess && r.status === 'en_proceso' ? (
                              <PrimaryButton color={storage.color} disabled={busy} onClick={() => setDialog({ kind: 'process', ref: r })}>
                                Procesar
                              </PrimaryButton>
                            ) : null}
                            {supervisor && (r.status === 'almacenado' || r.status === 'discrepancia') ? (
                              <GhostButton disabled={busy} onClick={() => run(r.id, () => reopenReference(r.id), `¿Reabrir la referencia ${r.reference}? Volverá a EN PROCESO y se borra lo procesado.`)}>
                                Reabrir
                              </GhostButton>
                            ) : null}
                            {supervisor ? (
                              <>
                                <GhostButton disabled={busy} onClick={() => setDialog({ kind: 'edit', ref: r })}>
                                  Editar
                                </GhostButton>
                                <GhostButton
                                  disabled={busy}
                                  className="hover:!text-rose-400"
                                  onClick={() =>
                                    run(
                                      r.id,
                                      () => deleteReference(r.id),
                                      `¿Eliminar la referencia ${r.reference}? Los pallets registrados SOLO con esta referencia también se eliminan y se restan del Diálogo Táctico. Los pallets que tengan otra referencia se conservan.`,
                                    )
                                  }
                                >
                                  Eliminar
                                </GhostButton>
                              </>
                            ) : null}
                          </>
                        ) : (
                          <>
                            {canUpdate && r.status === 'almacenado' ? (
                              <PrimaryButton
                                color={REFERENCE_STATUS_COLORS.actualizado}
                                disabled={busy}
                                onClick={() => run(r.id, () => inboundUpdateReference(r.id, '', true), `¿Marcar la referencia ${r.reference} como ACTUALIZADO?`)}
                              >
                                Actualizar
                              </PrimaryButton>
                            ) : null}
                            {canUpdate && r.status === 'discrepancia' ? (
                              <PrimaryButton color={ORANGE} disabled={busy} onClick={() => setDialog({ kind: 'followup', ref: r })}>
                                Dar seguimiento
                              </PrimaryButton>
                            ) : null}
                            {canUpdate && r.status === 'actualizado' ? (
                              <GhostButton disabled={busy} onClick={() => run(r.id, () => inboundUndoReference(r.id), `¿Deshacer ACTUALIZADO en ${r.reference}?`)}>
                                Deshacer
                              </GhostButton>
                            ) : null}
                            {r.status === 'en_proceso' ? <span className="text-xs text-white/35">Esperando a Storage</span> : null}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </GlassCard>
      )}

      {dialog?.kind === 'process' ? <ProcessDialog refRow={dialog.ref} onClose={closeDialog} /> : null}
      {dialog?.kind === 'followup' ? <FollowUpDialog refRow={dialog.ref} onClose={closeDialog} /> : null}
      {dialog?.kind === 'edit' ? <EditDialog refRow={dialog.ref} onClose={closeDialog} /> : null}
    </div>
  )
}

/* ---------- Procesar (Storage) ---------- */

interface DiscRow {
  sku: string
  qty: string
  kind: DiscrepancyKind
}

const EMPTY_DISC: DiscRow = { sku: '', qty: '', kind: 'faltante' }

function ProcessDialog({ refRow, onClose }: { refRow: ReferenceSummary; onClose: (changed?: boolean) => void }) {
  const [type, setType] = useState<'total' | 'discrepancia' | null>(null)
  const [note, setNote] = useState('')
  const [items, setItems] = useState<DiscRow[]>([EMPTY_DISC])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ring = ringStyle(storage.color)
  const setItem = (i: number, patch: Partial<DiscRow>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  async function send() {
    setError(null)
    if (!type) return setError('Elige una opción: Almacenado total o Referencia con discrepancia.')
    let clean: Discrepancy[] = []
    if (type === 'discrepancia') {
      clean = items.map((x) => ({ sku: x.sku.trim(), qty: Number(x.qty), kind: x.kind }))
      if (clean.some((x) => !x.sku)) return setError('Hay un SKU vacío.')
      if (clean.some((x) => !(x.qty > 0))) return setError('La cantidad de cada SKU debe ser mayor a 0.')
    }
    setSaving(true)
    try {
      await processReference(refRow.id, type, note, clean)
      onClose(true)
    } catch (e) {
      setError(errMsg(e))
      setSaving(false)
    }
  }

  const Option = ({ value, title, desc, c }: { value: 'total' | 'discrepancia'; title: string; desc: string; c: string }) => (
    <button
      type="button"
      onClick={() => setType(value)}
      className="flex-1 rounded-xl border px-4 py-3 text-left transition-colors"
      style={type === value ? { borderColor: c, background: withAlpha(c, 0.12) } : { borderColor: 'var(--color-neurale-border)' }}
    >
      <span className="flex items-center gap-2 font-display font-semibold" style={{ color: type === value ? c : 'var(--color-white)' }}>
        <span className="inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: c, background: type === value ? c : 'transparent' }} />
        {title}
      </span>
      <span className="mt-1 block text-xs text-white/50">{desc}</span>
    </button>
  )

  return (
    <Modal
      title={`Procesar · ${refRow.reference}`}
      subtitle={`${refRow.pallets} pallet(s) · ${refRow.sku_count} SKU · ${refRow.records} registro(s). Después de procesarla ya no se pueden registrar pallets en ella (salvo que un coordinador la reabra).`}
      onClose={() => onClose()}
      footer={
        <>
          <GhostButton onClick={() => onClose()}>Cancelar</GhostButton>
          <PrimaryButton color={type === 'discrepancia' ? ORANGE : storage.color} disabled={saving} onClick={send}>
            {saving ? 'Enviando…' : 'Enviar a Inbound'}
          </PrimaryButton>
        </>
      }
    >
      <label className="block">
        <span className={fieldLabelClass}>Observación para Inbound</span>
        <textarea className={`${fieldControlClass} min-h-[5rem]`} style={ring} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Pallet 3 con cajas golpeadas, se reubicó en rack B-12." />
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Option value="total" title="Almacenado total" desc="Todo cuadra. Inbound la verá lista para actualizar." c={REFERENCE_STATUS_COLORS.almacenado} />
        <Option value="discrepancia" title="Referencia con discrepancia" desc="Indica los SKU con diferencia. Inbound verá una alerta naranja." c={ORANGE} />
      </div>
      {type === 'discrepancia' ? (
        <div className="rounded-xl border p-4" style={{ borderColor: withAlpha(ORANGE, 0.4) }}>
          <span className={fieldLabelClass}>SKU con discrepancia *</span>
          <div className="mt-2 space-y-2">
            {items.map((x, i) => (
              <div key={i} className="grid grid-cols-[1fr_6rem_8rem_auto] items-end gap-2">
                <input className={fieldControlClass} style={ringStyle(ORANGE)} value={x.sku} onChange={(e) => setItem(i, { sku: e.target.value })} placeholder="Código SKU" aria-label="Código SKU" />
                <input className={fieldControlClass} style={ringStyle(ORANGE)} inputMode="decimal" value={x.qty} onChange={(e) => setItem(i, { qty: e.target.value })} placeholder="Cant." aria-label="Cantidad" />
                <select className={fieldControlClass} style={ringStyle(ORANGE)} value={x.kind} onChange={(e) => setItem(i, { kind: e.target.value as DiscrepancyKind })} aria-label="Tipo">
                  {DISCREPANCY_KINDS.map((k) => (
                    <option key={k} value={k} className="bg-neurale-deep">
                      {DISCREPANCY_LABELS[k]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="mb-2 px-1 text-lg leading-none text-white/35 hover:text-rose-400 disabled:opacity-20"
                  disabled={items.length === 1}
                  onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                  aria-label="Quitar SKU"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="mt-2 text-sm font-medium" style={{ color: ORANGE }} onClick={() => setItems((xs) => [...xs, EMPTY_DISC])}>
            + Agregar otro SKU
          </button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
    </Modal>
  )
}

/* ---------- Seguimiento (Inbound) ---------- */

function FollowUpDialog({ refRow, onClose }: { refRow: ReferenceSummary; onClose: (changed?: boolean) => void }) {
  const [note, setNote] = useState(refRow.followup_note ?? '')
  const [saving, setSaving] = useState<'save' | 'update' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function send(markUpdated: boolean) {
    setError(null)
    if (!note.trim()) return setError('Escribe el seguimiento de la discrepancia.')
    if (markUpdated && !window.confirm(`¿Marcar la referencia ${refRow.reference} como ACTUALIZADO?`)) return
    setSaving(markUpdated ? 'update' : 'save')
    try {
      await inboundUpdateReference(refRow.id, note, markUpdated)
      onClose(true)
    } catch (e) {
      setError(errMsg(e))
      setSaving(null)
    }
  }

  return (
    <Modal
      title={`Seguimiento · ${refRow.reference}`}
      subtitle={
        <span style={{ color: ORANGE }}>
          ⚠ Storage reportó discrepancia · {refRow.pallets} pallet(s) · {refRow.sku_count} SKU
          {refRow.stored_at ? ` · ${formatDateTimeSV(refRow.stored_at)}` : ''}
        </span>
      }
      onClose={() => onClose()}
      footer={
        <>
          <GhostButton onClick={() => onClose()}>Cerrar</GhostButton>
          <GhostButton disabled={!!saving} onClick={() => send(false)}>
            {saving === 'save' ? 'Guardando…' : 'Guardar seguimiento'}
          </GhostButton>
          <PrimaryButton color={REFERENCE_STATUS_COLORS.actualizado} disabled={!!saving} onClick={() => send(true)}>
            {saving === 'update' ? 'Actualizando…' : 'Guardar y marcar ACTUALIZADO'}
          </PrimaryButton>
        </>
      }
    >
      <div className="rounded-xl border p-4" style={{ borderColor: withAlpha(ORANGE, 0.4), background: withAlpha(ORANGE, 0.06) }}>
        <span className={fieldLabelClass}>SKU con discrepancia</span>
        <div className="mt-2">
          <DiscrepancyList items={refRow.discrepancies} />
        </div>
        <p className="mt-3 text-sm text-white/70">
          <span className="text-white/45">Observación de Storage: </span>
          {refRow.process_note || '—'}
        </p>
      </div>
      <label className="block">
        <span className={fieldLabelClass}>Seguimiento de Inbound *</span>
        <textarea
          className={`${fieldControlClass} min-h-[6rem]`}
          style={ringStyle(inbound.color)}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ej. Se confirmó faltante con proveedor, nota de crédito #123. Se ajustó la OC."
        />
      </label>
      {refRow.followup_at ? <p className="text-xs text-white/40">Último seguimiento guardado: {formatDateTimeSV(refRow.followup_at)}</p> : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
    </Modal>
  )
}

/* ---------- Editar (supervisor de Storage) ---------- */

function EditDialog({ refRow, onClose }: { refRow: ReferenceSummary; onClose: (changed?: boolean) => void }) {
  const [name, setName] = useState(refRow.reference)
  const [lines, setLines] = useState<ReferenceLine[] | null>(null)
  const [skus, setSkus] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ring = ringStyle(storage.color)

  useEffect(() => {
    fetchReferenceLines(refRow.id)
      .then((ls) => {
        setLines(ls)
        setSkus(Object.fromEntries(ls.map((l) => [l.id, String(l.sku_count)])))
      })
      .catch((e) => setError(errMsg(e)))
  }, [refRow.id])

  async function save() {
    setError(null)
    const clean = name.trim()
    if (!clean) return setError('La referencia no puede quedar vacía.')
    const changed = (lines ?? [])
      .map((l) => ({ id: l.id, sku_count: Number(skus[l.id]), before: l.sku_count }))
      .filter((x) => x.sku_count !== x.before)
    if (changed.some((x) => !Number.isInteger(x.sku_count) || x.sku_count < 0)) return setError('La cantidad de SKU debe ser un entero mayor o igual a 0.')
    const renamed = clean.toUpperCase() !== refRow.reference.trim().toUpperCase() || clean !== refRow.reference
    if (!renamed && !changed.length) return onClose()
    if (
      renamed &&
      clean.toUpperCase() !== refRow.reference.trim().toUpperCase() &&
      !window.confirm(`¿Cambiar la referencia a "${clean}"? Si ya existe una referencia con ese nombre, se unen (sus pallets pasan a esa referencia, que conserva su estado).`)
    )
      return
    setSaving(true)
    try {
      await editReference(
        refRow.id,
        clean,
        changed.map(({ id, sku_count }) => ({ id, sku_count })),
      )
      onClose(true)
    } catch (e) {
      setError(errMsg(e))
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Editar · ${refRow.reference}`}
      subtitle="Corrige el nombre de la referencia y la cantidad de SKU de cada pallet. Solo coordinadores, jefes, gerencia y admin."
      onClose={() => onClose()}
      footer={
        <>
          <GhostButton onClick={() => onClose()}>Cancelar</GhostButton>
          <PrimaryButton color={storage.color} disabled={saving || lines === null} onClick={save}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </PrimaryButton>
        </>
      }
    >
      <label className="block">
        <span className={fieldLabelClass}>Referencia</span>
        <input className={fieldControlClass} style={ring} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div>
        <span className={fieldLabelClass}>SKU por pallet registrado</span>
        {lines === null ? (
          <p className="mt-2 text-sm text-white/50">{error ? '' : 'Cargando…'}</p>
        ) : lines.length === 0 ? (
          <p className="mt-2 text-sm text-white/50">Esta referencia no tiene pallets registrados.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {lines.map((l) => (
              <div key={l.id} className="grid grid-cols-[1fr_7rem] items-center gap-3 rounded-lg border border-neurale-border px-3 py-2">
                <div className="min-w-0 text-sm">
                  <span className="text-white">
                    {l.pallets} pallet{l.pallets === 1 ? '' : 's'} · {l.stower_name}
                  </span>
                  <span className="block text-xs text-white/45">
                    {l.recorded_at ? formatDateTimeSV(l.recorded_at) : '—'}
                    {l.others.length ? ` · comparte pallet con ${l.others.join(', ')}` : ''}
                  </span>
                </div>
                <input
                  className={fieldControlClass}
                  style={ring}
                  inputMode="numeric"
                  value={skus[l.id] ?? ''}
                  onChange={(e) => setSkus((s) => ({ ...s, [l.id]: e.target.value }))}
                  aria-label="Cantidad de SKU"
                />
              </div>
            ))}
          </div>
        )}
      </div>
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
    </Modal>
  )
}
