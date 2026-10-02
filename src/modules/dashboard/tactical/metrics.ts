import type { TacticalData, Settings } from './api'
import { HK, PROCESSES, QUALITY_METRICS, addDays, daysBetween, goalFor, type GlobalGoals, type HkValue } from './config'

/**
 * Semáforos y resumen del Diálogo Táctico — misma lógica que el HTML original:
 * verde ≥ 100% de la meta, amarillo 90–99%, rojo < 90%. En calidad, verde =
 * dentro del máximo permitido (amarillo hasta +2).
 */

export type Status = 'ok' | 'lv2' | 'warn' | 'bad' | 'na'

/** Colores de semáforo como variables CSS (el tema claro las oscurece, ver TacticalBoard). */
export const STATUS_COLOR: Record<Status, string> = {
  ok: 'var(--tac-ok, #4ade80)',
  lv2: 'var(--tac-lv2, #a3e635)',
  warn: 'var(--tac-warn, #facc15)',
  bad: 'var(--tac-bad, #f87171)',
  na: 'var(--tac-na, rgba(255,255,255,0.35))',
}

/** Mezcla un color (hex o var CSS) con transparencia. */
export const tint = (c: string, pct: number) => `color-mix(in oklab, ${c} ${pct}%, transparent)`

export const isNum = (x: unknown): x is number =>
  x !== null && x !== undefined && x !== '' && !Number.isNaN(Number(x))

const nf = new Intl.NumberFormat('es-SV', { maximumFractionDigits: 1 })
export const fmt = (x: unknown) => (isNum(x) ? nf.format(Number(x)) : '—')

/**
 * Umbrales del semáforo (v7: editables en Ajustes → Metas). Se aplican una
 * sola vez al cargar los ajustes (`applyThresholds`) para que tablero,
 * capturas y vistas previas usen siempre los mismos.
 */
const TH = { warn: 0.9, margin: 2, hk: [90, 75, 60] as [number, number, number] }

export function applyThresholds(g: Pick<GlobalGoals, 'warnPct' | 'errMargin' | 'hkOk' | 'hkLv2' | 'hkWarn'>) {
  TH.warn = Math.min(1, Math.max(0, (Number(g.warnPct) || 90) / 100))
  TH.margin = Math.max(0, Number(g.errMargin) || 0)
  TH.hk = [Number(g.hkOk) || 90, Number(g.hkLv2) || 75, Number(g.hkWarn) || 60]
}

export const warnRatio = () => TH.warn

export function stRatio(val: number | null | undefined, meta: number | null | undefined): Status {
  if (!isNum(val) || !isNum(meta) || Number(meta) === 0) return 'na'
  const r = Number(val) / Number(meta)
  return r >= 1 ? 'ok' : r >= TH.warn ? 'warn' : 'bad'
}

export function stLimit(val: number | null | undefined, max: number): Status {
  if (!isNum(val)) return 'na'
  return val <= max ? 'ok' : val <= max + TH.margin ? 'warn' : 'bad'
}

export const pct = (a: number | null | undefined, b: number | null | undefined) =>
  isNum(a) && isNum(b) && Number(b) > 0 ? (Number(a) / Number(b)) * 100 : null

/* ---------- Housekeeping ---------- */

const HKV: Record<'c' | 'p' | 'n', number> = { c: 1, p: 0.5, n: 0 }

/** Niveles de Housekeeping (umbrales editables en Ajustes → Metas). */
export function hkLevels(): [number, Status, string][] {
  return [
    [TH.hk[0], 'ok', 'Operación disciplinada'],
    [TH.hk[1], 'lv2', 'Operación estable con oportunidades'],
    [TH.hk[2], 'warn', 'Riesgo operativo'],
    [0, 'bad', 'Operación fuera de estándar'],
  ]
}

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
  const levels = hkLevels()
  let L = levels.find((l) => pc >= l[0])!
  const capped = crit > 0 && pc >= levels[1][0]
  if (capped) L = levels[2] // un crítico en "No cumple" limita a Riesgo operativo
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
 * v7: la productividad se mide solo contra los **Aux. de Descarga**:
 * pallets aprox. reales ÷ Aux. de Descarga presentes. Meta = pallets aprox.
 * plan ÷ Aux. de Descarga plan (pallets promedio a recibir por persona).
 */
