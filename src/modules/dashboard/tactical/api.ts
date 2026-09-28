import type { ModuleId } from '@/shared/modules'
import { supabase } from '@/lib/supabase'
import { ISQ_TABLES, countIsqByShift, countIsqInShift } from '@/modules/storage/isq/lib/isq'

import {
  normalizeGoals,
  PROCESS_LEAD_POSITIONS,
  type Goals,
  type HkValue,
  type ProcessId,
  type QualityMetric,
  type ShiftId,
} from './config'

/**
 * Acceso a datos del Diálogo Táctico (tablas `dashboard_tactical_*`, ver
 * supabase/migrations/20260926120000_dashboard_tactical_dialogue.sql).
 *
 * El Dashboard Neuronal es dueño de estas tablas. Inbound, Storage, Picking y
 * Outbound importan este archivo desde su opción "Diálogo Táctico" para llenar
 * su parte (import cross-módulo intencional, mismo precedente que Picking →
 * Outbound con Control de Calidad). Quién puede escribir qué lo decide RLS.
 */

export const T = {
  process: 'dashboard_tactical_process',
  fillRate: 'dashboard_tactical_fill_rate',
  safety: 'dashboard_tactical_safety',
  shift: 'dashboard_tactical_shift',
  settings: 'dashboard_tactical_settings',
  quality: 'dashboard_tactical_quality',
} as const

export interface ProcessRow {
  shift_date: string
  shift: ShiftId
  process_id: ProcessId
  vol_plan: number | null
  vol_real: number | null
  hh_direct: number | null
  staff_plan: number | null
  staff_present: number | null
  equip_plan: number | null
  equip_available: number | null
  errors: number | null
  updated_at?: string
}

export interface FillRateRow {
  shift_date: string
  shift: ShiftId
  lines_requested: number | null
  lines_dispatched: number | null
  shortage_cause: string | null
  updated_at?: string
}

export interface QualityRow {
  shift_date: string
  shift: ShiftId
  metric: QualityMetric
  value: number | null
  updated_at?: string
}

export interface SafetyRow {
  shift_date: string
  shift: ShiftId
  incidents: number
  near_misses: number
  unsafe_acts: number
  updated_at?: string
}

export interface Commitment {
  problem: string
  owner: string
  due: string
}

export interface ShiftRow {
  shift_date: string
  shift: ShiftId
  shift_lead: string | null
  commitments: Commitment[]
  housekeeping: { r: Record<string, HkValue | undefined>; obs: string }
  audit_5s: number | null
  preop_done: number | null
  preop_in_use: number | null
  updated_at?: string
}

export interface Settings {
  goals: Goals
  lti_since: string | null
  lti_record: number | null
}

export interface TacticalData {
  processes: Partial<Record<ProcessId, ProcessRow>>
  fillRate: FillRateRow | null
  safety: SafetyRow | null
  shift: ShiftRow | null
  quality: Partial<Record<QualityMetric, QualityRow>>
  /**
   * Incidencias ISQ (Storage → Inbound) reportadas en el turno. Sale sola de
   * `storage_isq_incidents` (tabla de Storage). `null` si no se pudo leer
   * (p. ej. la migración de Storage aún no está corrida) — el tablero sigue.
   */
  isq: number | null
}

export const EMPTY_COMMITMENTS: Commitment[] = [
  { problem: '', owner: '', due: '' },
  { problem: '', owner: '', due: '' },
  { problem: '', owner: '', due: '' },
]

