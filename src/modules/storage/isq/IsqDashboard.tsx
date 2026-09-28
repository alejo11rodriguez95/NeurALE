import { useMemo } from 'react'

import { GlassCard } from '@/shared/components/GlassCard'
import { withAlpha } from '@/shared/modules'

import {
  ISQ_NAME,
  ISQ_ROOT_CAUSE_LABELS,
  ISQ_STATUSES,
  ISQ_STATUS_COLORS,
  ISQ_STATUS_LABELS,
  ageHours,
  fetchIsqIncidents,
  formatAge,
  formatDateLongSV,
  formatDateTimeSV,
  isClosed,
  shiftOf,
  type IsqIncident,
} from './lib/isq'
import { DateRangePicker, GhostButton, SectionTitle, StatusBadge, useDateRange, useIsqLive } from './ui'

/**
 * Dash Storage — por ahora solo ISQ (es la única incidencia que existe). Hoy
 * por defecto, con fecha o rango editable. Se actualiza solo (Realtime).
 * Lo reutiliza el Dashboard Neuronal con su propio color (`color`).
 */
export function IsqDashboard({ color, title = 'Dash Storage' }: { color: string; title?: string }) {
  const [range, setRange] = useDateRange()
  const { data, error } = useIsqLive(() => fetchIsqIncidents(range.from, range.to), [range.from, range.to])

  const stats = useMemo(() => (data ? computeStats(data) : null), [data])
  const rangeLabel =
    range.from === range.to ? formatDateLongSV(range.from) : `${formatDateLongSV(range.from)} — ${formatDateLongSV(range.to)}`

  return (
    <div className="space-y-5">
      <SectionTitle title={title} subtitle={<span className="capitalize">{ISQ_NAME} · {rangeLabel}</span>} />
      <DateRangePicker value={range} onChange={setRange} color={color} />

      {error ? (
        <GlassCard className="p-6 text-sm text-rose-400">{error}</GlassCard>
      ) : !stats || !data ? (
        <GlassCard className="p-6 text-sm text-white/50">Cargando…</GlassCard>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Incidencias" value={stats.total} color={color} accent />
            {ISQ_STATUSES.map((s) => (
              <Kpi key={s} label={ISQ_STATUS_LABELS[s]} value={stats.byStatus[s]} dot={ISQ_STATUS_COLORS[s]} />
            ))}
            <Kpi
              label="Tiempo prom. de cierre"
              value={stats.avgCloseH === null ? '—' : formatAge(stats.avgCloseH)}
              sub={stats.total ? `${Math.round((stats.closed / stats.total) * 100)}% cerradas` : undefined}
            />
          </div>

          {stats.total === 0 ? (
            <GlassCard className="p-6 text-sm text-white/50">No hay incidencias ISQ en este rango.</GlassCard>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <Bars title="Por tipo de incidencia" rows={stats.byType} color={color} total={stats.total} />
                <Bars title="Por almacenador" rows={stats.byStower} color={color} total={stats.total} />
                <Bars title="Por turno" rows={stats.byShift} color={color} total={stats.total} />
                <Bars
                  title="Causa raíz (según Inbound)"
                  rows={stats.byCause}
                  color={color}
                  total={stats.total}
                  empty="Inbound todavía no ha registrado causas."
                />
              </div>
              <DetailTable rows={data} color={color} from={range.from} to={range.to} />
            </>
          )}
        </>
      )}
    </div>
  )
}

/* ---------- Cálculos ---------- */

