import { supabase } from '@/lib/supabase'

/**
 * Inbound-Storage Quality (ISQ) — incidencias que Storage reporta a Inbound
 * (tablas `storage_isq_*`, ver supabase/migrations/20260927180000_storage_isq.sql).
 *
 * Storage es el dueño de estas tablas. La reutilizan (import cross-módulo
 * intencional, mismo precedente que Outbound → Picking con Control de Calidad):
 *   - Inbound → "ISQ" (seguimiento: responsable, estado, causa raíz, acción)
 *   - Dashboard Neuronal → tarjeta "ISQ · Inbound-Storage" (reusa Dash Storage)
 *   - Diálogo Táctico → cuadro "ISQ" en Calidad de la fila Inbound (conteo por turno)
 * Quién puede leer/escribir qué lo decide RLS (real por rol desde el inicio).
 */

export const ISQ_TABLES = {
  incidents: 'storage_isq_incidents',
  types: 'storage_isq_types',
  fields: 'storage_isq_fields',
  settings: 'storage_isq_settings',
} as const

export const ISQ_NAME = 'Inbound-Storage Quality (ISQ)'

/* ---------- Tipos ---------- */

export interface IsqType {
  id: string
  label: string
  sort_order: number
  active: boolean
}

export type IsqFieldType = 'text' | 'number' | 'date' | 'select'

export const ISQ_FIELD_TYPE_LABELS: Record<IsqFieldType, string> = {
  text: 'Texto',
  number: 'Número',
  date: 'Fecha',
  select: 'Lista de opciones',
}

export interface IsqField {
  id: string
  label: string
  field_type: IsqFieldType
  options: string[]
  required: boolean
  sort_order: number
  active: boolean
}

export interface IsqSettings {
  reporter_positions: string[]
}

export interface IsqExtraValue {
  field_id: string
  label: string
  value: string
}

export type IsqStatus = 'abierta' | 'en_seguimiento' | 'corregida' | 'no_procede'

export const ISQ_STATUSES: IsqStatus[] = ['abierta', 'en_seguimiento', 'corregida', 'no_procede']

export const ISQ_STATUS_LABELS: Record<IsqStatus, string> = {
  abierta: 'Abierta',
  en_seguimiento: 'En seguimiento',
  corregida: 'Corregida',
  no_procede: 'No procede',
}

export const ISQ_STATUS_COLORS: Record<IsqStatus, string> = {
  abierta: '#f87171',
  en_seguimiento: '#facc15',
  corregida: '#4ade80',
  no_procede: '#94a3b8',
}

export const isClosed = (s: IsqStatus) => s === 'corregida' || s === 'no_procede'

export type IsqRootCause = 'recepcion' | 'proveedor' | 'transporte' | 'almacenaje' | 'otra'

export const ISQ_ROOT_CAUSES: IsqRootCause[] = ['recepcion', 'proveedor', 'transporte', 'almacenaje', 'otra']

export const ISQ_ROOT_CAUSE_LABELS: Record<IsqRootCause, string> = {
  recepcion: 'Recepción (Inbound)',
  proveedor: 'Proveedor',
  transporte: 'Transporte',
  almacenaje: 'Almacenaje (Storage)',
  otra: 'Otra',
}

/** Horas abiertas a partir de las cuales el seguimiento se marca en alerta. */
export const ISQ_AGING_ALERT_HOURS = 48

export interface IsqIncident {
  id: string
  created_at: string
  created_by: string | null
  updated_at: string
  reported_at: string
  report_date: string
  sku: string
  reference: string
  stower_employee_id: string | null
  stower_name: string
  type_id: string | null
  type_label: string
  extra: IsqExtraValue[]
  status: IsqStatus
  responsible_employee_id: string | null
  responsible_name: string | null
  root_cause: IsqRootCause | null
  corrective_action: string | null
  followup_notes: string | null
  closed_at: string | null
}

export interface NewIsqIncident {
  sku: string
  reference: string
  stower_employee_id: string | null
  stower_name: string
  type_id: string
  type_label: string
  extra: IsqExtraValue[]
}

export type IsqFollowUpPatch = Partial<
  Pick<
    IsqIncident,
    'status' | 'responsible_employee_id' | 'responsible_name' | 'root_cause' | 'corrective_action' | 'followup_notes'
  >
>

export interface EmployeeOption {
  id: string
  full_name: string
  employee_code: string
  position: string | null
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

/* ---------- Fechas y turnos (hora de El Salvador, UTC-6 fijo, sin horario de verano) ---------- */

const TZ = 'America/El_Salvador'
const SV_OFFSET = '-06:00'

/** Fecha de hoy (YYYY-MM-DD) en hora de El Salvador. */
export function todaySV(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function addDaysISO(date: string, n: number): string {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)))
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Hora (0–23) de un instante en hora de El Salvador. */
export function hourSV(iso: string): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date(iso)))
}

export type IsqShift = 'A' | 'B' | 'fuera'

