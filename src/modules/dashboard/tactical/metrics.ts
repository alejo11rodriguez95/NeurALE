import type { TacticalData, Settings } from './api'
import { HK, PROCESSES, QUALITY_METRICS, daysBetween, goalFor, type HkValue } from './config'

/**
 * Semáforos y resumen del Diálogo Táctico — misma lógica que el HTML original:
 * verde ≥ 100% de la meta, amarillo 90–99%, rojo < 90%. En calidad, verde =
 * dentro del máximo permitido (amarillo hasta +2).
 */

export type Status = 'ok' | 'lv2' | 'warn' | 'bad' | 'na'

export const STATUS_COLOR: Record<Status, string> = {
  ok: '#4ade80',
  lv2: '#a3e635',
  warn: '#facc15',
  bad: '#f87171',
  na: 'rgba(255,255,255,0.35)',
}

export const isNum = (x: unknown): x is number =>
  x !== null && x !== undefined && x !== '' && !Number.isNaN(Number(x))

const nf = new Intl.NumberFormat('es-SV', { maximumFractionDigits: 1 })
export const fmt = (x: unknown) => (isNum(x) ? nf.format(Number(x)) : '—')

export function stRatio(val: number | null | undefined, meta: number | null | undefined): Status {
  if (!isNum(val) || !isNum(meta) || Number(meta) === 0) return 'na'
  const r = Number(val) / Number(meta)
  return r >= 1 ? 'ok' : r >= 0.9 ? 'warn' : 'bad'
}

export function stLimit(val: number | null | undefined, max: number): Status {
  if (!isNum(val)) return 'na'
  return val <= max ? 'ok' : val <= max + 2 ? 'warn' : 'bad'
}

export const pct = (a: number | null | undefined, b: number | null | undefined) =>
  isNum(a) && isNum(b) && Number(b) > 0 ? (Number(a) / Number(b)) * 100 : null

/* ---------- Housekeeping ---------- */

const HKV: Record<'c' | 'p' | 'n', number> = { c: 1, p: 0.5, n: 0 }

export const HK_LEVELS: [number, Status, string][] = [
  [90, 'ok', 'Operación disciplinada'],
  [75, 'lv2', 'Operación estable con oportunidades'],
  [60, 'warn', 'Riesgo operativo'],
  [0, 'bad', 'Operación fuera de estándar'],
]

export function hkScore(r: Record<string, HkValue | undefined>) {
  let w = 0
  let t = 0
  let crit = 0
  let pend = 0
  HK.forEach((z) =>
    z.i.forEach(([id, , p]) => {
      const v = r[id]
      if (p === 3 && (!v || v === 'x')) {
        pend++
        return
      }
      if (!v || v === 'x') return
      w += p
      t += p * HKV[v]
      if (v === 'n' && p === 3) crit++
    }),
  )
  if (!w) return { pct: null, cls: 'na' as Status, lvl: 'Sin evaluar', crit, pend, capped: false }
  const pc = (t / w) * 100
  let L = HK_LEVELS.find((l) => pc >= l[0])!
  const capped = crit > 0 && pc >= 75
  if (capped) L = HK_LEVELS[2] // un crítico en "No cumple" limita a Riesgo operativo
  return { pct: pc, cls: L[1], lvl: L[2], crit, pend, capped }
}

export function zoneScore(z: (typeof HK)[number], r: Record<string, HkValue | undefined>) {
  let w = 0
  let t = 0
  z.i.forEach(([id, , p]) => {
    const v = r[id]
    if (!v || v === 'x') return
    w += p
    t += p * HKV[v]
  })
  return w ? (t / w) * 100 : null
}

/* ---------- Días sin LTI ---------- */

/** Días sin accidentes con tiempo perdido a la fecha indicada (se acumula solo). */
export function ltiDays(settings: Settings | null, asOf: string): number | null {
  if (!settings?.lti_since) return null
  const d = daysBetween(settings.lti_since, asOf)
  return d >= 0 ? d : null
}

/* ---------- Inbound: contenedores → pallets aprox. ---------- */

/**
 * Inbound mide volumen en contenedores. Pallets aprox. = contenedores ×
 * pallets promedio por contenedor (meta global, 45 por defecto).
 * Productividad = pallets aprox. reales ÷ personas presentes.
 * Meta de productividad = pallets aprox. plan ÷ dotación plan (pallets
 * promedio a recibir por persona).
 */
