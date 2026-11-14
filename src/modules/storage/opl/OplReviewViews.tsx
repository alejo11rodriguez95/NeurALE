import { useMemo, useState } from 'react'

import { Chip, GhostButton, PrimaryButton, SectionTitle, fieldControlClass, fieldLabelClass, ringStyle } from '@/modules/storage/isq/ui'
import { GlassCard } from '@/shared/components/GlassCard'
import { MODULES, withAlpha } from '@/shared/modules'

import {
  REVIEW_STATUS_COLORS,
  REVIEW_STATUS_LABELS,
  closeReview,
  deleteExtra,
  fetchAuditExtras,
  fetchAuditLines,
  fetchAudits,
  fetchCounters,
  fetchOperators,
  fetchSkuLines,
  fetchSkuSummary,
  fmtNum,
  pctOf,
  recountKey,
  reopenReview,
  type OplAudit,
  type SkuLine,
  type SkuSummary,
} from './lib/opl'
import { AuditCard, Badge, EmptyState, ErrorState, Kpi, ProgressBar, useOplLive } from './ui'

const storage = MODULES.find((m) => m.id === 'storage')!
const C = storage.color
const ring = ringStyle(C)
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/* ---------- Selector de auditoría (compartido) ---------- */

function useAuditsWithOperators() {
  return useOplLive(async () => {
    const [audits, ops] = await Promise.all([fetchAudits(), fetchOperators(true)])
    const names = new Map(ops.map((o) => [o.id, o.name]))
    return audits.map((a) => ({ audit: a, operator: names.get(a.operator_id) ?? '' }))
  }, [])
}

function AuditPicker({ onPick, hint }: { onPick: (id: string) => void; hint: string }) {
  const { data, error } = useAuditsWithOperators()
  if (error) return <ErrorState>{error}</ErrorState>
  if (!data) return <EmptyState>Cargando…</EmptyState>
  if (!data.length) return <EmptyState>Todavía no hay auditorías cargadas.</EmptyState>
  return (
    <div className="space-y-3">
      <p className="text-sm text-white/55">{hint}</p>
      {data.map(({ audit, operator }) => (
        <AuditCard key={audit.id} audit={audit} operatorName={operator} color={C} onOpen={() => onPick(audit.id)} />
      ))}
    </div>
  )
}

function AuditHeader({ audit, onChange }: { audit: OplAudit | undefined; onChange: () => void }) {
  if (!audit) return null
  return (
    <GlassCard className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <p className="font-display text-base font-semibold text-white">{audit.folio}</p>
        <p className="text-xs text-white/45">
          {audit.file_name} · {fmtNum(audit.counted_lines)}/{fmtNum(audit.line_count)} {audit.mapping.key_label} contados
        </p>
      </div>
      <GhostButton onClick={onChange}>Cambiar auditoría</GhostButton>
    </GlassCard>
  )
}

/* ---------- Estado por SKU ---------- */

type SkuState = 'pendiente' | 'contando' | 'cuadra' | 'discrepancia' | 'reconteo' | 'cuadrado' | 'diferencia_confirmada'

const SKU_STATE_LABELS: Record<SkuState, string> = {
  pendiente: 'Sin contar',
  contando: 'Contando',
  cuadra: 'Cuadra',
  discrepancia: 'Discrepancia',
  reconteo: 'En reconteo',
  cuadrado: 'Cuadró en reconteo',
  diferencia_confirmada: 'Diferencia confirmada',
}
const SKU_STATE_COLORS: Record<SkuState, string> = {
  pendiente: '#94a3b8',
  contando: '#22d3ee',
  cuadra: '#4ade80',
  discrepancia: '#f87171',
  reconteo: '#facc15',
  cuadrado: '#4ade80',
  diferencia_confirmada: '#fb923c',
}

function skuState(s: SkuSummary): SkuState {
  if (s.review_status) return s.review_status
  if (s.discrepancy) return 'discrepancia'
  if (s.complete) return 'cuadra'
  return s.lines_counted > 0 ? 'contando' : 'pendiente'
}

/* =====================================================================
 * Revisión de Discrepancias
 * ===================================================================== */