/** Turno del Diálogo Táctico en que cae un reporte: A 06–14 h, B 14–22 h, fuera de turno 22–06 h. */
export function shiftOf(iso: string): IsqShift {
  const h = hourSV(iso)
  return h >= 6 && h < 14 ? 'A' : h >= 14 && h < 22 ? 'B' : 'fuera'
}

/** Rango [desde, hasta) en ISO de un turno de una fecha. */
export function shiftWindow(date: string, shift: 'A' | 'B'): [string, string] {
  return shift === 'A'
    ? [`${date}T06:00:00${SV_OFFSET}`, `${date}T14:00:00${SV_OFFSET}`]
    : [`${date}T14:00:00${SV_OFFSET}`, `${date}T22:00:00${SV_OFFSET}`]
}

export function formatDateTimeSV(iso: string): string {
  return new Date(iso).toLocaleString('es-SV', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })
}

export function formatTimeSV(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-SV', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
}

export function formatDateLongSV(date: string): string {
  return new Date(`${date}T12:00:00${SV_OFFSET}`).toLocaleDateString('es-SV', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Horas transcurridas desde el reporte hasta el cierre (o hasta ahora si sigue abierta). */
export function ageHours(i: Pick<IsqIncident, 'reported_at' | 'closed_at'>, now = Date.now()): number {
  const end = i.closed_at ? new Date(i.closed_at).getTime() : now
  return Math.max(0, (end - new Date(i.reported_at).getTime()) / 3_600_000)
}

export function formatAge(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 48) return `${Math.round(hours)} h`
  return `${Math.floor(hours / 24)} d ${Math.round(hours % 24)} h`
}

/* ---------- Catálogos ---------- */

export async function fetchIsqTypes(includeInactive = false): Promise<IsqType[]> {
  let q = supabase.from(ISQ_TABLES.types).select('id, label, sort_order, active')
  if (!includeInactive) q = q.eq('active', true)
  const { data, error } = await q.order('sort_order').order('label')
  fail(error)
  return (data ?? []) as IsqType[]
}

export async function createIsqType(label: string, sort_order: number): Promise<void> {
  const { error } = await supabase.from(ISQ_TABLES.types).insert({ label, sort_order })
  if (error?.code === '23505') throw new Error('Ya existe un tipo de incidencia con ese nombre.')
  fail(error)
}

export async function updateIsqType(id: string, patch: Partial<Omit<IsqType, 'id'>>): Promise<void> {
  const { data, error } = await supabase.from(ISQ_TABLES.types).update(patch).eq('id', id).select('id')
  if (error?.code === '23505') throw new Error('Ya existe un tipo de incidencia con ese nombre.')
  fail(error)
  if (!data?.length) throw new Error('No tienes permiso para cambiar este catálogo.')
}

export async function deleteIsqType(id: string): Promise<void> {
  const { data, error } = await supabase.from(ISQ_TABLES.types).delete().eq('id', id).select('id')
  fail(error)
  if (!data?.length) throw new Error('No tienes permiso para eliminar este tipo.')
}

export async function fetchIsqFields(includeInactive = false): Promise<IsqField[]> {
  let q = supabase.from(ISQ_TABLES.fields).select('id, label, field_type, options, required, sort_order, active')
  if (!includeInactive) q = q.eq('active', true)
  const { data, error } = await q.order('sort_order').order('label')
  fail(error)
  return (data ?? []) as IsqField[]
}

export async function createIsqField(input: Omit<IsqField, 'id' | 'active'>): Promise<void> {
  const { error } = await supabase.from(ISQ_TABLES.fields).insert(input)
  fail(error)
}

export async function updateIsqField(id: string, patch: Partial<Omit<IsqField, 'id'>>): Promise<void> {
  const { data, error } = await supabase.from(ISQ_TABLES.fields).update(patch).eq('id', id).select('id')
  fail(error)
  if (!data?.length) throw new Error('No tienes permiso para cambiar este campo.')
}

export async function deleteIsqField(id: string): Promise<void> {
  const { data, error } = await supabase.from(ISQ_TABLES.fields).delete().eq('id', id).select('id')
  fail(error)
  if (!data?.length) throw new Error('No tienes permiso para eliminar este campo.')
}

export async function fetchIsqSettings(): Promise<IsqSettings> {
  const { data, error } = await supabase.from(ISQ_TABLES.settings).select('reporter_positions').eq('id', 1).maybeSingle()
  fail(error)
  return { reporter_positions: (data?.reporter_positions as string[] | undefined) ?? ['Almacenador'] }
}

export async function saveIsqSettings(values: IsqSettings): Promise<void> {
  const { data, error } = await supabase.from(ISQ_TABLES.settings).update(values).eq('id', 1).select('id')
  fail(error)
  if (!data?.length) throw new Error('No tienes permiso para cambiar los ajustes de ISQ.')
}

/** Nombres de todos los puestos activos del catálogo (para elegir quién alimenta "Almacenador"). */
export async function fetchPositionNames(): Promise<string[]> {
  const { data, error } = await supabase.from('admin_positions').select('name').eq('active', true).order('name')
  fail(error)
  return ((data ?? []) as { name: string }[]).map((p) => p.name)
}

/** Empleados activos con alguno de estos puestos (select "Almacenador" / "Responsable"). */
export async function fetchEmployeesForPositions(positions: string[] | null): Promise<EmployeeOption[]> {
  let q = supabase
    .from('admin_employees')
    .select('id, full_name, employee_code, position:admin_positions!inner(name)')
    .eq('active', true)
  if (positions) {
    if (!positions.length) return []
    q = q.in('admin_positions.name', positions)
  }
  const { data, error } = await q.order('full_name')
  fail(error)
  return ((data ?? []) as unknown as { id: string; full_name: string; employee_code: string; position: { name: string } | null }[]).map(
    (e) => ({ id: e.id, full_name: e.full_name, employee_code: e.employee_code, position: e.position?.name ?? null }),
  )
}

/** Todos los empleados activos (con o sin puesto), para el select de responsable en Inbound. */
export async function fetchAllActiveEmployees(): Promise<EmployeeOption[]> {
  const { data, error } = await supabase
    .from('admin_employees')
    .select('id, full_name, employee_code, position:admin_positions(name)')
    .eq('active', true)
    .order('full_name')
  fail(error)
  return ((data ?? []) as unknown as { id: string; full_name: string; employee_code: string; position: { name: string } | null }[]).map(
    (e) => ({ id: e.id, full_name: e.full_name, employee_code: e.employee_code, position: e.position?.name ?? null }),
  )
}

/* ---------- Incidencias ---------- */

export async function createIsqIncident(input: NewIsqIncident): Promise<IsqIncident> {
  const { data, error } = await supabase.from(ISQ_TABLES.incidents).insert(input).select('*').single()
  fail(error)
  return normalize(data)
}

/** Incidencias con fecha de reporte entre dos fechas (YYYY-MM-DD, ambas incluidas). */
export async function fetchIsqIncidents(from: string, to: string): Promise<IsqIncident[]> {
  const { data, error } = await supabase
    .from(ISQ_TABLES.incidents)
    .select('*')
    .gte('report_date', from)
    .lte('report_date', to)
    .order('reported_at', { ascending: false })
  fail(error)
  return (data ?? []).map(normalize)
}

/** Incidencias abiertas o en seguimiento, de cualquier fecha (bandeja de Inbound). */
export async function fetchPendingIsqIncidents(): Promise<IsqIncident[]> {
  const { data, error } = await supabase
    .from(ISQ_TABLES.incidents)
    .select('*')
    .in('status', ['abierta', 'en_seguimiento'])
    .order('reported_at', { ascending: true })
  fail(error)
  return (data ?? []).map(normalize)
}

export async function updateIsqFollowUp(id: string, patch: IsqFollowUpPatch): Promise<IsqIncident> {
  const { data, error } = await supabase.from(ISQ_TABLES.incidents).update(patch).eq('id', id).select('*')
  fail(error)
  if (!data?.length) throw new Error('No tienes permiso para dar seguimiento a esta incidencia.')
  return normalize(data[0])
}

export async function deleteIsqIncident(id: string): Promise<void> {
  const { data, error } = await supabase.from(ISQ_TABLES.incidents).delete().eq('id', id).select('id')
  fail(error)
  if (!data?.length) throw new Error('Solo el jefe de Storage, gerencia o admin pueden eliminar un reporte.')
}

/**
 * Cuántas incidencias ISQ se reportaron dentro de un turno (A 06–14 h, B
 * 14–22 h, hora El Salvador). Lo usa el Diálogo Táctico para el cuadro "ISQ"
 * de la fila Inbound. Cuenta todas, incluidas las que Inbound marque después
 * como "No procede" (el tablero refleja lo que Storage reportó en el turno).
 */
export async function countIsqInShift(date: string, shift: 'A' | 'B'): Promise<number> {
  const [from, to] = shiftWindow(date, shift)
  const { count, error } = await supabase
    .from(ISQ_TABLES.incidents)
    .select('id', { count: 'exact', head: true })
    .gte('reported_at', from)
    .lt('reported_at', to)
  fail(error)
  return count ?? 0
}

/** Conteo ISQ por fecha + turno en un rango (Historial / CSV del Diálogo Táctico). */
export async function countIsqByShift(from: string, to: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from(ISQ_TABLES.incidents)
    .select('reported_at, report_date')
    .gte('report_date', from)
    .lte('report_date', to)
  fail(error)
  const out = new Map<string, number>()
  for (const r of (data ?? []) as { reported_at: string; report_date: string }[]) {
    const s = shiftOf(r.reported_at)
    if (s === 'fuera') continue
    const k = `${r.report_date}|${s}`
    out.set(k, (out.get(k) ?? 0) + 1)
  }
  return out
}

/** Se suscribe a cambios de incidencias ISQ; devuelve la función para desuscribirse. */
export function subscribeIsq(onChange: () => void): () => void {
  const channel = supabase
    .channel(`isq-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: ISQ_TABLES.incidents }, onChange)
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

function normalize(row: unknown): IsqIncident {
  const r = row as IsqIncident
  return { ...r, extra: Array.isArray(r.extra) ? r.extra : [] }
}
