import { useEffect, useState } from 'react'

import { fetchRange, type Settings, type ShiftRow } from './api'
import {
  DEFAULT_GOALS,
  HK,
  PROCESSES,
  SHIFTS,
  addDays,
  isoWeek,
  todaySV,
  type Goals,
  type HkValue,
  type ShiftId,
} from './config'
import { HK_LEVELS, STATUS_COLOR, computeBoard, fmt, hkScore, zoneScore } from './metrics'
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
    ['x', 'N/A', 'rgba(255,255,255,0.5)'],
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
          {HK_LEVELS.map((l, i) => `${l[2]} ${['90–100%', '75–89%', '60–74%', '<60%'][i]}`).join(' · ')}
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
                      style={w === 3 ? { color: STATUS_COLOR.bad, borderColor: STATUS_COLOR.bad } : { color: 'rgba(255,255,255,0.45)', borderColor: 'rgba(255,255,255,0.15)' }}
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
                          style={on ? { background: c, color: '#05070d' } : { color: 'rgba(255,255,255,0.6)' }}
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
 * Metas y dotación
 * ===================================================================== */

export function GoalsDialog({
  goals,
  onSave,
  onClose,
}: {
  goals: Goals
  onSave: (g: Goals) => Promise<void>
  onClose: () => void
}) {
  const [g, setG] = useState<Goals>(() => JSON.parse(JSON.stringify(goals)))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? 0 : Number(s))

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      await onSave(g)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const cols: [keyof Goals['procesos'][number], string][] = [
    ['unidad', 'Unidad'],
    ['metaProd', 'Meta prod. (u/HH)'],
    ['metaErr', 'Máx. errores'],
    ['dot', 'Dotación base'],
    ['mc', 'Montacargas / camiones base'],
  ]

  return (
    <Dialog title="Metas y dotación · CD Nneo" subtitle="Aplican a todos los turnos. Solo gerencia y admin pueden cambiarlas." onClose={onClose} wide>
      <div className="overflow-x-auto p-5">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr>
              <th className="p-1.5 text-left text-[11px] font-medium tracking-wider text-white/45 uppercase">Proceso</th>
              {cols.map(([, l]) => (
                <th key={l} className="p-1.5 text-left text-[11px] font-medium tracking-wider text-white/45 uppercase">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {g.procesos.map((p, i) => (
              <tr key={p.id} className="border-t border-neurale-border">
                <td className="p-1.5 text-white/80">{PROCESSES.find((x) => x.id === p.id)?.nombre}</td>
                {cols.map(([k]) => (
                  <td key={k} className="p-1.5">
                    <input
                      value={String(p[k])}
                      inputMode={k === 'unidad' ? 'text' : 'decimal'}
                      onChange={(e) => {
                        const next = { ...g, procesos: [...g.procesos] }
                        next.procesos[i] = { ...p, [k]: k === 'unidad' ? e.target.value : num(e.target.value) }
                        setG(next)
                      }}
                      className={`${fieldClass} tabular-nums`}
                      style={ringStyle(MIND)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex flex-wrap gap-4">
          {(
            [
              ['frSuc', 'Meta fill rate sucursales %'],
              ['s5', 'Meta 5S %'],
              ['preop', 'Meta pre-operacional %'],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="text-[11px] tracking-wider text-white/45 uppercase">{l}</span>
              <input
                value={String(g.g[k])}
                inputMode="decimal"
                onChange={(e) => setG({ ...g, g: { ...g.g, [k]: num(e.target.value) } })}
                className={`${fieldClass} w-32 tabular-nums`}
                style={ringStyle(MIND)}
              />
            </label>
          ))}
        </div>
        {err ? <p className="mt-3 text-sm text-rose-300">{err}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button onClick={() => setG(JSON.parse(JSON.stringify(DEFAULT_GOALS)))}>Restablecer</Button>
          <Button onClick={onClose}>Cerrar</Button>
          <Button primary onClick={save} disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar metas'}
          </Button>
        </div>
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
    fetchRange(from, to)
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
  }, [from, to])

  const pc = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${fmt(x)}%`)

  function exportCsv() {
    if (!rows?.length) return
    const head = [
      'Fecha', 'Semana', 'Turno', 'Jefe de turno', '% indicadores en meta', 'Housekeeping %', 'Nivel housekeeping',
      'Líneas solicitadas', 'Líneas despachadas', 'FR sucursales %', 'Causa faltante',
      'Días sin LTI', 'Incidentes', 'Casi accidentes', 'Actos inseguros', '5S %', 'Pre-op hechos', 'Montacargas en uso',
    ]
    PROCESSES.forEach((p) =>
      head.push(
        `${p.nombre} vol. plan`, `${p.nombre} vol. real`, `${p.nombre} horas-hombre`, `${p.nombre} dotación plan`,
        `${p.nombre} presentes`, `${p.nombre} ${p.transport ? 'camiones plan' : 'montacargas plan'}`,
        `${p.nombre} ${p.transport ? 'camiones disp.' : 'montacargas op.'}`, `${p.nombre} errores`,
      ),
    )
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
        x.fillRate?.lines_requested, x.fillRate?.lines_dispatched, b.fr.pct === null ? null : Math.round(b.fr.pct * 10) / 10,
        x.fillRate?.shortage_cause, b.safety.lti, b.safety.incidents, b.safety.nearMisses, b.safety.unsafeActs,
        x.shift?.audit_5s, x.shift?.preop_done, x.shift?.preop_in_use,
      ]
      PROCESSES.forEach((p) => {
        const d = x.processes[p.id]
        row.push(d?.vol_plan, d?.vol_real, d?.hh_direct, d?.staff_plan, d?.staff_present, d?.equip_plan, d?.equip_available, d?.errors)
      })
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
                {['Fecha', 'Sem.', 'Turno', 'Jefe de turno', 'En meta', 'Housekeeping', 'FR sucursales', 'Incidentes', 'Días sin LTI'].map((h) => (
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
                      <td className="p-1.5" title={SHIFTS.find((s) => s.id === x.shiftId)?.hours}>{x.shiftId}</td>
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