export function OplDiscrepancyView({
  auditId,
  canManage,
  onPickAudit,
}: {
  auditId: string | null
  canManage: boolean
  onPickAudit: (id: string | null) => void
}) {
  return (
    <div className="space-y-5">
      <SectionTitle
        title="Revisión de Discrepancias"
        subtitle="Aparece un SKU cuando ya se contaron todos sus LPN (o se cerró la auditoría) y el total no cuadra con el formato. Se recuenta cada LPN y el jefe de Storage cierra el SKU."
      />
      {auditId ? (
        <DiscrepancyList auditId={auditId} canManage={canManage} onChange={() => onPickAudit(null)} />
      ) : (
        <AuditPicker onPick={onPickAudit} hint="Elige la auditoría a revisar." />
      )}
    </div>
  )
}

function DiscrepancyList({ auditId, canManage, onChange }: { auditId: string; canManage: boolean; onChange: () => void }) {
  const audits = useOplLive(() => fetchAudits(), [])
  const audit = audits.data?.find((a) => a.id === auditId)
  const { data, error, reload } = useOplLive(() => fetchSkuSummary(auditId), [auditId, audit?.counted_lines, audit?.counted_units])
  const [filter, setFilter] = useState<'abiertas' | 'cerradas'>('abiertas')
  const [open, setOpen] = useState<string | null>(null)

  const list = useMemo(() => {
    const d = (data ?? []).filter((s) => s.discrepancy)
    return d.filter((s) =>
      filter === 'abiertas' ? !s.review_status || s.review_status === 'reconteo' : s.review_status === 'cuadrado' || s.review_status === 'diferencia_confirmada',
    )
  }, [data, filter])
  const openCount = (data ?? []).filter((s) => s.discrepancy && (!s.review_status || s.review_status === 'reconteo')).length

  return (
    <div className="space-y-4">
      <AuditHeader audit={audit} onChange={onChange} />
      <div className="flex flex-wrap gap-2">
        <Chip color={C} active={filter === 'abiertas'} onClick={() => setFilter('abiertas')}>
          Por revisar ({openCount})
        </Chip>
        <Chip color={C} active={filter === 'cerradas'} onClick={() => setFilter('cerradas')}>
          Cerradas
        </Chip>
      </div>
      {error ? <ErrorState>{error}</ErrorState> : null}
      {data === null ? (
        <EmptyState>Cargando…</EmptyState>
      ) : list.length === 0 ? (
        <EmptyState>
          {filter === 'abiertas'
            ? 'No hay discrepancias por revisar. Un SKU aparece aquí cuando se cuentan todos sus LPN y el total no cuadra.'
            : 'Todavía no se ha cerrado ninguna discrepancia.'}
        </EmptyState>
      ) : (
        list.map((s) => {
          const st = skuState(s)
          const diff = s.final_qty !== null && s.expected !== null ? s.final_qty - s.expected : null
          return (
            <GlassCard key={s.sku} className="p-4" style={{ borderColor: withAlpha(SKU_STATE_COLORS[st], 0.4) }}>
              <button type="button" className="w-full text-left" onClick={() => setOpen(open === s.sku ? null : s.sku)}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-base font-semibold text-white">SKU {s.sku}</span>
                    <Badge color={REVIEW_STATUS_COLORS[s.review_status ?? 'pendiente']}>{REVIEW_STATUS_LABELS[s.review_status ?? 'pendiente']}</Badge>
                  </div>
                  <span className="text-xs text-white/50 tabular-nums">
                    {s.lines_recounted}/{s.lines_total} recontados {open === s.sku ? '▲' : '▼'}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-white/65">{s.description}</p>
                {canManage ? (
                  <p className="mt-1 text-xs text-white/55 tabular-nums">
                    Formato {fmtNum(s.expected)} · Contado {fmtNum(s.final_qty)}
                    {s.extra_qty ? ` (incl. ${fmtNum(s.extra_qty)} sobrante)` : ''} ·{' '}
                    <b style={{ color: diff === 0 ? '#4ade80' : '#f87171' }}>
                      Dif. {diff !== null && diff > 0 ? '+' : ''}
                      {fmtNum(diff)}
                    </b>
                  </p>
                ) : null}
                {s.review_note ? <p className="mt-1 text-xs text-white/55">Nota: {s.review_note}</p> : null}
              </button>
              {open === s.sku ? <SkuRecount auditId={auditId} summary={s} canManage={canManage} onChanged={reload} /> : null}
            </GlassCard>
          )
        })
      )}
    </div>
  )
}

