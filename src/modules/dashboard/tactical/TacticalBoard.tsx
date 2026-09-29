import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useAuth } from '@/shared/auth/AuthContext'
import { NeuralField } from '@/shared/components/NeuralField'
import { DASHBOARD_MODULE, MODULES, withAlpha } from '@/shared/modules'

import {
  EMPTY_COMMITMENTS,
  fetchCdManager,
  fetchProcessLeads,
  saveSafety,
  saveSettings,
  saveShift,
  type AreaLead,
  type Commitment,
  type ShiftRow,
} from './api'
import { PROCESS_LEAD_POSITIONS, addDays, enabledShifts, shiftHours, type ShiftsConfig } from './config'
import { HistoryDialog, HousekeepingDialog, SettingsDialog } from './dialogs'
import { STATUS_COLOR, computeBoard, fmt, type Board } from './metrics'
import { Button, Cell, Gauge, NumberDialog, Ratio, ShiftPicker, fieldClass, ringStyle, type NumField } from './ui'

const LOGO = '/brand/logo-cdnneo-2026.jpg'

/**
 * Tema claro del tablero: el tablero usa los tokens de Tailwind (`--color-white`,
 * `--color-neurale-*`), así que basta con redefinirlos dentro de `.tac-light`
 * (el "blanco" pasa a ser el color de tinta oscuro). Los semáforos usan
 * `--tac-*` para oscurecerse en fondo claro.
 */
const THEME_CSS = `
.tac-light {
  --color-white: #0f172a;
  --color-neurale-bg: #eef1f5;
  --color-neurale-deep: #ffffff;
  --color-neurale-surface: rgba(255, 255, 255, 0.88);
  --color-neurale-border: rgba(15, 23, 42, 0.12);
  --tac-ok: #15803d;
  --tac-lv2: #4d7c0f;
  --tac-warn: #b45309;
  --tac-bad: #dc2626;
  --tac-na: rgba(15, 23, 42, 0.4);
  color-scheme: light;
}
.tac-light input[type='date'] { color-scheme: light !important; }
`
/** Recorte más alto (más fondo metálico) para el bloque de pantalla completa. */
const LOGO_TALL = '/brand/logo-cdnneo-2026-tall.jpg'
import { useLiveShift, useTactical } from './useTactical'

const C = DASHBOARD_MODULE.color

type Modal =
  | { kind: 'num'; title: string; fields: NumField[]; note?: string; save: (v: Record<string, number | null>) => Promise<void> }
  | { kind: 'hk' }
  | { kind: 'goals' }
  | { kind: 'history' }
  | null

const hhmm = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/El_Salvador' })
    : null

/**
 * Diálogo Táctico CD Nneo — tablero de pantalla completa (Dashboard Neuronal).
 *
 * Se pinta como una capa fija sobre toda la app (sin nav) porque su propósito
 * es proyectarse en una sola pantalla durante la reunión de turno. Las filas
 * de proceso y el fill rate son de solo lectura aquí (los llena cada módulo);
 * el gerente llena compromisos, jefe de turno, seguridad, orden y equipo.
 */
