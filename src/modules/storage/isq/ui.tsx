import { useEffect, useState, type ReactNode } from 'react'

import type { AdminUser } from '@/lib/supabase'
import { fieldControlClass, fieldLabelClass, ringStyle } from '@/modules/outbound/components/formStyles'
import { withAlpha } from '@/shared/modules'

import { ISQ_STATUS_COLORS, ISQ_STATUS_LABELS, addDaysISO, subscribeIsq, todaySV, type IsqStatus } from './lib/isq'

/**
 * Piezas visuales locales de ISQ (Storage, Inbound y Dashboard las reutilizan).
 * Los estilos de campo se toman de Outbound (mismo precedente que Picking) en
 * vez de duplicarlos por quinta vez — ver ARCHITECTURE.md → pendiente de
 * promover formularios/OptionCard a `src/shared/components/`.
 */

export { fieldControlClass, fieldLabelClass, ringStyle }

/* ---------- Permisos (solo interfaz — la protección real es RLS) ---------- */

export const isManager = (u: AdminUser | null) => !!u && (u.access_level === 'admin' || u.access_level === 'gerencia')

/** Ajustes de Storage: jefe de área de Storage, gerencia o admin. */
export const canConfigureIsq = (u: AdminUser | null) =>
  isManager(u) || (!!u && u.access_level === 'jefe_area' && u.module === 'storage')

/** Reportar ISQ: cualquier usuario de Storage, gerencia o admin. */
export const canReportIsq = (u: AdminUser | null) => isManager(u) || u?.module === 'storage'

/** Seguimiento en Inbound: cualquier usuario de Inbound, gerencia o admin. */
export const canFollowUpIsq = (u: AdminUser | null) => isManager(u) || u?.module === 'inbound'

/* ---------- Componentes ---------- */

export function StatusBadge({ status }: { status: IsqStatus }) {
  const c = ISQ_STATUS_COLORS[status]
  return (
    <span className="rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap" style={{ background: withAlpha(c, 0.15), color: c }}>
      {ISQ_STATUS_LABELS[status]}
    </span>
  )
}

export function PrimaryButton({
  color,
  children,
  ...rest
}: { color: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`rounded-full px-5 py-2 text-sm font-medium text-neurale-bg transition-opacity disabled:opacity-50 ${rest.className ?? ''}`}
      style={{ background: color, ...rest.style }}
    >
      {children}
    </button>
  )
}

export function GhostButton({ children, ...rest }: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`rounded-full border border-neurale-border px-4 py-1.5 text-xs font-medium text-white/70 transition-colors hover:text-white disabled:opacity-40 ${rest.className ?? ''}`}
    >
      {children}
    </button>
  )
}

export function Chip({ active, color, onClick, children }: { active: boolean; color: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
      style={
        active
          ? { background: color, color: '#05070d', borderColor: color }
          : { borderColor: 'var(--color-neurale-border)', color: 'rgba(255,255,255,0.6)' }
      }
    >
      {children}
    </button>
  )
}

export function SectionTitle({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-white/50">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  )
}

/* ---------- Rango de fechas (Hoy por defecto) ---------- */

export interface DateRange {
  from: string
  to: string
}

export function useDateRange(): [DateRange, (r: DateRange) => void] {
  const [range, setRange] = useState<DateRange>(() => ({ from: todaySV(), to: todaySV() }))
  return [range, (r) => setRange(r.from <= r.to ? r : { from: r.to, to: r.from })]
}

export function DateRangePicker({ value, onChange, color }: { value: DateRange; onChange: (r: DateRange) => void; color: string }) {
  const today = todaySV()
  const presets: [string, DateRange][] = [
    ['Hoy', { from: today, to: today }],
    ['Ayer', { from: addDaysISO(today, -1), to: addDaysISO(today, -1) }],
    ['Últimos 7 días', { from: addDaysISO(today, -6), to: today }],
    ['Este mes', { from: `${today.slice(0, 8)}01`, to: today }],
  ]
  const ring = ringStyle(color)
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-wrap gap-2">
        {presets.map(([label, r]) => (
          <Chip key={label} color={color} active={value.from === r.from && value.to === r.to} onClick={() => onChange(r)}>
            {label}
          </Chip>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <label className="w-36">
          <span className={fieldLabelClass}>Desde</span>
          <input
            type="date"
            className={`${fieldControlClass} [color-scheme:dark]`}
            style={ring}
            value={value.from}
            max={today}
            onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })}
          />
        </label>
        <label className="w-36">
          <span className={fieldLabelClass}>Hasta</span>
          <input
            type="date"
            className={`${fieldControlClass} [color-scheme:dark]`}
            style={ring}
            value={value.to}
            max={today}
            onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })}
          />
        </label>
      </div>
    </div>
  )
}

/**
 * Carga datos y los mantiene al día: Supabase Realtime sobre
 * `storage_isq_incidents` + re-consulta de respaldo cada 60 s.
 */
export function useIsqLive<T>(load: () => Promise<T>, deps: unknown[]) {
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
    setData(null)
    run()
    const unsub = subscribeIsq(() => {
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

  return { data, error, reload: () => setTick((x) => x + 1), setData }
}