function normalizeShift(row: Record<string, unknown> | null): ShiftRow | null {
  if (!row) return null
  const r = row as unknown as ShiftRow
  const c = Array.isArray(r.commitments) ? r.commitments : []
  return {
    ...r,
    commitments: EMPTY_COMMITMENTS.map((e, i) => ({ ...e, ...c[i] })),
    housekeeping: {
      r: (r.housekeeping?.r ?? {}) as ShiftRow['housekeeping']['r'],
      obs: r.housekeeping?.obs ?? '',
    },
  }
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

/* ---------- Lectura ---------- */

export async function fetchSettings(): Promise<Settings> {
  const { data, error } = await supabase
    .from(T.settings)
    .select('goals, lti_since, lti_record')
    .eq('id', 1)
    .maybeSingle()
  fail(error)
  return {
    goals: normalizeGoals(data?.goals),
    lti_since: data?.lti_since ?? null,
    lti_record: data?.lti_record ?? null,
  }
}

export async function fetchShiftData(date: string, shift: ShiftId): Promise<TacticalData> {
  const [p, f, s, sh, q, isq] = await Promise.all([
    supabase.from(T.process).select('*').eq('shift_date', date).eq('shift', shift),
    supabase.from(T.fillRate).select('*').eq('shift_date', date).eq('shift', shift).maybeSingle(),
    supabase.from(T.safety).select('*').eq('shift_date', date).eq('shift', shift).maybeSingle(),
    supabase.from(T.shift).select('*').eq('shift_date', date).eq('shift', shift).maybeSingle(),
    supabase.from(T.quality).select('*').eq('shift_date', date).eq('shift', shift),
    countIsqInShift(date, shift).catch(() => null),
  ])
  fail(p.error)
  fail(q.error)
  fail(f.error)
  fail(s.error)
  fail(sh.error)
  const processes: TacticalData['processes'] = {}
  for (const row of (p.data ?? []) as ProcessRow[]) processes[row.process_id] = row
  const quality: TacticalData['quality'] = {}
  for (const row of (q.data ?? []) as QualityRow[]) quality[row.metric] = row
  return {
    processes,
    quality,
    isq,
    fillRate: (f.data as FillRateRow | null) ?? null,
    safety: (s.data as SafetyRow | null) ?? null,
    shift: normalizeShift(sh.data),
  }
}

/** Todos los turnos con algún dato entre dos fechas (para Historial / CSV). */
export async function fetchRange(from: string, to: string) {
  const q = <R,>(table: string) =>
    supabase
      .from(table)
      .select('*')
      .gte('shift_date', from)
      .lte('shift_date', to)
      .then(({ data, error }) => {
        fail(error)
        return (data ?? []) as R[]
      })
  const [processes, fillRates, safety, shifts, quality, isq] = await Promise.all([
    q<ProcessRow>(T.process),
    q<FillRateRow>(T.fillRate),
    q<SafetyRow>(T.safety),
    q<Record<string, unknown>>(T.shift),
    q<QualityRow>(T.quality),
    countIsqByShift(from, to).catch(() => null),
  ])
  const map = new Map<string, TacticalData & { date: string; shiftId: ShiftId }>()
  const get = (date: string, shift: ShiftId) => {
    const k = `${date}|${shift}`
    if (!map.has(k))
      map.set(k, {
        date,
        shiftId: shift,
        processes: {},
        fillRate: null,
        safety: null,
        shift: null,
        quality: {},
        isq: isq ? (isq.get(k) ?? 0) : null,
      })
    return map.get(k)!
  }
  processes.forEach((r) => (get(r.shift_date, r.shift).processes[r.process_id] = r))
  fillRates.forEach((r) => (get(r.shift_date, r.shift).fillRate = r))
  safety.forEach((r) => (get(r.shift_date, r.shift).safety = r))
  quality.forEach((r) => (get(r.shift_date, r.shift).quality[r.metric] = r))
  shifts.forEach((r) => {
    const n = normalizeShift(r)!
    get(n.shift_date, n.shift).shift = n
  })
  isq?.forEach((_, k) => {
    const [d, s] = k.split('|') as [string, ShiftId]
    get(d, s)
  })
  return [...map.values()].sort((a, b) =>
    (b.date + b.shiftId).localeCompare(a.date + a.shiftId),
  )
}

/* ---------- Escritura (upsert por fecha + turno) ---------- */

type Key = { shift_date: string; shift: ShiftId }

export async function saveProcess(
  key: Key & { process_id: ProcessId },
  values: Partial<Omit<ProcessRow, 'shift_date' | 'shift' | 'process_id'>>,
) {
  const { error } = await supabase
    .from(T.process)
    .upsert({ ...key, ...values }, { onConflict: 'shift_date,shift,process_id' })
  fail(error)
}

export async function saveFillRate(
  key: Key,
  values: Partial<Omit<FillRateRow, 'shift_date' | 'shift'>>,
) {
  const { error } = await supabase
    .from(T.fillRate)
    .upsert({ ...key, ...values }, { onConflict: 'shift_date,shift' })
  fail(error)
}

export async function saveQuality(key: Key, metric: QualityMetric, value: number | null) {
  const { error } = await supabase
    .from(T.quality)
    .upsert({ ...key, metric, value }, { onConflict: 'shift_date,shift,metric' })
  fail(error)
}

/** Nombre de un empleado del catálogo por id. */
export async function fetchEmployeeName(employeeId: string): Promise<string | null> {
  const { data } = await supabase.from('admin_employees').select('full_name').eq('id', employeeId).maybeSingle()
  return (data?.full_name as string | undefined) ?? null
}

export interface AreaLead {
  module: string
  name: string
}

/**
 * Jefes de turno del tablero — un empleado ACTIVO por el puesto que le
 * corresponde a cada módulo en `PROCESS_LEAD_POSITIONS` (catálogo de
 * Empleados/Puestos, no depende de que tenga cuenta de acceso en Usuarios y
 * Roles). Si dos empleados comparten el mismo puesto (ej. turno A y B), se
 * muestran ambos nombres — igual que antes. Inventory queda fuera porque no
 * tiene puesto de jefe de turno mapeado.
 */
export async function fetchProcessLeads(): Promise<AreaLead[]> {
  const entries = Object.entries(PROCESS_LEAD_POSITIONS) as [ModuleId, string][]
  if (!entries.length) return []

  const { data: positions, error } = await supabase
    .from('admin_positions')
    .select('id, name')
    .in('name', entries.map(([, positionName]) => positionName))
  fail(error)

  const moduleByPositionId = new Map<string, ModuleId>()
  for (const [module, positionName] of entries) {
    const match = ((positions ?? []) as { id: string; name: string }[]).find((p) => p.name === positionName)
    if (match) moduleByPositionId.set(match.id, module)
  }
  const positionIds = [...moduleByPositionId.keys()]
  if (!positionIds.length) return []

  const { data: emps, error: e2 } = await supabase
    .from('admin_employees')
    .select('full_name, position_id')
    .in('position_id', positionIds)
    .eq('active', true)
    .order('full_name', { ascending: true })
  fail(e2)

  return ((emps ?? []) as { full_name: string; position_id: string }[])
    .map((e) => ({ module: moduleByPositionId.get(e.position_id)!, name: e.full_name }))
    .filter((r) => r.module)
}

/**
 * Gerente de CD: el empleado activo con puesto "Gerente CD…" en el catálogo
 * (admin_positions/admin_employees). Si no hay, el usuario activo con nivel
 * `gerencia`. Así el nombre no depende de quién tenga la sesión abierta.
 */
export async function fetchCdManager(): Promise<string | null> {
  const { data: pos } = await supabase.from('admin_positions').select('id').ilike('name', 'Gerente CD%')
  const posIds = ((pos ?? []) as { id: string }[]).map((p) => p.id)
  if (posIds.length) {
    const { data: emps } = await supabase
      .from('admin_employees')
      .select('full_name')
      .in('position_id', posIds)
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(1)
    const name = (emps?.[0] as { full_name?: string } | undefined)?.full_name
    if (name) return name
  }
  const { data: users } = await supabase
    .from('admin_users')
    .select('employee_id')
    .eq('access_level', 'gerencia')
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
  const empId = (users?.[0] as { employee_id?: string } | undefined)?.employee_id
  return empId ? fetchEmployeeName(empId) : null
}

export async function saveSafety(key: Key, values: Partial<Omit<SafetyRow, 'shift_date' | 'shift'>>) {
  const { error } = await supabase
    .from(T.safety)
    .upsert({ ...key, ...values }, { onConflict: 'shift_date,shift' })
  fail(error)
}

export async function saveShift(key: Key, values: Partial<Omit<ShiftRow, 'shift_date' | 'shift'>>) {
  const { error } = await supabase
    .from(T.shift)
    .upsert({ ...key, ...values }, { onConflict: 'shift_date,shift' })
  fail(error)
}

export async function saveSettings(values: Partial<Settings>) {
  const { data, error } = await supabase.from(T.settings).update(values).eq('id', 1).select('id')
  fail(error)
  if (!data?.length) throw new Error('Solo gerencia o admin pueden cambiar esta configuración.')
}

/* ---------- Tiempo real ---------- */

/** Se suscribe a cambios en las tablas del diálogo (+ ISQ de Storage); devuelve la función para desuscribirse. */
export function subscribeTactical(onChange: () => void): () => void {
  const channel = supabase.channel(`tactical-${Math.random().toString(36).slice(2)}`)
  ;[...Object.values(T), ISQ_TABLES.incidents].forEach((table) => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
  })
  channel.subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