export function inboundCalc(
  contPlan: number | null | undefined,
  contReal: number | null | undefined,
  present: number | null | undefined,
  staffPlan: number | null | undefined,
  palletsPerContainer: number,
) {
  const palletsPlan = isNum(contPlan) ? Number(contPlan) * palletsPerContainer : null
  const palletsReal = isNum(contReal) ? Number(contReal) * palletsPerContainer : null
  const perPerson = palletsReal !== null && isNum(present) && Number(present) > 0 ? palletsReal / Number(present) : null
  const metaPerPerson =
    palletsPlan !== null && isNum(staffPlan) && Number(staffPlan) > 0 ? palletsPlan / Number(staffPlan) : null
  return { palletsPlan, palletsReal, perPerson, metaPerPerson }
}

/* ---------- Tablero completo ---------- */

export function computeBoard(data: TacticalData, settings: Settings, date: string) {
  const goals = settings.goals
  const statuses: Status[] = []

  const rows = PROCESSES.map((p) => {
    const g = goalFor(goals, p.id)
    const d = data.processes[p.id]
    const staffPlan = isNum(d?.staff_plan) ? d!.staff_plan! : g.dot
    const equipPlan = isNum(d?.equip_plan) ? d!.equip_plan! : g.mc
    const k = goals.g.palletsPerContainer
    const inbound = p.containers ? inboundCalc(d?.vol_plan, d?.vol_real, d?.staff_present, staffPlan, k) : null
    const prod = inbound
      ? inbound.perPerson
      : isNum(d?.vol_real) && isNum(d?.hh_direct) && d!.hh_direct! > 0
        ? d!.vol_real! / d!.hh_direct!
        : null
    const metaProd = inbound ? inbound.metaPerPerson : g.metaProd
    const q = p.quality ? data.quality[p.quality] : undefined
    const errors = p.quality ? (q?.value ?? null) : (d?.errors ?? null)
    const s = {
      vol: stRatio(d?.vol_real, d?.vol_plan),
      pallets: inbound ? stRatio(inbound.palletsReal, inbound.palletsPlan) : ('na' as Status),
      prod: stRatio(prod, metaProd),
      dot: stRatio(d?.staff_present, staffPlan),
      mc: stRatio(d?.equip_available, equipPlan),
      err: stLimit(errors, g.metaErr),
    }
    statuses.push(s.vol, s.prod, s.dot, s.mc, s.err)
    return {
      def: p,
      goal: g,
      data: d,
      staffPlan,
      equipPlan,
      prod,
      metaProd,
      inbound,
      errors,
      errorsUpdatedAt: p.quality ? q?.updated_at : d?.updated_at,
      /** Módulo que llena el indicador de calidad cuando no es el dueño de la fila. */
      errSource: p.quality
        ? (() => {
            const m = QUALITY_METRICS.find((x) => x.id === p.quality)!.module
            return m.charAt(0).toUpperCase() + m.slice(1)
          })()
        : null,
      palletsPerContainer: k,
      volPct: pct(d?.vol_real, d?.vol_plan),
      s,
    }
  })

  const fr = data.fillRate
  const frPct = pct(fr?.lines_dispatched, fr?.lines_requested)
  const frStatus = stRatio(frPct, goals.g.frSuc)
  statuses.push(frStatus)

  const incidents = data.safety?.incidents ?? 0
  const nearMisses = data.safety?.near_misses ?? 0
  const unsafeActs = data.safety?.unsafe_acts ?? 0
  const incStatus: Status = incidents === 0 ? 'ok' : 'bad'
  statuses.push(incStatus)

  const hk = hkScore(data.shift?.housekeeping.r ?? {})
  statuses.push(hk.cls === 'lv2' ? 'warn' : hk.cls)
  const s5Status = stRatio(data.shift?.audit_5s, goals.g.s5)
  const preopPct = pct(data.shift?.preop_done, data.shift?.preop_in_use)
  const preopStatus = stRatio(preopPct, goals.g.preop)
  statuses.push(s5Status, preopStatus)

  const n = { ok: 0, warn: 0, bad: 0, na: 0 }
  statuses.forEach((x) => {
    if (x === 'ok') n.ok++
    else if (x === 'warn' || x === 'lv2') n.warn++
    else if (x === 'bad') n.bad++
    else n.na++
  })
  const measured = n.ok + n.warn + n.bad

  return {
    rows,
    fr: { row: fr, pct: frPct, status: frStatus, goal: goals.g.frSuc },
    safety: {
      incidents,
      nearMisses,
      unsafeActs,
      incStatus,
      lti: ltiDays(settings, date),
      record: settings.lti_record,
    },
    hk,
    s5: { value: data.shift?.audit_5s ?? null, status: s5Status },
    preop: { pct: preopPct, status: preopStatus },
    summary: { ...n, measured, inGoal: measured ? Math.round((n.ok / measured) * 100) : null },
  }
}

export type Board = ReturnType<typeof computeBoard>