function countBy<T>(items: T[], key: (x: T) => string | null): [string, number][] {
  const m = new Map<string, number>()
  items.forEach((i) => {
    const k = key(i)
    if (k) m.set(k, (m.get(k) ?? 0) + 1)
  })
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

const SHIFT_LABEL = { A: 'Turno A (06–14 h)', B: 'Turno B (14–22 h)', fuera: 'Fuera de turno (22–06 h)' } as const

function computeStats(rows: IsqIncident[]) {
  const byStatus = Object.fromEntries(ISQ_STATUSES.map((s) => [s, 0])) as Record<(typeof ISQ_STATUSES)[number], number>
  rows.forEach((r) => byStatus[r.status]++)
  const closedRows = rows.filter((r) => isClosed(r.status) && r.closed_at)
  const avgCloseH = closedRows.length ? closedRows.reduce((a, r) => a + ageHours(r), 0) / closedRows.length : null
  return {
    total: rows.length,
    byStatus,
    closed: byStatus.corregida + byStatus.no_procede,
    avgCloseH,
    byType: countBy(rows, (r) => r.type_label),
    byStower: countBy(rows, (r) => r.stower_name),
    byShift: countBy(rows, (r) => SHIFT_LABEL[shiftOf(r.reported_at)]),
    byCause: countBy(rows, (r) => (r.root_cause ? ISQ_ROOT_CAUSE_LABELS[r.root_cause] : null)),
  }
}

/* ---------- Piezas ---------- */

function Kpi({
  label,
  value,
  sub,
  color,
  dot,
  accent,
}: {
  label: string
  value: number | string
  sub?: string
  color?: string
  dot?: string
  accent?: boolean
}) {
  return (
    <GlassCard className="p-4" style={accent && color ? { borderColor: withAlpha(color, 0.4) } : undefined}>
      <div className="flex items-center gap-1.5 text-[11px] tracking-wide text-white/50 uppercase">
        {dot ? <span className="h-2 w-2 rounded-full" style={{ background: dot }} /> : null}
        {label}
      </div>
      <div className="mt-1 font-display text-3xl leading-none font-semibold text-white tabular-nums">{value}</div>
      {sub ? <div className="mt-1 text-xs text-white/40">{sub}</div> : null}
    </GlassCard>
  )
}

/** Barras horizontales de una sola serie (un solo tono: identidad = el título). */
function Bars({
  title,
  rows,
  color,
  total,
  empty = 'Sin datos.',
}: {
  title: string
  rows: [string, number][]
  color: string
  total: number
  empty?: string
}) {
  const max = Math.max(1, ...rows.map((r) => r[1]))
  const shown = rows.slice(0, 8)
  const rest = rows.slice(8).reduce((a, r) => a + r[1], 0)
  const list: [string, number][] = rest ? [...shown, [`Otros (${rows.length - 8})`, rest]] : shown
  return (
    <GlassCard className="p-5">
      <h3 className="font-display text-sm font-semibold text-white">{title}</h3>
      {list.length === 0 ? (
        <p className="mt-3 text-sm text-white/40">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {list.map(([label, n]) => (
            <li key={label} className="group grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3" title={`${label}: ${n} (${Math.round((n / total) * 100)}%)`}>
              <span className="truncate text-xs text-white/65">{label}</span>
              <span className="h-2.5 rounded-full bg-white/[0.06]">
                <span
                  className="block h-full rounded-full transition-[width,opacity] group-hover:opacity-100"
                  style={{ width: `${(n / max) * 100}%`, background: color, opacity: 0.85 }}
                />
              </span>
              <span className="w-12 text-right text-xs text-white/70 tabular-nums">
                {n} <span className="text-white/35">· {Math.round((n / total) * 100)}%</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  )
}

function DetailTable({ rows, color, from, to }: { rows: IsqIncident[]; color: string; from: string; to: string }) {
  const extraLabels = [...new Set(rows.flatMap((r) => r.extra.map((x) => x.label)))]

  function exportCsv() {
    const head = [
      'Fecha y hora', 'Turno', 'SKU', 'Referencia (recepción / OC)', 'Almacenador', 'Tipo de incidencia', ...extraLabels,
      'Estado', 'Responsable Inbound', 'Causa raíz', 'Acción correctiva', 'Notas', 'Cerrada', 'Tiempo abierta (h)',
    ]
    const q = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v)
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = rows.map((r) =>
      [
        formatDateTimeSV(r.reported_at), shiftOf(r.reported_at), r.sku, r.reference, r.stower_name, r.type_label,
        ...extraLabels.map((l) => r.extra.find((x) => x.label === l)?.value ?? ''),
        ISQ_STATUS_LABELS[r.status], r.responsible_name, r.root_cause ? ISQ_ROOT_CAUSE_LABELS[r.root_cause] : '',
        r.corrective_action, r.followup_notes, r.closed_at ? formatDateTimeSV(r.closed_at) : '', Math.round(ageHours(r) * 10) / 10,
      ]
        .map(q)
        .join(';'),
    )
    const csv = '﻿' + [head.map(q).join(';'), ...lines].join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `isq_${from}_${to}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <GlassCard className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-white">Detalle · {rows.length}</h3>
        <GhostButton onClick={exportCsv} style={{ borderColor: withAlpha(color, 0.4) }}>
          Exportar a Excel (CSV)
        </GhostButton>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr>
              {['Fecha y hora', 'SKU', 'Referencia', 'Almacenador', 'Tipo', 'Estado', 'Responsable', 'Tiempo'].map((h) => (
                <th key={h} className="p-1.5 text-left text-[11px] font-medium tracking-wider text-white/45 uppercase">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-neurale-border text-white/80">
                <td className="p-1.5 whitespace-nowrap tabular-nums">{formatDateTimeSV(r.reported_at)}</td>
                <td className="p-1.5">{r.sku}</td>
                <td className="p-1.5">{r.reference}</td>
                <td className="p-1.5">{r.stower_name}</td>
                <td className="p-1.5">{r.type_label}</td>
                <td className="p-1.5"><StatusBadge status={r.status} /></td>
                <td className="p-1.5 text-white/60">{r.responsible_name || '—'}</td>
                <td className="p-1.5 whitespace-nowrap text-white/60 tabular-nums">{formatAge(ageHours(r))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  )
}
