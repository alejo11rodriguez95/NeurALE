import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'

import { withAlpha } from '@/shared/modules'

import { SHIFTS, isoWeek, type ShiftId } from './config'
import { STATUS_COLOR, isNum, type Status } from './metrics'

/**
 * Piezas visuales del Diálogo Táctico. Locales al Dashboard a propósito (ver
 * ARCHITECTURE.md → componentes que sirvan a más de un módulo se piden en el
 * chat de Setup y Diseño); los módulos las reciben a través de
 * `TacticalCaptureView`, no las importan sueltas.
 */

export const fieldClass =
  'w-full rounded-lg border border-neurale-border bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 disabled:opacity-50'

export function ringStyle(color: string): CSSProperties {
  return { '--tw-ring-color': color } as CSSProperties
}

/* ---------- Celda con semáforo ---------- */

export function Cell({
  status,
  label,
  value,
  meta,
  onClick,
  className = '',
  big,
}: {
  status: Status
  label: ReactNode
  value: ReactNode
  meta?: ReactNode
  onClick?: () => void
  className?: string
  big?: boolean
}) {
  const c = STATUS_COLOR[status]
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`relative flex min-w-0 flex-col justify-between gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors ${
        onClick ? 'cursor-pointer hover:border-white/30' : ''
      } ${className}`}
      style={{
        background: status === 'na' ? 'rgba(255,255,255,0.035)' : withAlpha(c, 0.1),
        borderColor: status === 'na' ? 'rgba(255,255,255,0.07)' : withAlpha(c, 0.28),
      }}
    >
      <span
        className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full"
        style={{ background: c, boxShadow: status === 'na' ? 'none' : `0 0 8px ${c}` }}
      />
      <span className="pr-4 text-[11px] leading-tight text-white/55">{label}</span>
      <span
        className={`font-display leading-none font-semibold tabular-nums ${
          big ? 'text-[clamp(2.2rem,5vh,3.4rem)]' : 'text-[clamp(1.35rem,3.1vh,2.1rem)]'
        }`}
        style={{ color: status === 'na' ? 'rgba(255,255,255,0.45)' : c }}
      >
        {value}
      </span>
      {meta ? <span className="truncate text-[11px] text-white/45 tabular-nums">{meta}</span> : null}
    </Tag>
  )
}

/** "real / plan" con el plan atenuado. */
export function Ratio({ a, b }: { a: ReactNode; b: ReactNode }) {
  return (
    <>
      {a}
      <span className="text-[0.55em] font-medium text-white/45"> / {b}</span>
    </>
  )
}

/* ---------- Modal ---------- */

export function Dialog({
  title,
  subtitle,
  onClose,
  children,
  wide,
  color = '#5eead4',
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  color?: string
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl border bg-neurale-deep shadow-[0_20px_60px_rgba(0,0,0,0.6)] ${
          wide ? 'max-w-4xl' : 'max-w-md'
        }`}
        style={{ borderColor: withAlpha(color, 0.3) }}
      >
        <div className="border-b border-neurale-border px-5 py-4">
          <h3 className="font-display text-lg font-semibold text-white">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-white/45">{subtitle}</p> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  )
}

export function Button({
  children,
  onClick,
  primary,
  disabled,
  color = '#5eead4',
  type = 'button',
  className = '',
  title,
}: {
  children: ReactNode
  onClick?: () => void
  primary?: boolean
  disabled?: boolean
  color?: string
  type?: 'button' | 'submit'
  className?: string
  title?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`min-h-9 rounded-lg border px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      style={
        primary
          ? { background: color, borderColor: color, color: '#05070d' }
          : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.04)' }
      }
    >
      {children}
    </button>
  )
}

/* ---------- Diálogo de captura numérica ---------- */

export interface NumField {
  key: string
  label: string
  value: number | null | undefined
  integer?: boolean
}

export function NumberDialog({
  title,
  subtitle,
  fields,
  onSave,
  onClose,
  color,
  note,
}: {
  title: string
  subtitle?: string
  fields: NumField[]
  onSave: (values: Record<string, number | null>) => Promise<void>
  onClose: () => void
  color?: string
  note?: ReactNode
}) {
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, isNum(f.value) ? String(f.value) : ''])),
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const out: Record<string, number | null> = {}
      for (const f of fields) {
        const s = vals[f.key].replace(',', '.').trim()
        if (s === '') out[f.key] = null
        else {
          const n = Number(s)
          if (Number.isNaN(n) || n < 0) throw new Error(`"${f.label}" debe ser un número positivo.`)
          out[f.key] = f.integer ? Math.round(n) : n
        }
      }
      await onSave(out)
      onClose()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title={title} subtitle={subtitle} onClose={onClose} color={color}>
      <form onSubmit={submit} className="flex flex-col gap-3 p-5">
        {fields.map((f, i) => (
          <label key={f.key} className="flex items-center justify-between gap-4">
            <span className="text-sm text-white/65">{f.label}</span>
            <input
              autoFocus={i === 0}
              inputMode="decimal"
              value={vals[f.key]}
              onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
              className={`${fieldClass} w-32 text-right font-display text-xl tabular-nums`}
              style={ringStyle(color ?? '#5eead4')}
            />
          </label>
        ))}
        {note ? <div className="text-xs text-white/45">{note}</div> : null}
        {err ? <p className="text-sm text-rose-300">{err}</p> : null}
        <div className="mt-1 grid grid-cols-2 gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" primary disabled={busy} color={color}>
            {busy ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/* ---------- Selector fecha + turno ---------- */

export function ShiftPicker({
  date,
  shift,
  onDate,
  onShift,
  color,
}: {
  date: string
  shift: ShiftId
  onDate: (d: string) => void
  onShift: (s: ShiftId) => void
  color: string
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] tracking-[0.18em] text-white/45 uppercase">Fecha</span>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && onDate(e.target.value)}
          className={`${fieldClass} min-h-9 w-auto [color-scheme:dark]`}
          style={ringStyle(color)}
        />
      </label>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] tracking-[0.18em] text-white/45 uppercase">Turno</span>
        <div className="flex overflow-hidden rounded-lg border border-neurale-border">
          {SHIFTS.map((s) => (
            <button
              key={s.id}
              type="button"
              title={s.hours}
              aria-pressed={s.id === shift}
              onClick={() => onShift(s.id)}
              className="min-h-9 px-4 font-display text-base font-semibold"
              style={
                s.id === shift
                  ? { background: color, color: '#05070d' }
                  : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)' }
              }
            >
              {s.id}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] tracking-[0.18em] text-white/45 uppercase">Semana</span>
        <span className="flex min-h-9 items-center rounded-lg border border-neurale-border bg-white/5 px-3 font-display text-base font-semibold text-white tabular-nums">
          S{isoWeek(date)}
        </span>
      </div>
    </div>
  )
}