export function inboundCalc(
  contPlan: number | null | undefined,
  contReal: number | null | undefined,
  auxPresent: number | null | undefined,
  auxPlan: number | null | undefined,
  palletsPerContainer: number,
) {
  const palletsPlan = isNum(contPlan) ? Number(contPlan) * palletsPerContainer : null
  const palletsReal = isNum(contReal) ? Number(contReal) * palletsPerContainer : null
  const perPerson =
    palletsReal !== null && isNum(auxPresent) && Number(auxPresent) > 0 ? palletsReal / Number(auxPresent) : null
  const metaPerPerson =
    palletsPlan !== null && isNum(auxPlan) && Number(auxPlan) > 0 ? palletsPlan / Number(auxPlan) : null
  return { palletsPlan, palletsReal, perPerson, metaPerPerson }
}

/** Dotación de Inbound por puesto (v7). Si no hay desglose, todo cuenta como Aux. de Descarga. */
export function inboundStaff(
  row: { staff_plan?: number | null; staff_present?: number | null; staff_breakdown?: StaffBreakdown | null } | undefined,
  goal: { dotRev?: number; dotAux?: number },
) {
  const b = row?.staff_breakdown
  const revPlan = isNum(b?.rev?.plan) ? Number(b!.rev!.plan) : (goal.dotRev ?? 0)
  const auxPlan = isNum(b?.aux?.plan) ? Number(b!.aux!.plan) : (goal.dotAux ?? 0)
  const revPresent = isNum(b?.rev?.present) ? Number(b!.rev!.present) : null
  const auxPresent = isNum(b?.aux?.present)
    ? Number(b!.aux!.present)
    : !b && isNum(row?.staff_present)
      ? Number(row!.staff_present)
      : null
  const plan = revPlan + auxPlan
  const present = revPresent === null && auxPresent === null ? null : (revPresent ?? 0) + (auxPresent ?? 0)
  return { revPlan, auxPlan, revPresent, auxPresent, plan, present }
}

export interface StaffBreakdown {
  rev?: { plan?: number | null; present?: number | null }
  aux?: { plan?: number | null; present?: number | null }
}

/* ---------- Storage automático (v7) ---------- */

/** Plan/real de Storage de una casilla (turno o día — ver `slotMode`). */
export interface StorageSlot {
  /** 50% (configurable) de los pallets plan de Inbound de la casilla. */
  inboundPart: number
  /** Pendiente arrastrado de la casilla anterior (plan − real, nunca negativo). */
  carry: number
  plan: number
  /** Pallets del "Registro x Pallet" de la casilla. */
  real: number
  /** Se reinició el pendiente en esta casilla (salieron menos pallets que el promedio). */
  reset: boolean
  /** Pendiente que se descartó al reiniciar (lo que hubiera arrastrado). */
  discarded: number
}

/**
 * Encadena las casillas en orden: plan = % de Inbound + pendiente anterior;
 * pendiente = max(0, plan − real). `slots` debe venir en orden cronológico.
 * Una casilla con `reset` descarta el pendiente anterior y arranca solo con
 * su % de Inbound (Storage → Diálogo Táctico → "Reiniciar pendiente").
 */
export function chainStorage(
  slots: { key: string; inboundPallets: number; real: number; reset?: boolean }[],
  pctOfInbound: number,
): Map<string, StorageSlot> {
  const out = new Map<string, StorageSlot>()
  let carry = 0
  for (const s of slots) {
    const inboundPart = Math.round((s.inboundPallets * pctOfInbound) / 100)
    const reset = !!s.reset
    const discarded = reset ? carry : 0
    if (reset) carry = 0
    const plan = inboundPart + carry
    out.set(s.key, { inboundPart, carry, plan, real: s.real, reset, discarded })
    carry = Math.max(0, plan - s.real)
  }
  return out
}

