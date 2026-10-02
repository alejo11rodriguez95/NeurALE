import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { isManager } from '@/modules/storage/isq/ui'
import { useAuth } from '@/shared/auth/AuthContext'
import { MODULES, withAlpha } from '@/shared/modules'

import { DAMAGE_STATUS_COLORS, DAMAGE_STATUS_LABELS, fetchCanManage, subscribeDamages, type DamageStatus } from './lib/damages'

/**
 * Piezas locales de Control de Averías. Botones, chips y estilos de campo se
 * reutilizan de Storage ISQ / Outbound (mismo precedente que Registro x
 * Pallet) en vez de crear otra copia — ver ARCHITECTURE.md → pendiente de
 * promover formularios/OptionCard a `src/shared/components/`.
 */
export {
  Chip,
  GhostButton,
  PrimaryButton,
  SectionTitle,
  fieldControlClass,
  fieldLabelClass,
  ringStyle,
} from '@/modules/storage/isq/ui'

export const inventory = MODULES.find((m) => m.id === 'inventory')!
export const COLOR = inventory.color

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function StatusBadge({ status }: { status: DamageStatus }) {
  const c = DAMAGE_STATUS_COLORS[status]
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wider whitespace-nowrap"
      style={{ background: withAlpha(c, 0.15), color: c }}
    >
      {DAMAGE_STATUS_LABELS[status]}
    </span>
  )
}

/** Carga + Realtime (reportes, lotes, hallazgos, avisos) + respaldo cada 60 s. */
export function useDamagesLive<T>(load: () => Promise<T>, deps: unknown[]) {
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
    const unsub = subscribeDamages(() => {
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

/**
 * ¿Puede trabajar averías y configurar? admin/gerencia, jefe_area de
 * Inventory o un nivel con "editar" en Inventory. Lo decide la base
 * (`inventory_can_manage()`), igual que la RLS.
 */
export function useCanManageDamages(): boolean | null {
  const { adminUser } = useAuth()
  const [ok, setOk] = useState<boolean | null>(null)
  useEffect(() => {
    if (!adminUser) return setOk(false)
    if (isManager(adminUser)) return setOk(true)
    let alive = true
    fetchCanManage().then((v) => alive && setOk(v))
    return () => {
      alive = false
    }
  }, [adminUser])
  return ok
}

/** Recuadro modal (portal: `.neural-enter` deja un transform que atrapa a `position: fixed`). */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl border border-neurale-border bg-neurale-deep shadow-2xl">
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

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <p className="text-sm text-[#f87171]">{children}</p> : null
}

/**
 * Un solo botón "Sí, se descontó". Si el colaborador no lo marca, el reporte
 * queda como "No se marcó como descontado" (pedido de Josué 2026-10-02).
 */
export function DeductedToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const c = '#34d399'
  return (
    <button
      type="button"
      aria-pressed={value}
      onClick={() => onChange(!value)}
      className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors"
      style={
        value
          ? { background: withAlpha(c, 0.18), borderColor: c, color: c }
          : { borderColor: 'var(--color-neurale-border)', color: 'rgba(255,255,255,0.65)' }
      }
    >
      <span
        className="flex h-4 w-4 items-center justify-center rounded border text-[11px]"
        style={{ borderColor: value ? c : 'rgba(255,255,255,0.4)' }}
      >
        {value ? '✓' : ''}
      </span>
      Sí, se descontó
    </button>
  )
}