function SkuRecount({ auditId, summary, canManage, onChanged }: { auditId: string; summary: SkuSummary; canManage: boolean; onChanged: () => void }) {
  const { data, error, reload } = useOplLive(() => fetchSkuLines(auditId, summary.sku), [auditId, summary.sku, summary.lines_recounted, summary.extra_lines])
  const [note, setNote] = useState(summary.review_note ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const closed = summary.review_status === 'cuadrado' || summary.review_status === 'diferencia_confirmada'
  const lines = data?.filter((l) => !l.is_extra) ?? []
  const allRecounted = lines.length > 0 && lines.every((l) => l.recounted)
  const finalQty = summary.final_qty
  const diff = finalQty !== null && summary.expected !== null ? finalQty - summary.expected : null

  async function close(status: 'cuadrado' | 'diferencia_confirmada') {
    setBusy(true)
    setMsg(null)
    try {
      await closeReview(auditId, summary.sku, status, note)
      onChanged()
    } catch (e) {
      setMsg(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-neurale-border pt-4">
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {!closed ? (
        <p className="text-xs text-white/50">
          Reconteo a ciegas: cuenta otra vez cada LPN y escribe lo que hay. De preferencia, que lo haga otra persona.
        </p>
      ) : null}
      {data === null ? (
        <p className="text-sm text-white/45">Cargando…</p>
      ) : (
        <ul className="space-y-2">
          {data.map((l) => (
            <RecountRow key={(l.is_extra ? 'x' : 'l') + l.key_value} auditId={auditId} line={l} canManage={canManage} closed={closed} onSaved={reload} />
          ))}
        </ul>
      )}

      {canManage ? (
        closed ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-white/60">
            <span>
              Cerrado por {summary.review_closed_by ?? '—'}
              {summary.review_closed_at ? ` · ${new Date(summary.review_closed_at).toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
            </span>
            <GhostButton onClick={() => reopenReview(auditId, summary.sku).then(onChanged).catch((e) => setMsg(errMsg(e)))}>Reabrir</GhostButton>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-neurale-border bg-white/[0.03] p-3">
            <p className="text-sm text-white/75 tabular-nums">
              Con el reconteo: {fmtNum(finalQty)} de {fmtNum(summary.expected)} ·{' '}
              <b style={{ color: diff === 0 ? '#4ade80' : '#f87171' }}>
                {diff === 0 ? 'cuadra' : `diferencia ${diff !== null && diff > 0 ? '+' : ''}${fmtNum(diff)}`}
              </b>
              {!allRecounted ? <span className="text-white/45"> · faltan LPN por recontar</span> : null}
            </p>
            <label className="block">
              <span className={fieldLabelClass}>Nota (obligatoria para confirmar diferencia)</span>
              <input className={fieldControlClass} style={ring} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. 1 unidad dañada, se reporta al OPL" />
            </label>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton color="#4ade80" disabled={busy || !allRecounted || diff !== 0} onClick={() => close('cuadrado')}>
                Cuadró en reconteo
              </PrimaryButton>
              <PrimaryButton color="#fb923c" disabled={busy || !allRecounted || !note.trim()} onClick={() => close('diferencia_confirmada')}>
                Confirmar diferencia
              </PrimaryButton>
            </div>
          </div>
        )
      ) : null}
      {msg ? <p className="text-sm text-rose-400">{msg}</p> : null}
    </div>
  )
}

function RecountRow({ auditId, line, canManage, closed, onSaved }: { auditId: string; line: SkuLine; canManage: boolean; closed: boolean; onSaved: () => void }) {
  const [qty, setQty] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const mismatch = canManage && !line.is_extra && line.counted !== null && line.expected !== null && line.counted !== line.expected

  async function save() {
    const q = Number(qty.replace(',', '.'))
    if (qty.trim() === '' || !Number.isFinite(q) || q < 0) return setErr('Cantidad inválida.')
    setBusy(true)
    setErr(null)
    try {
      await recountKey(auditId, line.key_value, q)
      setQty('')
      onSaved()
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-xl border px-3 py-2" style={{ borderColor: mismatch ? 'rgba(248,113,113,0.4)' : 'var(--color-neurale-border)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-white">
            {line.key_value} <span className="text-white/45">· {line.location ?? '—'}</span>
            {line.is_extra ? (
              <span className="ml-2">
                <Badge color="#fb923c">Sobrante</Badge>
              </span>
            ) : null}
          </p>
          {canManage ? (
            <p className="text-xs text-white/50 tabular-nums">
              {line.is_extra
                ? `Registrado ${fmtNum(line.counted)} por ${line.counted_by ?? '—'}`
                : `Formato ${fmtNum(line.expected)} · 1er conteo ${fmtNum(line.counted)} (${line.counted_by ?? 'no encontrado'})${
                    line.recounted ? ` · Reconteo ${fmtNum(line.recount)} (${line.recount_by})` : ''
                  }`}
            </p>
          ) : line.recounted ? (
            <p className="text-xs" style={{ color: C }}>
              ✓ Recontado por {line.recount_by}
              {line.recount_mine && line.recount !== null ? ` · ${fmtNum(line.recount)}` : ''}
            </p>
          ) : null}
        </div>
        {line.is_extra ? (
          canManage && !closed && line.extra_id ? (
            <button
              type="button"
              className="text-xs text-white/40 hover:text-rose-300"
              onClick={() => window.confirm(`¿Eliminar el sobrante ${line.key_value}?`) && deleteExtra(line.extra_id!).then(onSaved).catch((e) => setErr(errMsg(e)))}
            >
              Eliminar
            </button>
          ) : null
        ) : !closed ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <input
              className={`${fieldControlClass} mt-0 w-24 text-center tabular-nums`}
              style={ring}
              inputMode="decimal"
              value={qty}
              placeholder={line.recounted ? 'Corregir' : 'Cant.'}
              onChange={(e) => setQty(e.target.value.replace(/[^\d.,]/g, ''))}
            />
            <GhostButton type="submit" disabled={busy || !qty.trim()}>
              {line.recounted ? 'Corregir' : 'Guardar'}
            </GhostButton>
          </form>
        ) : null}
      </div>
      {err ? <p className="mt-1 text-xs text-rose-400">{err}</p> : null}
    </li>
  )
}

/* =====================================================================
 * Resultados y avance
 * ===================================================================== */

export function OplResultsView({
  auditId,
  canManage,
  onPickAudit,
}: {
  auditId: string | null
  canManage: boolean
  onPickAudit: (id: string | null) => void
}) {
  return (
    <div className="space-y-5">
      <SectionTitle title="Resultados y avance" subtitle="Avance en vivo de la auditoría: LPN y unidades contadas, estado de cada SKU y conteo por persona." />
      {auditId ? <Results auditId={auditId} canManage={canManage} onChange={() => onPickAudit(null)} /> : <AuditPicker onPick={onPickAudit} hint="Elige la auditoría." />}
    </div>
  )
}

function Results({ auditId, canManage, onChange }: { auditId: string; canManage: boolean; onChange: () => void }) {
  const audits = useOplLive(() => fetchAudits(), [])
  const audit = audits.data?.find((a) => a.id === auditId)
  const tick = `${audit?.counted_lines}-${audit?.counted_units}-${audit?.extra_count}-${audit?.status}`
  const { data: skus, error } = useOplLive(() => fetchSkuSummary(auditId), [auditId, tick])
  const counters = useOplLive(() => fetchCounters(auditId), [auditId, tick])
  const [stateFilter, setStateFilter] = useState<SkuState | 'todos'>('todos')
  const [exporting, setExporting] = useState(false)

  const closedAudit = audit?.status === 'cerrada'
  const stats = useMemo(() => {
    if (!skus) return null
    const by = (st: SkuState[]) => skus.filter((s) => st.includes(skuState(s))).length
    const complete = skus.filter((s) => s.complete)
    const firstOk = complete.filter((s) => s.counted !== null && s.expected !== null && s.counted === s.expected).length
    // Exactitud de unidades: solo sobre SKU ya terminados (o todos si la auditoría está cerrada).
    const done = skus.filter((s) => s.complete || closedAudit)
    const expected = done.reduce((a, s) => a + (s.expected ?? 0), 0)
    const final = done.reduce((a, s) => a + (s.final_qty ?? 0), 0)
    const absDiff = done.reduce((a, s) => a + Math.abs((s.final_qty ?? 0) - (s.expected ?? 0)), 0)
    return {
      total: skus.length,
      complete: complete.length,
      ok: by(['cuadra', 'cuadrado']),
      disc: by(['discrepancia', 'reconteo']),
      confirmed: by(['diferencia_confirmada']),
      firstAcc: complete.length ? Math.round((firstOk / complete.length) * 1000) / 10 : null,
      expected,
      final,
      unitAcc: expected > 0 ? Math.max(0, Math.round((1 - absDiff / expected) * 1000) / 10) : null,
    }
  }, [skus, closedAudit])

  async function exportCsv() {
    if (!audit) return
    setExporting(true)
    try {
      const [lines, extras] = await Promise.all([fetchAuditLines(auditId), fetchAuditExtras(auditId)])
      const extraCols = audit.mapping.extras
      const q = (v: unknown) => {
        const s = v === null || v === undefined ? '' : String(v)
        return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const dt = (s: string | null) => (s ? new Date(s).toLocaleString('es-SV', { timeZone: 'America/El_Salvador' }) : '')
      const head = [
        'Tipo', audit.mapping.key_label, 'Ubicación', 'SKU', 'Descripción', ...extraCols, 'Cant. formato', '1er conteo', 'Contó', 'Hora',
        'Reconteo', 'Recontó', 'Hora reconteo', 'Cant. final', 'Diferencia', 'Estado',
      ]
      const rows = lines.map((l) => {
        const fin = l.recount_qty ?? l.counted_qty
        return [
          'Formato', l.key_value, l.location, l.sku, l.description, ...extraCols.map((c) => l.extra?.[c] ?? ''), l.expected_qty, l.counted_qty,
          l.counted_by_name, dt(l.counted_at), l.recount_qty, l.recount_by_name, dt(l.recount_at), fin ?? 0, (fin ?? 0) - l.expected_qty,
          l.counted_qty === null ? (audit.status === 'cerrada' ? 'No encontrado' : 'Pendiente') : fin === l.expected_qty ? 'Cuadra' : 'Diferencia',
        ]
      })
      extras.forEach((x) =>
        rows.push([
          'Sobrante', x.key_value, x.location, x.sku, x.description, ...extraCols.map(() => ''), 0, x.qty, x.created_by_name, dt(x.created_at),
          '', '', '', x.qty, x.qty, 'Sobrante',
        ]),
      )
      const csv = '﻿' + [head, ...rows].map((r) => r.map(q).join(';')).join('\r\n')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      a.download = `auditoria_${audit.folio}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } finally {
      setExporting(false)
    }
  }

  const shown = (skus ?? []).filter((s) => stateFilter === 'todos' || skuState(s) === stateFilter)
  const states: SkuState[] = ['pendiente', 'contando', 'cuadra', 'discrepancia', 'reconteo', 'cuadrado', 'diferencia_confirmada']

  return (
    <div className="space-y-4">
      <AuditHeader audit={audit} onChange={onChange} />
      {error ? <ErrorState>{error}</ErrorState> : null}
      {!audit || !skus || !stats ? (
        <EmptyState>Cargando…</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label={`${audit.mapping.key_label} contados`}
              value={`${pctOf(audit.counted_lines, audit.line_count)}%`}
              sub={`${fmtNum(audit.counted_lines)} de ${fmtNum(audit.line_count)}`}
            />
            <Kpi
              label="Unidades contadas"
              value={fmtNum(audit.counted_units)}
              sub={canManage ? `de ${fmtNum(audit.expected_total)} en el formato (${pctOf(audit.counted_units, audit.expected_total)}%)` : 'entre todos los contadores'}
            />
            <Kpi label="SKU completos" value={`${stats.complete} / ${stats.total}`} sub={`${stats.ok} cuadran · ${stats.disc} en discrepancia`} dot="#4ade80" />
            {canManage ? (
              <Kpi
                label="Exactitud 1er conteo"
                value={stats.firstAcc === null ? '—' : `${stats.firstAcc}%`}
                sub={`SKU terminados que cuadraron sin reconteo · exactitud en unidades ${stats.unitAcc === null ? '—' : `${stats.unitAcc}%`}`}
              />
            ) : (
              <Kpi label="Sobrantes" value={audit.extra_count} sub="LPN que no venían en el formato" dot="#fb923c" />
            )}
          </div>

          <GlassCard className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-white">Avance por SKU</h3>
              {canManage ? (
                <GhostButton onClick={exportCsv} disabled={exporting}>
                  {exporting ? 'Exportando…' : 'Exportar detalle (CSV)'}
                </GhostButton>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip color={C} active={stateFilter === 'todos'} onClick={() => setStateFilter('todos')}>
                Todos ({skus.length})
              </Chip>
              {states.map((st) => {
                const n = skus.filter((s) => skuState(s) === st).length
                return n ? (
                  <Chip key={st} color={SKU_STATE_COLORS[st]} active={stateFilter === st} onClick={() => setStateFilter(st)}>
                    {SKU_STATE_LABELS[st]} ({n})
                  </Chip>
                ) : null
              })}
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] tracking-wider text-white/45 uppercase">
                    <th className="p-1.5">SKU</th>
                    <th className="p-1.5">Avance {audit.mapping.key_label}</th>
                    {canManage ? (
                      <>
                        <th className="p-1.5 text-right">Formato</th>
                        <th className="p-1.5 text-right">Contado</th>
                        <th className="p-1.5 text-right">Dif.</th>
                      </>
                    ) : null}
                    <th className="p-1.5">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s) => {
                    const st = skuState(s)
                    // La diferencia solo se muestra con el SKU terminado: antes sería solo lo que falta por contar.
                    const diff = (s.complete || closedAudit) && s.final_qty !== null && s.expected !== null ? s.final_qty - s.expected : null
                    return (
                      <tr key={s.sku} className="border-t border-neurale-border align-top text-white/80">
                        <td className="p-1.5">
                          <p className="font-medium text-white">{s.sku}</p>
                          <p className="max-w-[16rem] truncate text-xs text-white/45">{s.description}</p>
                        </td>
                        <td className="p-1.5">
                          <div className="w-36 space-y-1">
                            <ProgressBar value={s.lines_counted} total={s.lines_total} color={SKU_STATE_COLORS[st]} thin />
                            <p className="text-xs text-white/50 tabular-nums">
                              {s.lines_counted}/{s.lines_total}
                              {s.extra_lines ? ` +${s.extra_lines} sobr.` : ''}
                            </p>
                          </div>
                        </td>
                        {canManage ? (
                          <>
                            <td className="p-1.5 text-right tabular-nums">{fmtNum(s.expected)}</td>
                            <td className="p-1.5 text-right tabular-nums">{fmtNum(s.final_qty)}</td>
                            <td className="p-1.5 text-right tabular-nums" style={{ color: !diff ? undefined : '#f87171' }}>
                              {diff !== null && diff > 0 ? '+' : ''}
                              {fmtNum(diff)}
                            </td>
                          </>
                        ) : null}
                        <td className="p-1.5">
                          <Badge color={SKU_STATE_COLORS[st]}>{SKU_STATE_LABELS[st]}</Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <h3 className="font-display text-sm font-semibold text-white">Por contador</h3>
            {!counters.data?.length ? (
              <p className="mt-2 text-sm text-white/45">Todavía nadie ha contado.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {counters.data.map((c) => (
                  <li key={c.name} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
                    <span className="truncate text-white/80">{c.name}</span>
                    <ProgressBar value={c.lines} total={Math.max(...counters.data!.map((x) => x.lines), 1)} color={C} thin />
                    <span className="text-xs text-white/55 tabular-nums">
                      {fmtNum(c.lines)} {audit.mapping.key_label} · {fmtNum(c.units)} u.{c.recounts ? ` · ${c.recounts} reconteos` : ''}
                      {c.extras ? ` · ${c.extras} sobr.` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          {audit.status === 'cerrada' ? (
            <p className="text-xs text-white/45">
              Auditoría cerrada por {audit.closed_by_name ?? '—'}
              {audit.close_note ? ` · ${audit.close_note}` : ''}. Los {audit.mapping.key_label} sin contar se consideran no encontrados.
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