export function TacticalBoard({ onExit }: { onExit: () => void }) {
  const { adminUser } = useAuth()
  const isManager = adminUser?.access_level === 'admin' || adminUser?.access_level === 'gerencia'
  // Turnos habilitados/horarios (Ajustes → Turnos). La key estable evita
  // reiniciar el reloj en cada re-consulta de ajustes.
  const [shiftCfg, setShiftCfg] = useState<ShiftsConfig | undefined>(undefined)
  const live = useLiveShift(shiftCfg)
  const { date, shift } = live
  const { data, settings, error, loadedAt, reload } = useTactical(date, shift)
  const cfgKey = settings ? JSON.stringify(settings.goals.shifts) : ''
  useEffect(() => {
    if (cfgKey) setShiftCfg(JSON.parse(cfgKey) as ShiftsConfig)
  }, [cfgKey])
  const shiftList = shiftCfg ? enabledShifts(shiftCfg) : undefined
  const [modal, setModal] = useState<Modal>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Compromisos con autoguardado
  const [comp, setComp] = useState<Commitment[]>(EMPTY_COMMITMENTS)
  const editing = useRef(false)
  useEffect(() => {
    if (editing.current || !data) return
    setComp(data.shift?.commitments ?? EMPTY_COMMITMENTS)
  }, [data])

  // Gerente de CD = empleado con puesto "Gerente CD…" (o el usuario de nivel
  // gerencia). No depende de quién tenga la sesión; se guarda con el turno.
  const [cdManager, setCdManager] = useState<string | null>(null)
  useEffect(() => {
    fetchCdManager()
      .then(setCdManager)
      .catch(() => setCdManager(null))
  }, [])
  const lead = cdManager || data?.shift?.shift_lead || null

  // Jefes de turno = empleado activo con el puesto correspondiente a cada
  // módulo (catálogo de Empleados/Puestos — ver PROCESS_LEAD_POSITIONS).
  const [areaLeads, setAreaLeads] = useState<AreaLead[] | null>(null)
  useEffect(() => {
    fetchProcessLeads()
      .then(setAreaLeads)
      .catch(() => setAreaLeads([]))
  }, [])

  // Tema del tablero: oscuro por defecto; la elección se recuerda en este equipo.
  const [light, setLight] = useState(() => {
    try {
      return localStorage.getItem('neurale:tactical-theme') === 'light'
    } catch {
      return false
    }
  })
  function toggleTheme() {
    setLight((v) => {
      try {
        localStorage.setItem('neurale:tactical-theme', v ? 'dark' : 'light')
      } catch {
        /* sin almacenamiento: solo dura esta sesión */
      }
      return !v
    })
  }

  // Pantalla completa: solo desde "En vivo" hacia abajo
  const fsRef = useRef<HTMLDivElement>(null)
  const [isFs, setIsFs] = useState(false)
  useEffect(() => {
    const on = () => setIsFs(document.fullscreenElement === fsRef.current && !!fsRef.current)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const key = { shift_date: date, shift }
  const sub = `CD Nneo · ${date} · Turno ${shift}`

  async function run(fn: () => Promise<void>, ok = 'Guardado') {
    try {
      await fn()
      setToast(ok)
      reload()
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e))
    }
  }

  /** Guarda datos del gerente para el turno, sellando el jefe de turno. */
  function shiftSave(values: Partial<Omit<ShiftRow, 'shift_date' | 'shift'>>) {
    return saveShift(key, { ...values, shift_lead: lead })
  }

  function saveText() {
    editing.current = false
    const prevComp = data?.shift?.commitments ?? EMPTY_COMMITMENTS
    if (JSON.stringify(prevComp) === JSON.stringify(comp)) return
    run(() => shiftSave({ commitments: comp }))
  }

  function toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen()
      else fsRef.current?.requestFullscreen().catch(() => setToast('Pantalla completa no disponible: usa F11'))
    } catch {
      setToast('Pantalla completa no disponible: usa F11')
    }
  }

  const board: Board | null = data && settings ? computeBoard(data, settings, date) : null

  // Portal a <body>: la animación de entrada compartida (.neural-enter) deja un
  // `transform` en el contenedor de la ruta, y eso atraparía a `position: fixed`.
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex flex-col overflow-hidden bg-neurale-bg text-white ${light ? 'tac-light' : ''}`}
    >
      <style>{THEME_CSS}</style>
      <NeuralField color={C} seed="dashboard-tactical" className="absolute inset-0 opacity-40" />
      <div className="absolute inset-0 bg-gradient-to-b from-neurale-bg/90 via-neurale-bg/80 to-neurale-bg/95" />

      <div className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3 xl:p-4 [@media(min-height:860px)]:lg:overflow-hidden">
        {/* ---------- Encabezado ---------- */}
        <header
          className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border bg-neurale-surface px-4 py-3 backdrop-blur-md"
          style={{ borderColor: withAlpha(C, 0.25), boxShadow: `inset 0 -2px 0 ${C}` }}
        >
          <img
            src={LOGO}
            alt="CD Nneo"
            className="h-14 w-auto rounded-lg border border-white/10 shadow-[0_4px_18px_rgba(0,0,0,0.45)]"
          />
          <div className="mr-auto flex flex-col">
            <span className="flex items-center gap-2 text-[11px] font-medium tracking-[0.22em] text-white/50 uppercase">
              <span className="rounded bg-neurale-red px-1.5 py-0.5 font-display text-[11px] font-bold tracking-[0.14em] text-white">
                VIDRI
              </span>
              Diálogo táctico · por turno
            </span>
            <h1 className="font-display text-3xl leading-tight font-semibold" style={{ textShadow: `0 0 30px ${withAlpha(C, 0.4)}` }}>
              CD Nneo
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {isManager ? <Button onClick={() => setModal({ kind: 'goals' })}>Ajustes</Button> : null}
            <Button onClick={() => setModal({ kind: 'history' })}>Historial</Button>
            <Button onClick={toggleFullscreen}>Pantalla completa</Button>
            <Button onClick={onExit} title="Volver al Dashboard Neuronal">
              Salir
            </Button>
          </div>
        </header>

        {/* ---------- Zona de pantalla completa: desde "En vivo" hacia abajo ---------- */}
        <div
          ref={fsRef}
          className={`flex flex-1 flex-col gap-3 [@media(min-height:860px)]:lg:min-h-0 [&:fullscreen]:bg-neurale-bg ${isFs ? 'h-screen min-h-0 overflow-hidden p-3' : ''}`}
        >
        {!isFs ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-white/50">
          {live.follow ? (
            <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-semibold tracking-wider uppercase" style={{ color: C, borderColor: withAlpha(C, 0.5) }}>
              <span className="soma-pulse h-1.5 w-1.5 rounded-full" style={{ background: C }} /> En vivo
            </span>
          ) : (
            <button
              type="button"
              onClick={live.backToLive}
              className="rounded-full border border-white/20 px-2.5 py-0.5 font-semibold tracking-wider text-white/70 uppercase hover:text-white"
            >
              Volver al turno actual
            </button>
          )}
          <span>
            Turno {shift} ({shiftCfg ? shiftHours(shiftCfg, shift) : '—'}). Cada módulo llena su fila desde su opción
            "Diálogo Táctico".
          </span>
          {loadedAt ? <span>Actualizado {loadedAt.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })}</span> : null}
          {error ? <span className="text-rose-300">Error: {error}</span> : null}
        </div>
        ) : null}

        {!board ? (
          <div className="flex flex-1 items-center justify-center text-sm text-white/45">{error ? '' : 'Cargando diálogo táctico…'}</div>
        ) : (
          <main className={`grid flex-1 grid-cols-1 gap-3 [@media(min-height:860px)]:lg:min-h-0 ${isFs ? 'min-h-0 grid-cols-[minmax(0,1fr)_minmax(330px,27%)]' : 'lg:grid-cols-[minmax(0,1fr)_minmax(300px,25%)]'}`}>
            {/* ---------- Columna principal ---------- */}
            <div className={`flex flex-col gap-3 [@media(min-height:860px)]:lg:min-h-0 ${isFs ? 'min-h-0' : ''}`}>
              <Matrix board={board} dense={isFs} />

              <section className={`rounded-2xl border border-neurale-border bg-neurale-surface backdrop-blur-md ${isFs ? 'px-3 py-2' : 'p-3'}`}>
                <div className={`flex flex-wrap items-baseline gap-x-3 ${isFs ? 'mb-1' : 'mb-2'}`}>
                  <h2 className="font-display text-sm font-semibold tracking-[0.14em] text-white/60 uppercase">Compromisos del turno</h2>
                  <span className="text-xs text-white/35">Los llena el gerente · se revisan al arranque del turno siguiente</span>
                </div>
                <div className={`flex flex-col ${isFs ? 'gap-1' : 'gap-1.5'}`}>
                  {comp.map((c, i) => (
                    <div key={i} className="grid grid-cols-[22px_1fr] items-center gap-2">
                      <span className="text-center font-display text-lg font-bold text-neurale-red">{i + 1}</span>
                      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_minmax(0,8rem)]">
                        {(
                          [
                            ['problem', 'Problema o desvío'],
                            ['owner', 'Responsable'],
                            ['due', 'Para cuándo'],
                          ] as const
                        ).map(([f, ph]) => (
                          <input
                            key={f}
                            value={c[f]}
                            disabled={!isManager}
                            placeholder={ph}
                            onFocus={() => (editing.current = true)}
                            onBlur={saveText}
                            onChange={(e) => {
                              const next = comp.map((x) => ({ ...x }))
                              next[i][f] = e.target.value
                              setComp(next)
                            }}
                            className={`${fieldClass} ${f === 'problem' ? 'col-span-2 md:col-span-1' : ''} ${isFs ? '!py-1' : ''}`}
                            style={ringStyle(C)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* ---------- Columna lateral ---------- */}
            <aside className={`flex flex-col [@media(min-height:860px)]:lg:min-h-0 ${isFs ? 'min-h-0 gap-2' : 'gap-3'}`}>
              <section className={`flex shrink-0 flex-col rounded-2xl border border-neurale-border bg-neurale-surface backdrop-blur-md ${isFs ? 'gap-1.5 p-2.5' : 'gap-2 p-3'}`}>
                {isFs ? (
                  // En pantalla completa el encabezado y la línea de estado quedan
                  // fuera: estado + logo con fecha / turno / semana a su derecha.
                  <>
                    <div className="flex min-w-0 items-center gap-2 text-xs whitespace-nowrap text-white/50">
                      {live.follow ? (
                        <span
                          className="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-semibold tracking-wider uppercase"
                          style={{ color: C, borderColor: withAlpha(C, 0.5) }}
                        >
                          <span className="soma-pulse h-1.5 w-1.5 rounded-full" style={{ background: C }} /> En vivo
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={live.backToLive}
                          className="rounded-full border border-white/20 px-2.5 py-0.5 font-semibold tracking-wider text-white/70 uppercase hover:text-white"
                        >
                          Volver al turno
                        </button>
                      )}
                      {loadedAt ? (
                        <span>
                          Actualizado{' '}
                          {loadedAt.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', timeZone: 'America/El_Salvador' })}
                        </span>
                      ) : null}
                      {error ? <span className="truncate text-rose-300">Error: {error}</span> : null}
                      <button
                        type="button"
                        onClick={toggleTheme}
                        title={light ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
                        aria-label={light ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
                        className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/70 transition-colors hover:border-white/35 hover:text-white"
                      >
                        {light ? (
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <circle cx="12" cy="12" r="4" />
                            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                          </svg>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={toggleFullscreen}
                        title="Salir de pantalla completa (Esc)"
                        aria-label="Salir de pantalla completa"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/70 transition-colors hover:border-white/35 hover:text-white"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M9 3v4a2 2 0 0 1-2 2H3M15 3v4a2 2 0 0 0 2 2h4M9 21v-4a2 2 0 0 0-2-2H3M15 21v-4a2 2 0 0 1 2-2h4" />
                        </svg>
                      </button>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2.5">
                      <img
                        src={LOGO_TALL}
                        alt="CD Nneo"
                        className="aspect-[743/320] h-auto w-full rounded-lg border border-white/10 object-contain shadow-[0_4px_18px_rgba(0,0,0,0.45)]"
                      />
                      <ShiftPicker compact date={date} shift={shift} onDate={live.setDate} onShift={live.setShift} color={C} shifts={shiftList} />
                    </div>
                  </>
                ) : (
                  <ShiftPicker date={date} shift={shift} onDate={live.setDate} onShift={live.setShift} color={C} shifts={shiftList} />
                )}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] tracking-[0.18em] text-white/45 uppercase">Gerente de CD</span>
                  <span className={`flex items-center rounded-lg border border-neurale-border bg-white/5 px-3 font-display font-semibold tracking-wide text-white uppercase ${isFs ? 'min-h-7 text-sm' : 'min-h-8 text-base'}`}>
                    {lead || <span className="text-sm font-normal tracking-normal text-white/35 normal-case">Sin asignar</span>}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] tracking-[0.18em] text-white/45 uppercase">Jefes de turno</span>
                  <div className={`flex flex-col rounded-lg border border-neurale-border bg-white/5 px-3 ${isFs ? 'gap-0 py-1' : 'gap-0.5 py-1.5'}`}>
                    {MODULES.filter((m) => m.id in PROCESS_LEAD_POSITIONS).map((m) => {
                      const names = (areaLeads ?? []).filter((l) => l.module === m.id).map((l) => l.name)
                      return (
                        <div key={m.id} className="flex min-w-0 items-baseline gap-2 text-[11px] leading-snug">
                          <span className="h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full" style={{ background: m.color }} />
                          <span className="w-[4.6rem] shrink-0 text-[10px] tracking-wider uppercase" style={{ color: m.color }}>
                            {m.label}
                          </span>
                          <span className="truncate font-medium text-white/85 uppercase" title={names.join(', ')}>
                            {areaLeads === null ? '…' : names.length ? names.join(', ') : <span className="text-white/30 normal-case">Sin asignar</span>}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </section>
              <Card title="Seguridad" grow fit={isFs}>
                <div
                  className={`grid flex-1 gap-1.5 ${
                    isFs
                      ? 'min-h-0 grid-cols-[1.25fr_1fr_1fr] grid-rows-[minmax(0,1fr)]'
                      : 'grid-cols-2 grid-rows-[minmax(min-content,1.25fr)_minmax(min-content,1fr)]'
                  }`}
                >
                  <Cell
                    big
                    className={isFs ? '' : 'col-span-2'}
                    status={board.safety.incidents > 0 ? 'bad' : board.safety.lti === null ? 'na' : 'ok'}
                    label={isFs ? 'Días sin accidentes (LTI)' : 'Días sin accidentes con tiempo perdido (LTI)'}
                    value={fmt(board.safety.lti)}
                    meta={
                      board.safety.lti === null
                        ? isManager
                          ? 'Toca para registrar los días'
                          : 'Sin registrar'
                        : board.safety.record !== null
                          ? board.safety.lti >= board.safety.record
                            ? `Récord del centro: ${fmt(board.safety.record)} · ¡nuevo récord!`
                            : `Récord del centro: ${fmt(board.safety.record)} · faltan ${fmt(board.safety.record - board.safety.lti)}`
                          : 'Se acumula solo cada día'
                    }
                    onClick={
                      isManager
                        ? () =>
                            setModal({
                              kind: 'num',
                              title: 'Seguridad · Días sin LTI',
                              note: 'Solo gerencia. Los días se acumulan solos cada día; si hubo un accidente con tiempo perdido, pon 0.',
                              fields: [
                                { key: 'dias', label: 'Días sin LTI (a esta fecha)', value: board.safety.lti, integer: true },
                                { key: 'record', label: 'Récord histórico (días)', value: board.safety.record, integer: true },
                              ],
                              save: (v) =>
                                saveSettings({
                                  lti_since: v.dias === null ? null : addDays(date, -v.dias),
                                  lti_record: v.record,
                                }),
                            })
                        : undefined
                    }
                  />
                  <Cell
                    status={board.safety.incStatus}
                    label={isFs ? 'Incidentes del turno' : 'Accidentes / incidentes del turno'}
                    value={board.safety.incidents}
                    meta="Meta 0 · inicia el turno en 0"
                    onClick={() =>
                      setModal({
                        kind: 'num',
                        title: 'Seguridad · Incidentes del turno',
                        note: 'Registrar un incidente no reinicia los días sin LTI. Si fue con tiempo perdido, pon los días en 0.',
                        fields: [{ key: 'incidents', label: 'Accidentes o incidentes', value: board.safety.incidents, integer: true }],
                        save: (v) => saveSafety(key, { incidents: v.incidents ?? 0 }),
                      })
                    }
                  />
                  <Cell
                    status="na"
                    label={isFs ? 'Casi acc. / actos inseg.' : 'Casi accidentes / actos inseguros'}
                    value={<Ratio a={board.safety.nearMisses} b={board.safety.unsafeActs} />}
                    meta="Más reportes = más prevención"
                    onClick={() =>
                      setModal({
                        kind: 'num',
                        title: 'Seguridad · Reportes del turno',
                        fields: [
                          { key: 'near_misses', label: 'Casi accidentes', value: board.safety.nearMisses, integer: true },
                          { key: 'unsafe_acts', label: 'Actos / condiciones inseguras', value: board.safety.unsafeActs, integer: true },
                        ],
                        save: (v) => saveSafety(key, { near_misses: v.near_misses ?? 0, unsafe_acts: v.unsafe_acts ?? 0 }),
                      })
                    }
                  />
                </div>
              </Card>

              <Card title="Orden y equipo" grow fit={isFs}>
                <div
                  className={`grid flex-1 gap-1.5 ${
                    isFs
                      ? 'min-h-0 grid-cols-[1.25fr_1fr_1fr] grid-rows-[minmax(0,1fr)]'
                      : 'grid-cols-2 grid-rows-[minmax(min-content,1fr)_minmax(min-content,1fr)]'
                  }`}
                >
                  <Cell
                    className={isFs ? '' : 'col-span-2'}
                    status={board.hk.cls}
                    label={isFs ? 'Housekeeping' : 'Housekeeping del turno · checklist ponderado'}
                    value={board.hk.pct === null ? '—' : <>{fmt(board.hk.pct)}<span className="text-[0.55em] text-white/45">%</span></>}
                    meta={`${board.hk.lvl}${board.hk.crit ? ` · ${board.hk.crit} crítico(s) en No cumple` : ''}${board.hk.pend && board.hk.pct !== null ? ` · ${board.hk.pend} crítico(s) sin evaluar` : ''}`}
                    onClick={isManager ? () => setModal({ kind: 'hk' }) : undefined}
                  />
                  <Cell
                    status={board.s5.status}
                    label={isFs ? '5S (mensual)' : 'Auditoría 5S (mensual)'}
                    value={board.s5.value === null ? '—' : <>{fmt(board.s5.value)}<span className="text-[0.55em] text-white/45">%</span></>}
                    meta={`Meta ${settings!.goals.g.s5}%`}
                    onClick={
                      isManager
                        ? () =>
                            setModal({
                              kind: 'num',
                              title: 'Orden · 5S',
                              fields: [{ key: 'audit_5s', label: 'Puntaje 5S (%)', value: data!.shift?.audit_5s }],
                              save: (v) => shiftSave({ audit_5s: v.audit_5s }),
                            })
                        : undefined
                    }
                  />
                  <Cell
                    status={board.preop.status}
                    label={isFs ? 'Pre-operacional' : 'Pre-operacional montacargas'}
                    value={board.preop.pct === null ? '—' : <>{fmt(board.preop.pct)}<span className="text-[0.55em] text-white/45">%</span></>}
                    meta={`${fmt(data!.shift?.preop_done)} de ${fmt(data!.shift?.preop_in_use)} equipos`}
                    onClick={
                      isManager
                        ? () =>
                            setModal({
                              kind: 'num',
                              title: 'Equipo · Pre-operacional',
                              fields: [
                                { key: 'preop_done', label: 'Checklists completados', value: data!.shift?.preop_done, integer: true },
                                { key: 'preop_in_use', label: 'Montacargas en uso', value: data!.shift?.preop_in_use, integer: true },
                              ],
                              save: (v) => shiftSave(v),
                            })
                        : undefined
                    }
                  />
                </div>
              </Card>

              <Summary board={board} dense={isFs} />
            </aside>
          </main>
        )}

        {/* ---------- Modales ---------- */}
        {modal?.kind === 'num' ? (
          <NumberDialog
            title={modal.title}
            subtitle={sub}
            fields={modal.fields}
            note={modal.note}
            color={C}
            onClose={() => setModal(null)}
            onSave={async (v) => {
              await modal.save(v)
              setToast('Guardado')
              reload()
            }}
          />
        ) : null}
        {modal?.kind === 'hk' && data ? (
          <HousekeepingDialog
            initial={data.shift?.housekeeping ?? { r: {}, obs: '' }}
            subtitle={sub}
            onClose={() => setModal(null)}
            onSave={async (hk) => {
              await shiftSave({ housekeeping: hk })
              setToast('Evaluación guardada')
              reload()
            }}
          />
        ) : null}
        {modal?.kind === 'goals' && settings ? (
          <SettingsDialog
            goals={settings.goals}
            onClose={() => setModal(null)}
            onSave={async (g) => {
              await saveSettings({ goals: g })
              setToast('Ajustes guardados')
              reload()
            }}
          />
        ) : null}
        {modal?.kind === 'history' && settings ? (
          <HistoryDialog
            settings={settings}
            onClose={() => setModal(null)}
            onOpen={(d, s) => {
              live.setDate(d)
              live.setShift(s)
            }}
          />
        ) : null}

        {toast ? (
          <div className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neurale-bg shadow-lg">
            {toast}
          </div>
        ) : null}
        </div>
      </div>

    </div>,
    document.body,
  )
}

/* ---------- Matriz de procesos ---------- */

function Matrix({ board, dense }: { board: Board; dense?: boolean }) {
  const heads = ['Volumen', 'Productividad', 'Dotación', 'Montacargas · Transporte', 'Calidad']
  const fr = board.fr
  const sol = fr.row?.lines_requested ?? null
  const des = fr.row?.lines_dispatched ?? null
  const missing = sol !== null && des !== null ? sol - des : null

  return (
    <section
      className={`rounded-2xl border border-neurale-border bg-neurale-surface backdrop-blur-md [@media(min-height:860px)]:lg:min-h-0 [@media(min-height:860px)]:lg:flex-1 ${
        dense ? 'min-h-0 flex-1 overflow-hidden p-2' : 'overflow-x-auto p-2.5'
      }`}
    >
      <div
        className={`grid h-full gap-1.5 ${
          dense
            ? 'grid-cols-[minmax(104px,0.62fr)_repeat(5,minmax(0,1fr))] grid-rows-[auto_repeat(4,minmax(0,1fr))_auto_minmax(0,0.9fr)]'
            : 'min-w-[860px] grid-cols-[150px_repeat(5,minmax(0,1fr))] grid-rows-[auto_repeat(4,minmax(96px,1fr))_auto_minmax(96px,1fr)]'
        }`}
      >
        <div />
        {heads.map((h) => (
          <div key={h} className="px-2 font-display text-xs font-semibold tracking-[0.12em] text-white/50 uppercase">
            {h}
          </div>
        ))}

        {board.rows.map((r) => {
          const mod = MODULES.find((m) => m.id === r.def.module)!
          const d = r.data
          const u = r.goal.unidad
          const upd = hhmm(d?.updated_at)
          return (
            <Row key={r.def.id}>
              <div
                className="flex flex-col justify-center gap-0.5 rounded-xl border-l-4 bg-white/[0.04] px-3 py-2"
                style={{ borderColor: mod.color }}
              >
                <b className={`font-display leading-tight font-semibold ${dense ? 'text-[clamp(0.85rem,1.15vw,1.125rem)]' : 'text-base break-words xl:text-lg'}`}>{r.def.nombre}</b>
                <small className="text-xs text-white/45">{u}</small>
                <small className="text-[10px] tracking-wide uppercase" style={{ color: upd ? mod.color : 'color-mix(in oklab, var(--color-white) 30%, transparent)' }}>
                  {upd ? `Actualizado ${upd}` : 'Sin captura'}
                </small>
              </div>
              {r.inbound ? (
                <div className="grid min-w-0 grid-cols-2 gap-1.5">
                  <Cell
                    compact
                    status={r.s.vol}
                    label="Contenedores"
                    value={<Ratio a={fmt(d?.vol_real)} b={fmt(d?.vol_plan)} />}
                    meta={r.volPct === null ? 'Real / plan' : `${fmt(r.volPct)}% del plan`}
                  />
                  <Cell
                    compact
                    status={r.s.pallets}
                    label="Pallets aprox."
                    value={<Ratio a={fmt(r.inbound.palletsReal)} b={fmt(r.inbound.palletsPlan)} />}
                    meta={`×${fmt(r.palletsPerContainer)} por cont.`}
                  />
                </div>
              ) : r.def.autoStorage ? (
                <Cell
                  status={r.s.vol}
                  label="Cumplimiento del plan"
                  value={r.volPct === null ? '—' : <>{fmt(r.volPct)}<span className="text-[0.55em] text-white/45">%</span></>}
                  meta={
                    r.storage
                      ? `${fmt(r.volReal)} / ${fmt(r.volPlan)} pallets${r.storage.carry ? ` · +${fmt(r.storage.carry)} pendiente` : ''}`
                      : 'Sin dato'
                  }
                />
              ) : (
                <Cell
                  status={r.s.vol}
                  label="Real / plan"
                  value={<Ratio a={fmt(r.volReal)} b={fmt(r.volPlan)} />}
                  meta={r.volPct === null ? 'Sin dato' : `${fmt(r.volPct)}% del plan`}
                />
              )}
              <Cell
                status={r.s.prod}
                label={
                  r.inbound
                    ? 'Pallets por aux. descarga'
                    : r.def.perPersonHour
                      ? `${u} por persona/hora`
                      : `${u} por hora-hombre`
                }
                value={fmt(r.prod)}
                meta={
                  r.inbound
                    ? `Meta ${fmt(r.metaProd)} (pallets plan ÷ aux. plan)`
                    : r.def.perPersonHour
                      ? `Meta ${fmt(r.metaProd)} · ${fmt(r.pickHours)} h`
                      : `Meta ${fmt(r.metaProd)}`
                }
              />
              <Cell
                status={r.s.dot}
                label="Presentes / plan"
                value={<Ratio a={fmt(r.staffPresent)} b={fmt(r.staffPlan)} />}
                meta={
                  r.staff
                    ? `Rev ${fmt(r.staff.revPresent)}/${fmt(r.staff.revPlan)} · Aux ${fmt(r.staff.auxPresent)}/${fmt(r.staff.auxPlan)}`
                    : r.staffPresent == null
                      ? 'Sin dato'
                      : r.staffPresent < r.staffPlan
                        ? `Faltan ${fmt(r.staffPlan - r.staffPresent)}`
                        : 'Completo'
                }
              />
              <Cell
                status={r.s.mc}
                label={r.def.transport ? 'Camiones / plan' : 'Montacargas operativos / plan'}
                value={<Ratio a={fmt(d?.equip_available)} b={fmt(r.equipPlan)} />}
                meta={
                  d?.equip_available == null
                    ? 'Sin dato'
                    : d.equip_available < r.equipPlan
                      ? r.def.transport
                        ? `Faltan ${fmt(r.equipPlan - d.equip_available)} camión(es)`
                        : `${fmt(r.equipPlan - d.equip_available)} fuera de servicio`
                      : r.def.transport
                        ? 'Transporte completo'
                        : 'Flota completa'
                }
              />
              {r.def.isq ? (
                <div className="grid min-w-0 grid-cols-2 gap-1.5">
                  <Cell
                    compact
                    status={r.s.err}
                    label="Dif. OC"
                    value={fmt(r.errors)}
                    meta={`Máx. ${r.goal.metaErr}`}
                  />
                  <Cell
                    compact
                    status={r.s.isq}
                    label="ISQ"
                    value={fmt(r.isq)}
                    meta={r.isq === null ? "Sin lectura" : `Máx. ${r.isqMax}`}
                  />
                </div>
              ) : (
                <Cell
                  status={r.s.err}
                  label={r.def.err}
                  value={fmt(r.errors)}
                  meta={`Máximo ${r.goal.metaErr}${r.errSource ? ` · lo llena ${r.errSource}` : ''}`}
                />
              )}
            </Row>
          )
        })}

        <div className="col-span-6 my-0.5 h-px bg-white/10" />

        <div className="flex flex-col justify-center gap-0.5 rounded-xl border border-dashed border-white/15 px-3 py-2">
          <b className="font-display text-lg leading-tight font-semibold">Fill Rate</b>
          <small className="text-xs text-white/45">
            día anterior · {fr.date.slice(8, 10)}/{fr.date.slice(5, 7)}
          </small>
          <small className="text-[10px] tracking-wide uppercase" style={{ color: fr.row?.updated_at ? MODULES.find((m) => m.id === 'picking')!.color : 'color-mix(in oklab, var(--color-white) 30%, transparent)' }}>
            {fr.row?.updated_at ? `Picking · ${hhmm(fr.row.updated_at)}` : 'Picking · sin captura'}
          </small>
        </div>
        <Cell
          status={fr.status}
          label="Sucursales"
          value={fr.pct === null ? '—' : <>{fmt(fr.pct)}<span className="text-[0.55em] text-white/45">%</span></>}
          meta={`${fmt(des)} de ${fmt(sol)} líneas · meta ${board.fr.goal}%`}
        />
        <Cell
          status={missing === null ? 'na' : missing > 0 ? 'warn' : 'ok'}
          label="Líneas no surtidas"
          value={fmt(missing)}
          meta={missing === null || !sol ? 'Sin dato' : `${fmt(Math.max(missing, 0) / sol * 100)}% de lo solicitado`}
        />
        <Gauge value={fr.pct} goal={board.fr.goal} />
        <div className="col-span-2 flex flex-col justify-center gap-1 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2">
          <span className="text-[11px] text-white/55">Causa principal del faltante</span>
          <span className="font-display text-lg leading-tight font-semibold text-white/85">
            {fr.row?.shortage_cause || <span className="text-white/35">Sin registrar</span>}
          </span>
        </div>
      </div>
    </section>
  )
}

function Row({ children }: { children: ReactNode }) {
  return <>{children}</>
}

/**
 * Tarjeta de la columna lateral. `grow`: en modo "cabe en pantalla" reparte
 * la altura sobrante para que no queden huecos (las celdas se estiran).
 */
function Card({ title, children, grow, fit }: { title: string; children: ReactNode; grow?: boolean; fit?: boolean }) {
  return (
    <section
      className={`flex flex-col rounded-2xl border border-neurale-border bg-neurale-surface backdrop-blur-md ${
        grow ? '[@media(min-height:860px)]:lg:flex-1' : ''
      } ${fit ? 'min-h-0 flex-1 p-2.5' : 'p-3'}`}
    >
      <h2 className="mb-1.5 font-display text-sm font-semibold tracking-[0.14em] text-white/60 uppercase">{title}</h2>
      {children}
    </section>
  )
}

function Summary({ board, dense }: { board: Board; dense?: boolean }) {
  const s = board.summary
  const t = s.measured || 1
  return (
    <section
      className={`grid shrink-0 grid-cols-[auto_repeat(4,minmax(0,1fr))] items-end gap-x-3 rounded-2xl border border-neurale-border bg-neurale-surface backdrop-blur-md ${
        dense ? 'gap-y-1.5 p-2.5' : 'gap-y-2 p-3'
      }`}
    >
      <div className="flex flex-col pr-1">
        <span className="text-[10px] tracking-wider text-white/45 uppercase">En meta</span>
        <span className="font-display text-[clamp(1.8rem,3.8vh,2.6rem)] leading-none font-semibold tabular-nums">
          {s.inGoal === null ? '—' : `${s.inGoal}%`}
        </span>
      </div>
      {(
        [
          ['Verde', s.ok, STATUS_COLOR.ok],
          ['Alerta', s.warn, STATUS_COLOR.warn],
          ['Fuera', s.bad, STATUS_COLOR.bad],
          ['Sin dato', s.na, 'color-mix(in oklab, var(--color-white) 40%, transparent)'],
        ] as const
      ).map(([l, v, c]) => (
        <div key={l} className="flex flex-col">
          <span className="text-[10px] tracking-wider text-white/45 uppercase">{l}</span>
          <span className="font-display text-2xl leading-none font-semibold tabular-nums" style={{ color: c }}>
            {v}
          </span>
        </div>
      ))}
      <div className="col-span-5 flex h-2.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <i style={{ width: `${(s.ok / t) * 100}%`, background: STATUS_COLOR.ok }} />
        <i style={{ width: `${(s.warn / t) * 100}%`, background: STATUS_COLOR.warn }} />
        <i style={{ width: `${(s.bad / t) * 100}%`, background: STATUS_COLOR.bad }} />
      </div>
      <span className="col-span-5 text-[10px] leading-snug text-white/35 [@media(max-height:1200px)]:hidden">
        Verde ≥ 100% de la meta · amarillo 90–99% · rojo &lt; 90%. En calidad, verde = dentro del máximo.
      </span>
    </section>
  )
}
