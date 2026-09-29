import { useEffect, useState } from 'react'

import { fetchRange, type Settings, type ShiftRow } from './api'
import {
  DEFAULT_GOALS,
  HK,
  PROCESSES,
  addDays,
  isoWeek,
  shiftHours,
  todaySV,
  type Goals,
  type HkValue,
  type ShiftId,
} from './config'
import { hkLevels, STATUS_COLOR, computeBoard, fmt, hkScore, zoneScore } from './metrics'
import { Button, Dialog, fieldClass, ringStyle } from './ui'

const MIND = '#5eead4'

/* =====================================================================
 * Housekeeping · recorrido del turno (checklist ponderado)
 * ===================================================================== */

export function HousekeepingDialog({
  initial,
  subtitle,
  onSave,
  onClose,
}: {
  initial: ShiftRow['housekeeping']
  subtitle: string
  onSave: (hk: ShiftRow['housekeeping']) => Promise<void>
  onClose: () => void
}) {
  const [r, setR] = useState<Record<string, HkValue | undefined>>({ ...initial.r })
  const [obs, setObs] = useState(initial.obs)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const H = hkScore(r)
  const total = HK.reduce((a, z) => a + z.i.length, 0)
  const done = Object.values(r).filter(Boolean).length

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      await onSave({ r, obs })
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const OPTS: [HkValue, string, string][] = [
    ['c', 'Cumple', STATUS_COLOR.ok],
    ['p', 'Parcial', STATUS_COLOR.warn],
    ['n', 'No', STATUS_COLOR.bad],
    ['x', 'N/A', 'color-mix(in oklab, var(--color-white) 50%, transparent)'],
  ]

  return (
    <Dialog title="Housekeeping · recorrido del turno" subtitle={subtitle} onClose={onClose} wide>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-neurale-border px-5 py-3">
        <span className="font-display text-4xl font-semibold tabular-nums" style={{ color: STATUS_COLOR[H.cls] }}>
          {H.pct === null ? '—' : `${fmt(H.pct)}%`}
        </span>
        <span
          className="rounded-full border px-3 py-0.5 font-display text-sm"
          style={{ color: STATUS_COLOR[H.cls], borderColor: STATUS_COLOR[H.cls] }}
        >
          {H.lvl}
        </span>
        <span className="ml-auto text-xs text-white/45">
          {hkLevels().map((l, i, arr) => `${l[2]} ${i === 0 ? `≥${l[0]}%` : i === arr.length - 1 ? `<${arr[i - 1][0]}%` : `${l[0]}–${arr[i - 1][0] - 1}%`}`).join(' · ')}
        </span>
      </div>
      <div className="px-5 pb-3">
        {HK.map((z, zi) => {
          const zs = zoneScore(z, r)
          return (
            <div key={z.z} className="pt-4">
              <div className="flex items-center gap-3 border-b border-neurale-border pb-1.5">
                <b className="mr-auto font-display text-sm tracking-[0.1em] text-white uppercase">{z.z}</b>
                <span className="font-display text-base text-white/80 tabular-nums">
                  {zs === null ? '—' : `${fmt(zs)}%`}
                </span>
                <button
                  type="button"
                  className="rounded-md border border-neurale-border px-2 py-0.5 text-xs text-white/55 hover:text-white"
                  onClick={() => {
                    const next = { ...r }
                    HK[zi].i.forEach(([id]) => (next[id] = 'c'))
                    setR(next)
                  }}
                >
                  Todo cumple
                </button>
              </div>
              {z.i.map(([id, text, w]) => (
                <div
                  key={id}
                  className="grid grid-cols-1 items-center gap-2 border-b border-dashed border-white/10 py-2 sm:grid-cols-[1fr_auto]"
                >
                  <p className="text-sm text-white/80">
                    {text}
                    <span
                      className="ml-2 rounded border px-1.5 text-[10px] font-semibold"
                      style={w === 3 ? { color: STATUS_COLOR.bad, borderColor: STATUS_COLOR.bad } : { color: 'color-mix(in oklab, var(--color-white) 45%, transparent)', borderColor: 'color-mix(in oklab, var(--color-white) 15%, transparent)' }}
                    >
                      {w === 3 ? 'Crítico' : `Peso ${w}`}
                    </span>
                  </p>
                  <div className="flex overflow-hidden rounded-lg border border-neurale-border">
                    {OPTS.map(([v, l, c]) => {
                      const blocked = v === 'x' && w === 3
                      const on = r[id] === v
                      return (
                        <button
                          key={v}
                          type="button"
                          disabled={blocked}
                          title={blocked ? 'Los puntos críticos siempre se evalúan' : undefined}
                          onClick={() => setR((prev) => ({ ...prev, [id]: prev[id] === v ? undefined : v }))}
                          className="min-h-9 min-w-14 flex-1 border-l border-neurale-border text-xs font-semibold first:border-l-0 disabled:cursor-not-allowed disabled:opacity-25"
                          style={on ? { background: c, color: '#05070d' } : { color: 'color-mix(in oklab, var(--color-white) 60%, transparent)' }}
                        >
                          {blocked ? '—' : l}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-neurale-border bg-neurale-deep px-5 py-3">
        <input
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Observaciones y hallazgos principales"
          className={fieldClass}
          style={ringStyle(MIND)}
        />
        <p className="text-xs text-rose-300">
          {done < total ? `Faltan ${total - done} de ${total} puntos por evaluar. ` : ''}
          {H.pend ? `${H.pend} punto(s) crítico(s) sin evaluar. ` : ''}
          {H.capped ? 'Hay un punto crítico en "No cumple": el resultado queda limitado a Riesgo operativo.' : ''}
          {err}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button primary onClick={save} disabled={busy}>
            {busy ? 'Guardando…' : 'Aplicar evaluación'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/* =====================================================================
 * Ajustes del tablero (v7): Metas + Turnos
 * ===================================================================== */

type GoalField = { k: keyof Goals['g']; label: string; hint?: string; step?: string }

const GLOBAL_GROUPS: { title: string; fields: GoalField[] }[] = [
  {
    title: 'Inbound',
    fields: [
      { k: 'palletsPerContainer', label: 'Pallets promedio por contenedor' },
      { k: 'isqMax', label: 'Máx. incidencias ISQ por turno' },
    ],
  },
  {
    title: 'Storage',
    fields: [{ k: 'storagePct', label: '% del plan de pallets de Inbound', hint: 'Se vuelve el plan de Storage' }],
  },
  {
    title: 'Picking',
    fields: [
      { k: 'pickHours', label: 'Horas efectivas por turno', hint: 'Productividad = (líneas ÷ presentes) ÷ horas', step: '0.1' },
      { k: 'frSuc', label: 'Meta fill rate sucursales %' },
    ],
  },
  {
    title: 'Orden y equipo',
    fields: [
      { k: 's5', label: 'Meta 5S %' },
      { k: 'preop', label: 'Meta pre-operacional %' },
      { k: 'hkOk', label: 'Housekeeping "disciplinada" desde %' },
      { k: 'hkLv2', label: 'Housekeeping "estable" desde %' },
      { k: 'hkWarn', label: 'Housekeeping "riesgo" desde %' },
    ],
  },
  {
    title: 'Semáforo',
    fields: [
      { k: 'warnPct', label: 'Amarillo desde % de la meta', hint: 'Por debajo es rojo; ≥ 100% es verde' },
      { k: 'errMargin', label: 'Calidad: amarillo hasta +N sobre el máximo' },
    ],
  },
]

export function SettingsDialog({
  goals,
  onSave,
  onClose,
}: {
  goals: Goals
  onSave: (g: Goals) => Promise<void>
  onClose: () => void
}) {
  const [g, setG] = useState<Goals>(() => JSON.parse(JSON.stringify(goals)))
  const [tab, setTab] = useState<'metas' | 'turnos'>('metas')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? 0 : Number(s))
  const setProc = (i: number, patch: Partial<Goals['procesos'][number]>) => {
    const next = { ...g, procesos: [...g.procesos] }
    const merged = { ...next.procesos[i], ...patch }
    if (merged.id === 'rec') merged.dot = (merged.dotRev ?? 0) + (merged.dotAux ?? 0)
    next.procesos[i] = merged
    setG(next)
  }

  async function save() {
    setErr(null)
    const sh = g.shifts
    if (!sh.A.enabled && !sh.B.enabled) {
      setErr('Debe quedar al menos un turno habilitado.')
      setTab('turnos')
      return
    }
    const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/
    for (const id of ['A', 'B'] as ShiftId[]) {
      if (!hhmm.test(sh[id].start) || !hhmm.test(sh[id].end)) {
        setErr(`Revisa el horario del turno ${id} (formato HH:MM).`)
        setTab('turnos')
        return
      }
    }
    if (sh.A.enabled && sh.B.enabled && sh.B.start <= sh.A.start) {
      setErr('Con los dos turnos habilitados, el turno B debe empezar después del turno A.')
      setTab('turnos')
      return
    }
    if (!(g.g.hkOk > g.g.hkLv2 && g.g.hkLv2 > g.g.hkWarn)) {
      setErr('Los niveles de Housekeeping deben ir de mayor a menor (disciplinada > estable > riesgo).')
      setTab('metas')
      return
    }
    setBusy(true)
    try {
      await onSave(g)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const th = 'p-1.5 text-left text-[11px] font-medium tracking-wider text-white/45 uppercase'
  const input = (value: number | string, onChange: (v: string) => void, extra = '', step?: string) => (
    <input
      value={String(value)}
      inputMode={typeof value === 'number' ? 'decimal' : 'text'}
      step={step}
      onChange={(e) => onChange(e.target.value)}
      className={`${fieldClass} tabular-nums ${extra}`}
      style={ringStyle(MIND)}
    />
  )

  return (
    <Dialog title="Ajustes del Diálogo Táctico · CD Nneo" subtitle="Solo gerencia y admin pueden cambiarlos." onClose={onClose} wide>
      <div className="flex gap-1 border-b border-neurale-border px-5 pt-3">
        {(
          [
            ['metas', 'Metas'],
            ['turnos', 'Turnos'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className="rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium"
            style={tab === id ? { borderColor: MIND, color: MIND } : { borderColor: 'transparent', color: 'color-mix(in oklab, var(--color-white) 55%, transparent)' }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'metas' ? (
        <div className="overflow-x-auto p-5">
          <h4 className="mb-2 font-display text-sm font-semibold tracking-[0.12em] text-white/60 uppercase">Por proceso</h4>
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr>
                <th className={th}>Proceso</th>
                <th className={th}>Unidad</th>
                <th className={th}>Meta productividad</th>
                <th className={th}>Máx. errores</th>
                <th className={th}>Dotación base</th>
                <th className={th}>Montacargas / camiones base</th>
              </tr>
            </thead>
            <tbody>
              {g.procesos.map((p, i) => (
                <tr key={p.id} className="border-t border-neurale-border align-top">
                  <td className="p-1.5 pt-3.5 text-white/80">{PROCESSES.find((x) => x.id === p.id)?.nombre}</td>
                  <td className="p-1.5">{input(p.unidad, (v) => setProc(i, { unidad: v }))}</td>
                  <td className="p-1.5">
                    {p.id === 'rec' ? (
                      <span className="block px-1 pt-2 text-xs text-white/45">Automática (pallets plan ÷ aux. descarga plan)</span>
                    ) : (
                      <>
                        {input(p.metaProd, (v) => setProc(i, { metaProd: num(v) }))}
                        <span className="mt-0.5 block text-[10px] text-white/35">
                          {p.id === 'pic' ? 'líneas por persona/hora' : `${p.unidad} por hora-hombre`}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="p-1.5">{input(p.metaErr, (v) => setProc(i, { metaErr: num(v) }))}</td>
                  <td className="p-1.5">
                    {p.id === 'rec' ? (
                      <div className="grid grid-cols-2 gap-1.5">
                        <label className="text-[10px] text-white/45">
                          Revisadores
                          {input(p.dotRev ?? 0, (v) => setProc(i, { dotRev: num(v) }))}
                        </label>
                        <label className="text-[10px] text-white/45">
                          Aux. descarga
                          {input(p.dotAux ?? 0, (v) => setProc(i, { dotAux: num(v) }))}
                        </label>
                        <span className="col-span-2 text-[10px] text-white/35">Total: {fmt(p.dot)}</span>
                      </div>
                    ) : (
                      input(p.dot, (v) => setProc(i, { dot: num(v) }))
                    )}
                  </td>
                  <td className="p-1.5">{input(p.mc, (v) => setProc(i, { mc: num(v) }))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {GLOBAL_GROUPS.map((grp) => (
              <fieldset key={grp.title} className="rounded-xl border border-neurale-border p-3">
                <legend className="px-1 font-display text-xs font-semibold tracking-[0.12em] text-white/60 uppercase">{grp.title}</legend>
                <div className="flex flex-col gap-2">
                  {grp.fields.map((f) => (
                    <label key={f.k} className="grid grid-cols-[1fr_7rem] items-center gap-3">
                      <span className="text-xs text-white/65">
                        {f.label}
                        {f.hint ? <span className="block text-[10px] text-white/35">{f.hint}</span> : null}
                      </span>
                      {input(g.g[f.k], (v) => setG({ ...g, g: { ...g.g, [f.k]: num(v) } }), '', f.step)}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-5">
          <p className="text-sm text-white/55">
            Con los <b className="text-white">dos turnos</b> habilitados, el tablero y Storage trabajan <b className="text-white">turno a turno</b>
            (el pendiente de Storage pasa al turno siguiente). Con <b className="text-white">un solo turno</b>, trabajan{' '}
            <b className="text-white">día a día</b>.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {(['A', 'B'] as ShiftId[]).map((id) => {
              const sh = g.shifts[id]
              const setSh = (patch: Partial<typeof sh>) => setG({ ...g, shifts: { ...g.shifts, [id]: { ...sh, ...patch } } })
              return (
                <fieldset key={id} className="rounded-xl border border-neurale-border p-4" style={{ opacity: sh.enabled ? 1 : 0.6 }}>
                  <legend className="px-1 font-display text-sm font-semibold text-white">Turno {id}</legend>
                  <label className="mb-3 flex items-center gap-2 text-sm text-white/80">
                    <input type="checkbox" checked={sh.enabled} onChange={(e) => setSh({ enabled: e.target.checked })} className="h-4 w-4 accent-[#5eead4]" />
                    Habilitado
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-[11px] tracking-wider text-white/45 uppercase">
                      Inicio
                      <input type="time" value={sh.start} onChange={(e) => setSh({ start: e.target.value })} className={`${fieldClass} [color-scheme:dark]`} style={ringStyle(MIND)} />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] tracking-wider text-white/45 uppercase">
                      Fin
                      <input type="time" value={sh.end} onChange={(e) => setSh({ end: e.target.value })} className={`${fieldClass} [color-scheme:dark]`} style={ringStyle(MIND)} />
                    </label>
                  </div>
                </fieldset>
              )
            })}
          </div>
          <p className="text-xs text-white/40">
            El horario decide a qué turno pertenece cada registro automático (p. ej. Registro x Pallet) y qué turno muestra el tablero
            "En vivo". Lo registrado antes del inicio del turno A cuenta para el turno B del día anterior.
          </p>
        </div>
      )}

      {err ? <p className="px-5 text-sm text-rose-300">{err}</p> : null}
      <div className="flex flex-wrap justify-end gap-2 px-5 pt-2 pb-5">
        <Button onClick={() => setG(JSON.parse(JSON.stringify(DEFAULT_GOALS)))}>Restablecer valores por defecto</Button>
        <Button onClick={onClose}>Cerrar</Button>
        <Button primary onClick={save} disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar ajustes'}
        </Button>
      </div>
    </Dialog>
  )
}

/* =====================================================================
 * Historial + exportación CSV
 * ===================================================================== */

type RangeRow = Awaited<ReturnType<typeof fetchRange>>[number]

export function HistoryDialog({
  settings,
  onOpen,
  onClose,
}: {
  settings: Settings
  onOpen: (date: string, shift: ShiftId) => void
  onClose: () => void
}) {
  const [to, setTo] = useState(todaySV())
  const [from, setFrom] = useState(addDays(todaySV(), -30))
  const [rows, setRows] = useState<RangeRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setRows(null)
    fetchRange(from, to, settings.goals)
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
  }, [from, to, settings.goals])

  const pc = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${fmt(x)}%`)

  function exportCsv() {
    if (!rows?.length) return
    const head = [
      'Fecha', 'Semana', 'Turno', 'Gerente de CD', '% indicadores en meta', 'Housekeeping %', 'Nivel housekeeping',
      'Fecha del fill rate', 'Líneas solicitadas', 'Líneas despachadas', 'FR sucursales %', 'Causa faltante',
      'Días sin LTI', 'Incidentes', 'Casi accidentes', 'Actos inseguros', '5S %', 'Pre-op hechos', 'Montacargas en uso',
    ]
    PROCESSES.forEach((p) =>
      head.push(
        `${p.nombre} ${p.containers ? 'contenedores plan' : 'vol. plan'}`,
        `${p.nombre} ${p.containers ? 'contenedores reales' : 'vol. real'}`,
        `${p.nombre} ${p.containers ? 'pallets aprox. reales' : p.perPersonHour ? 'productividad (u/persona/h)' : 'horas-hombre'}`,
        `${p.nombre} dotación plan`,
        `${p.nombre} presentes`, `${p.nombre} ${p.transport ? 'camiones plan' : 'montacargas plan'}`,
        `${p.nombre} ${p.transport ? 'camiones disp.' : 'montacargas op.'}`, `${p.nombre} ${p.err}`,
      ),
    )
    head.push('Inbound ISQ (incidencias de Storage)', 'Inbound revisadores presentes', 'Inbound aux. descarga presentes', 'Storage pendiente arrastrado')
    head.push('Compromiso 1', 'Compromiso 2', 'Compromiso 3', 'Observaciones housekeeping')
    const q = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v)
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = rows.map((x) => {
      const b = computeBoard(x, settings, x.date)
      const row: unknown[] = [
        x.date, isoWeek(x.date), x.shiftId, x.shift?.shift_lead, b.summary.inGoal,
        b.hk.pct === null ? null : Math.round(b.hk.pct * 10) / 10, b.hk.pct === null ? null : b.hk.lvl,
        b.fr.date, b.fr.row?.lines_requested, b.fr.row?.lines_dispatched, b.fr.pct === null ? null : Math.round(b.fr.pct * 10) / 10,
        b.fr.row?.shortage_cause, b.safety.lti, b.safety.incidents, b.safety.nearMisses, b.safety.unsafeActs,
        x.shift?.audit_5s, x.shift?.preop_done, x.shift?.preop_in_use,
      ]
      b.rows.forEach((r) => {
        const d = r.data
        row.push(
          r.def.containers ? d?.vol_plan : r.volPlan, r.def.containers ? d?.vol_real : r.volReal,
          r.inbound ? r.inbound.palletsReal : r.def.perPersonHour ? (r.prod === null ? null : Math.round(r.prod * 10) / 10) : d?.hh_direct,
          r.staffPlan, r.staffPresent, d?.equip_plan, d?.equip_available, r.errors,
        )
      })
      const inb = b.rows.find((r) => r.def.containers)
      const sto = b.rows.find((r) => r.def.autoStorage)
      row.push(x.isq, inb?.staff?.revPresent, inb?.staff?.auxPresent, sto?.storage?.carry)
      ;(x.shift?.commitments ?? []).forEach((c) => row.push([c.problem, c.owner, c.due].filter(Boolean).join(' | ')))
      if (!x.shift) row.push('', '', '')
      row.push(x.shift?.housekeeping.obs)
      return row.map(q).join(';')
    })
    const csv = '﻿' + [head.map(q).join(';'), ...lines].join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `dialogo-tactico_${from}_${to}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <Dialog title="Historial de turnos" subtitle="Toca una fila para abrir ese turno en el tablero." onClose={onClose} wide>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          {(
            [
              ['Desde', from, setFrom],
              ['Hasta', to, setTo],
            ] as const
          ).map(([l, v, set]) => (
            <label key={l} className="flex flex-col gap-1">
              <span className="text-[11px] tracking-wider text-white/45 uppercase">{l}</span>
              <input
                type="date"
                value={v}
                onChange={(e) => e.target.value && set(e.target.value)}
                className={`${fieldClass} [color-scheme:dark]`}
                style={ringStyle(MIND)}
              />
            </label>
          ))}
          <Button primary onClick={exportCsv} disabled={!rows?.length} className="ml-auto">
            Exportar a Excel (CSV)
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm tabular-nums">
            <thead>
              <tr>
                {['Fecha', 'Sem.', 'Turno', 'Gerente de CD', 'En meta', 'Housekeeping', 'FR sucursales', 'Incidentes', 'Días sin LTI'].map((h) => (
                  <th key={h} className="p-1.5 text-left text-[11px] font-medium tracking-wider text-white/45 uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {err ? (
                <tr><td colSpan={9} className="p-2 text-rose-300">{err}</td></tr>
              ) : rows === null ? (
                <tr><td colSpan={9} className="p-2 text-white/45">Cargando…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="p-2 text-white/45">No hay turnos con datos en este rango.</td></tr>
              ) : (
                rows.map((x) => {
                  const b = computeBoard(x, settings, x.date)
                  return (
                    <tr
                      key={x.date + x.shiftId}
                      onClick={() => {
                        onOpen(x.date, x.shiftId)
                        onClose()
                      }}
                      className="cursor-pointer border-t border-neurale-border text-white/80 hover:bg-white/5"
                    >
                      <td className="p-1.5">{x.date}</td>
                      <td className="p-1.5">S{isoWeek(x.date)}</td>
                      <td className="p-1.5" title={shiftHours(settings.goals.shifts, x.shiftId)}>{x.shiftId}</td>
                      <td className="p-1.5">{x.shift?.shift_lead || '—'}</td>
                      <td className="p-1.5">{pc(b.summary.inGoal)}</td>
                      <td className="p-1.5">{b.hk.pct === null ? '—' : `${pc(b.hk.pct)} · ${b.hk.lvl}`}</td>
                      <td className="p-1.5">{pc(b.fr.pct)}</td>
                      <td className="p-1.5">{b.safety.incidents}</td>
                      <td className="p-1.5">{fmt(b.safety.lti)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Dialog>
  )
}