/** Fecha del fill rate que se muestra en el tablero de una fecha (el día anterior). */
export const fillRateDateFor = (date: string) => addDays(date, -1)

/* ---------- Tablero completo ---------- */

export function computeBoard(data: TacticalData, settings: Settings, date: string) {
  const goals = settings.goals
  applyThresholds(goals.g)
  const statuses: Status[] = []

  const rows = PROCESSES.map((p) => {
    const g = goalFor(goals, p.id)
    const d = data.processes[p.id]
    const staff = p.containers ? inboundStaff(d, g) : null
    const staffPlan = staff ? staff.plan : isNum(d?.staff_plan) ? d!.staff_plan! : g.dot
    const staffPresent = staff ? staff.present : (d?.staff_present ?? null)
    const equipPlan = isNum(d?.equip_plan) ? d!.equip_plan! : g.mc
    const k = goals.g.palletsPerContainer
    const inbound = p.containers ? inboundCalc(d?.vol_plan, d?.vol_real, staff!.auxPresent, staff!.auxPlan, k) : null
    // Storage (v7): volumen automático (Inbound + Registro x Pallet).
    const storage = p.autoStorage ? data.storage : null
    const volPlan = storage ? storage.plan : (d?.vol_plan ?? null)
    const volReal = storage ? storage.real : (d?.vol_real ?? null)
    const prod = inbound
      ? inbound.perPerson
      : p.perPersonHour
        ? isNum(volReal) && isNum(staffPresent) && staffPresent! > 0 && goals.g.pickHours > 0
          ? volReal! / staffPresent! / goals.g.pickHours
          : null
        : isNum(volReal) && isNum(d?.hh_direct) && d!.hh_direct! > 0
          ? volReal! / d!.hh_direct!
          : null
    const metaProd = inbound ? inbound.metaPerPerson : g.metaProd
    const q = p.quality ? data.quality[p.quality] : undefined
    const errors = p.quality ? (q?.value ?? null) : (d?.errors ?? null)
    const isq = p.isq ? data.isq : null
    const s = {
      vol: stRatio(volReal, volPlan),
      pallets: inbound ? stRatio(inbound.palletsReal, inbound.palletsPlan) : ('na' as Status),
      prod: stRatio(prod, metaProd),
      dot: stRatio(staffPresent, staffPlan),
      mc: stRatio(d?.equip_available, equipPlan),
      err: stLimit(errors, g.metaErr),
      isq: p.isq ? stLimit(isq, goals.g.isqMax) : ('na' as Status),
    }
    statuses.push(s.vol, s.prod, s.dot, s.mc, s.err)
    if (p.isq) statuses.push(s.isq)
    return {
      def: p,
      goal: g,
      data: d,
      staffPlan,
      staffPresent,
      /** Inbound: desglose Revisadores / Aux. de Descarga. */
      staff,
      /** Storage: plan automático y pendiente arrastrado. */
      storage,
      volPlan,
      volReal,
      equipPlan,
      prod,
      metaProd,
      inbound,
      errors,
      /** Inbound: incidencias ISQ del turno (automático, desde Storage). */
      isq,
      isqMax: goals.g.isqMax,
      errorsUpdatedAt: p.quality ? q?.updated_at : d?.updated_at,
      /** Módulo que llena el indicador de calidad cuando no es el dueño de la fila. */
      errSource: p.quality
        ? (() => {
            const m = QUALITY_METRICS.find((x) => x.id === p.quality)!.module
            return m.charAt(0).toUpperCase() + m.slice(1)
          })()
        : null,
      palletsPerContainer: k,
      volPct: pct(volReal, volPlan),
      pickHours: goals.g.pickHours,
      s,
    }
  })

  // v7: fill rate por día; el tablero muestra el del día anterior.
  const fr = data.fillRateDaily
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
    fr: { row: fr, pct: frPct, status: frStatus, goal: goals.g.frSuc, date: fillRateDateFor(date) },
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
