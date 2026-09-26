import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useAuth } from '@/shared/auth/AuthContext'
import { NeuralField } from '@/shared/components/NeuralField'
import { DASHBOARD_MODULE, MODULES, withAlpha } from '@/shared/modules'

import {
  EMPTY_COMMITMENTS,
  saveSafety,
  saveSettings,
  saveShift,
  type Commitment,
} from './api'
import { SHIFTS, addDays } from './config'
import { GoalsDialog, HistoryDialog, HousekeepingDialog } from './dialogs'
import { STATUS_COLOR, computeBoard, fmt, type Board } from './metrics'
import { Button, Cell, NumberDialog, Ratio, ShiftPicker, fieldClass, ringStyle, type NumField } from './ui'
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
    ? new Date(iso).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', timeZone: 'America/El_Salvador' })
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
  const live = useLiveShift()
  const { date, shift } = live
  const { data, settings, error, loadedAt, reload } = useTactical(date, shift)
  const [modal, setModal] = useState<Modal>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Campos de texto con autoguardado (compromisos, jefe de turno)
  const [comp, setComp] = useState<Commitment[]>(EMPTY_COMMITMENTS)
  const [lead, setLead] = useState('')
  const editing = useRef(false)
  useEffect(() => {
    if (editing.current || !data) return
    setComp(data.shift?.commitments ?? EMPTY_COMMITMENTS)
    setLead(data.shift?.shift_lead ?? '')
  }, [data])

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

  function saveText() {
    editing.current = false
    const prevComp = data?.shift?.commitments ?? EMPTY_COMMITMENTS
    const prevLead = data?.shift?.shift_lead ?? ''
    if (JSON.stringify(prevComp) === JSON.stringify(comp) && prevLead === lead) return
    run(() => saveShift(key, { commitments: comp, shift_lead: lead || null }))
  }

  function toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen()
      else document.documentElement.requestFullscreen().catch(() => setToast('Usa F11 para pantalla completa'))
    } catch {
      setToast('Usa F11 para pantalla completa')
    }
  }

  const board: Board | null = data && settings ? computeBoard(data, settings, date) : null

  // Portal a <body>: la animación de entrada compartida (.neural-enter) deja un
  // `transform` en el contenedor de la ruta, y eso atraparía a `position: fixed`.
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-neurale-bg text-white">
      <NeuralField color={C} seed="dashboard-tactical" className="absolute inset-0 opacity-40" />
      <div className="absolute inset-0 bg-gradient-to-b from-neurale-bg/90 via-neurale-bg/80 to-neurale-bg/95" />

      <div className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3 xl:p-4 [@media(min-height:860px)]:lg:overflow-hidden">
        {/* ---------- Encabezado ---------- */}
        <header
          className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-2xl border bg-neurale-surface px-4 py-3 backdrop-blur-md"
          style={{ borderColor: withAlpha(C, 0.25), boxShadow: `inset 0 -2px 0 ${C}` }}
        >
          <div className="mr-auto flex flex-col">
            <span className="flex items-center gap-2 text-[11px] font-medium tracking-[0.22em] text-white/50 uppercase">
              <span className="rounded bg-neurale-red px-1.5 py-0.5 font-display text-[11px] font-bold tracking-[0.14em] text-white">
                VIDRI
              </span>
              Diálogo táctico · por turno
            </span>
            <h1 className="font-display text-3xl leading-tight font-semibold" style={{ textShadow: `0 0 30px ${withAlpha(C, 0.4)}` }}>
              CD Nneo <span className="font-medium text-white/45">· Nejapa</span>
            </h1>
          </div>
          <ShiftPicker date={date} shift={shift} onDate={live.setDate} onShift={live.setShift} color={C} />
          <label className="flex flex-col gap-1">
            <span className="text-[10px] tracking-[0.18em] text-white/45 uppercase">Jefe de turno</span>
            <input
              value={lead}
              disabled={!isManager}
              placeholder="Quién presenta"
              onFocus={() => (editing.current = true)}
              onChange={(e) => setLead(e.target.value)}
              onBlur={saveText}
              className={`${fieldClass} min-h-9 w-44`}
              style={ringStyle(C)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {isManager ? <Button onClick={() => setModal({ kind: 'goals' })}>Metas</Button> : null}
            <Button onClick={() => setModal({ kind: 'history' })}>Historial</Button>
            <Button onClick={toggleFullscreen}>Pantalla completa</Button>
            <Button onClick={onExit} title="Volver al Dashboard Neuronal">
              Salir
            </Button>
          </div>
        </header>

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
            Turno {shift} ({SHIFTS.find((s) => s.id === shift)?.hours}). Cada módulo llena su fila desde su opción
            "Diálogo Táctico".
          </span>
          {loadedAt ? <span>Actualizado {loadedAt.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })}</span> : null}
          {error ? <span className="text-rose-300">Error: {error}</span> : null}
        </div>

        {!board ? (
          <div className="flex flex-1 items-center justify-center text-sm text-white/45">{error ? '' : 'Cargando diálogo táctico…'}</div>
        ) : (
          <main className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(300px,25%)] [@media(min-height:860px)]:lg:min-h-0">
            {/* ---------- Columna principal ---------- */}
            <div className="flex flex-col gap-3 [@media(min-height:860px)]:lg:min-h-0">
              <Matrix board={board} />

              <section className="rounded-2xl border border-neurale-border bg-neurale-surface p-3 backdrop-blur-md">
                <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
                  <h2 className="font-display text-sm font-semibold tracking-[0.14em] text-white/60 uppercase">Compromisos del turno</h2>
                  <span className="text-xs text-white/35">Los llena el gerente · se revisan al arranque del turno siguiente</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {comp.map((c, i) => (
                    <div key={i} className="grid grid-cols-[22px_1fr] items-center gap-2">
                      <span className="text-center font-display text-lg font-bold text-neurale-red">{i + 1}</span>
                      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-[minmax(0,1fr)_200px_150px]">
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
                            className={`${fieldClass} ${f === 'problem' ? 'col-span-2 md:col-span-1' : ''}`}
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
            <aside className="flex flex-col gap-3 [@media(min-height:860px)]:lg:min-h-0">
              <Card title="Seguridad">
                <div className="grid grid-cols-2 gap-1.5">
                  <Cell
                    big
                    className="col-span-2"
                    status={board.safety.incidents > 0 ? 'bad' : board.safety.lti === null ? 'na' : 'ok'}
                    label="Días sin accidentes con tiempo perdido (LTI)"
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
                    label="Accidentes / incidentes del turno"
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
                    label="Casi accidentes / actos inseguros"
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

              <Card title="Orden y equipo">
                <div className="grid grid-cols-2 gap-1.5">
                  <Cell
                    className="col-span-2"
                    status={board.hk.cls}
                    label="Housekeeping del turno · checklist ponderado"
                    value={board.hk.pct === null ? '—' : <>{fmt(board.hk.pct)}<span className="text-[0.55em] text-white/45">%</span></>}
                    meta={`${board.hk.lvl}${board.hk.crit ? ` · ${board.hk.crit} crítico(s) en No cumple` : ''}${board.hk.pend && board.hk.pct !== null ? ` · ${board.hk.pend} crítico(s) sin evaluar` : ''}`}
                    onClick={isManager ? () => setModal({ kind: 'hk' }) : undefined}
                  />
                  <Cell
                    status={board.s5.status}
                    label="Auditoría 5S (mensual)"
                    value={board.s5.value === null ? '—' : <>{fmt(board.s5.value)}<span className="text-[0.55em] text-white/45">%</span></>}
                    meta={`Meta ${settings!.goals.g.s5}%`}
                    onClick={
                      isManager
                        ? () =>
                            setModal({
                              kind: 'num',
                              title: 'Orden · 5S',
                              fields: [{ key: 'audit_5s', label: 'Puntaje 5S (%)', value: data!.shift?.audit_5s }],
                              save: (v) => saveShift(key, { audit_5s: v.audit_5s }),
                            })
                        : undefined
                    }
                  />
                  <Cell
                    status={board.preop.status}
                    label="Pre-operacional montacargas"
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
                              save: (v) => saveShift(key, v),
                            })
                        : undefined
                    }
                  />
                </div>
              </Card>

              <Summary board={board} />
            </aside>
          </main>
        )}
      </div>

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
            await saveShift(key, { housekeeping: hk })
            setToast('Evaluación guardada')
            reload()
          }}
        />
      ) : null}
      {modal?.kind === 'goals' && settings ? (
        <GoalsDialog
          goals={settings.goals}
          onClose={() => setModal(null)}
          onSave={async (g) => {
            await saveSettings({ goals: g })
            setToast('Metas guardadas')
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
    </div>,
    document.body,
  )
}

/* ---------- Matriz de procesos ---------- */

function Matrix({ board }: { board: Board }) {
  const heads = ['Volumen', 'Productividad', 'Dotación', 'Montacargas · Transporte', 'Calidad']
  const fr = board.fr
  const sol = fr.row?.lines_requested ?? null
  const des = fr.row?.lines_dispatched ?? null
  const missing = sol !== null && des !== null ? sol - des : null

  return (
    <section className="overflow-x-auto rounded-2xl [@media(min-height:860px)]:lg:min-h-0 [@media(min-height:860px)]:lg:flex-1 border border-neurale-border bg-neurale-surface p-2.5 backdrop-blur-md">
      <div className="grid h-full min-w-[860px] grid-cols-[150px_repeat(5,minmax(0,1fr))] grid-rows-[auto_repeat(4,minmax(96px,1fr))_auto_minmax(96px,1fr)] gap-1.5">
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
                <b className="font-display text-base leading-tight font-semibold break-words xl:text-lg">{r.def.nombre}</b>
                <small className="text-xs text-white/45">{u}</small>
                <small className="text-[10px] tracking-wide uppercase" style={{ color: upd ? mod.color : 'rgba(255,255,255,0.3)' }}>
                  {upd ? `${mod.label} · ${upd}` : `${mod.label} · sin captura`}
                </small>
              </div>
              <Cell
                status={r.s.vol}
                label="Real / plan"
                value={<Ratio a={fmt(d?.vol_real)} b={fmt(d?.vol_plan)} />}
                meta={r.volPct === null ? 'Sin dato' : `${fmt(r.volPct)}% del plan`}
              />
              <Cell status={r.s.prod} label={`${u} por hora-hombre`} value={fmt(r.prod)} meta={`Meta ${fmt(r.goal.metaProd)}`} />
              <Cell
                status={r.s.dot}
                label="Presentes / plan"
                value={<Ratio a={fmt(d?.staff_present)} b={fmt(r.staffPlan)} />}
                meta={
                  d?.staff_present == null
                    ? 'Sin dato'
                    : d.staff_present < r.staffPlan
                      ? `Faltan ${fmt(r.staffPlan - d.staff_present)}`
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
              <Cell status={r.s.err} label={r.def.err} value={fmt(d?.errors)} meta={`Máximo ${r.goal.metaErr}`} />
            </Row>
          )
        })}

        <div className="col-span-6 my-0.5 h-px bg-white/10" />

        <div className="flex flex-col justify-center gap-0.5 rounded-xl border border-dashed border-white/15 px-3 py-2">
          <b className="font-display text-lg leading-tight font-semibold">Fill Rate</b>
          <small className="text-xs text-white/45">resultado al cliente</small>
          <small className="text-[10px] tracking-wide uppercase" style={{ color: fr.row?.updated_at ? MODULES.find((m) => m.id === 'picking')!.color : 'rgba(255,255,255,0.3)' }}>
            {fr.row?.updated_at ? `Picking · ${hhmm(fr.row.updated_at)}` : 'Picking · sin captura'}
          </small>
        </div>
        <Cell
          className="col-span-2"
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

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-neurale-border bg-neurale-surface p-3 backdrop-blur-md">
      <h2 className="mb-2 font-display text-sm font-semibold tracking-[0.14em] text-white/60 uppercase">{title}</h2>
      {children}
    </section>
  )
}

