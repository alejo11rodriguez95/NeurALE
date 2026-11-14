import { useEffect, useState, type ReactNode } from 'react'

import { GlassCard } from '@/shared/components/GlassCard'
import { withAlpha } from '@/shared/modules'

import { AUDIT_STATUS_COLORS, AUDIT_STATUS_LABELS, fmtNum, pctOf, subscribeOpl, type OplAudit } from './lib/opl'

/** Carga datos y los mantiene al día (Realtime en auditorías/revisiones/sobrantes + respaldo cada 30 s). */
export function useOplLive<T>(load: () => Promise<T>, deps: unknown[], enabled = true) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!enabled) return
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
    const unsub = subscribeOpl(() => {
      clearTimeout(t)
      t = setTimeout(run, 400)
    })
    const poll = setInterval(run, 30_000)
    return () => {
      alive = false
      unsub()
      clearTimeout(t)
      clearInterval(poll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled])

  return { data, error, reload: () => setTick((x) => x + 1), setData }
}

export function AuditStatusBadge({ status }: { status: OplAudit['status'] }) {
  const c = AUDIT_STATUS_COLORS[status]
  return (
    <span className="rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap" style={{ background: withAlpha(c, 0.15), color: c }}>
      {AUDIT_STATUS_LABELS[status]}
    </span>
  )
}

export function Badge({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap" style={{ background: withAlpha(color, 0.15), color }}>
      {children}
    </span>
  )
}

export function ProgressBar({ value, total, color, thin }: { value: number; total: number; color: string; thin?: boolean }) {
  const p = total > 0 ? Math.min(100, (value / total) * 100) : 0
  return (
    <div className={`w-full rounded-full bg-white/[0.07] ${thin ? 'h-1.5' : 'h-2.5'}`} role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${p}%`, background: color }} />
    </div>
  )
}

export function Kpi({ label, value, sub, dot }: { label: string; value: ReactNode; sub?: ReactNode; dot?: string }) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-1.5 text-[11px] tracking-wide text-white/50 uppercase">
        {dot ? <span className="h-2 w-2 rounded-full" style={{ background: dot }} /> : null}
        {label}
      </div>
      <div className="mt-1 font-display text-2xl leading-none font-semibold text-white tabular-nums sm:text-3xl">{value}</div>
      {sub ? <div className="mt-1 text-xs text-white/45">{sub}</div> : null}
    </GlassCard>
  )
}

/** Tarjeta de una auditoría con su avance. */
export function AuditCard({
  audit,
  operatorName,
  color,
  onOpen,
  actions,
}: {
  audit: OplAudit
  operatorName?: string
  color: string
  onOpen?: () => void
  actions?: ReactNode
}) {
  const label = audit.mapping.key_label
  return (
    <GlassCard className="p-4 sm:p-5" style={{ borderColor: withAlpha(color, 0.2) }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left" disabled={!onOpen}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-base font-semibold text-white">{audit.folio}</span>
            <AuditStatusBadge status={audit.status} />
            {operatorName ? <span className="text-xs text-white/45">{operatorName}</span> : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-white/45">
            {audit.file_name ?? 'Archivo'} · {new Date(audit.created_at).toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' })}
            {audit.created_by_name ? ` · ${audit.created_by_name}` : ''}
          </p>
          {audit.note ? <p className="mt-0.5 text-xs text-white/55">{audit.note}</p> : null}
        </button>
        {actions}
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="flex justify-between text-xs text-white/60 tabular-nums">
          <span>
            {fmtNum(audit.counted_lines)} / {fmtNum(audit.line_count)} {label} contados
          </span>
          <span>{pctOf(audit.counted_lines, audit.line_count)}%</span>
        </div>
        <ProgressBar value={audit.counted_lines} total={audit.line_count} color={color} />
        <p className="text-xs text-white/45 tabular-nums">
          {fmtNum(audit.counted_units)} unidades contadas · {fmtNum(audit.sku_count)} SKU
          {audit.extra_count ? ` · ${audit.extra_count} sobrante(s)` : ''}
        </p>
      </div>
    </GlassCard>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <GlassCard className="p-6 text-sm text-white/50">{children}</GlassCard>
}

export function ErrorState({ children }: { children: ReactNode }) {
  return <GlassCard className="p-6 text-sm text-rose-400">{children}</GlassCard>
}