function Summary({ board }: { board: Board }) {
  const s = board.summary
  const t = s.measured || 1
  return (
    <section className="mt-auto grid grid-cols-4 gap-x-2 gap-y-2 rounded-2xl border border-neurale-border bg-neurale-surface p-3 backdrop-blur-md">
      <div className="col-span-4 flex items-end justify-between">
        <div className="flex flex-col">
          <span className="text-[11px] tracking-wider text-white/45 uppercase">Indicadores en meta</span>
          <span className="font-display text-[clamp(2.2rem,5vh,3.2rem)] leading-none font-semibold tabular-nums">
            {s.inGoal === null ? '—' : `${s.inGoal}%`}
          </span>
        </div>
      </div>
      {(
        [
          ['En meta', s.ok, STATUS_COLOR.ok],
          ['Alerta', s.warn, STATUS_COLOR.warn],
          ['Fuera', s.bad, STATUS_COLOR.bad],
          ['Sin dato', s.na, 'rgba(255,255,255,0.4)'],
        ] as const
      ).map(([l, v, c]) => (
        <div key={l} className="flex flex-col">
          <span className="text-[10px] tracking-wider text-white/45 uppercase">{l}</span>
          <span className="font-display text-2xl leading-none font-semibold tabular-nums" style={{ color: c }}>
            {v}
          </span>
        </div>
      ))}
      <div className="col-span-4 flex h-2.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <i style={{ width: `${(s.ok / t) * 100}%`, background: STATUS_COLOR.ok }} />
        <i style={{ width: `${(s.warn / t) * 100}%`, background: STATUS_COLOR.warn }} />
        <i style={{ width: `${(s.bad / t) * 100}%`, background: STATUS_COLOR.bad }} />
      </div>
      <span className="col-span-4 text-[10px] leading-snug text-white/35">
        Verde ≥ 100% de la meta · amarillo 90–99% · rojo &lt; 90%. En calidad, verde = dentro del máximo.
      </span>
    </section>
  )
}
