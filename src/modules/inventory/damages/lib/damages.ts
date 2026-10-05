import { supabase } from '@/lib/supabase'
import { addDaysISO, todaySV } from '@/modules/storage/isq/lib/isq'

/**
 * Inventory · Control de Averías (ver ARCHITECTURE.md → "Inventory — Control
 * de Averías"). Tablas y funciones en
 * supabase/migrations/20261001120000_inventory_damage_control.sql.
 *
 * Flujo:
 *   1. El colaborador escanea el QR (sin sesión) y reporta la avería →
 *      estado PENDIENTE.
 *   2. Inventory toma las pendientes en un LOTE (EN TRABAJO), marca qué
 *      políticas de manejo no se cumplieron (= mal manejo) y cuáles "No aplica
 *      como avería" (quedan fuera del reporte para el ajuste), y deja su
 *      observación final.
 *   3. Imprime el reporte (anexo del ajuste en el sistema de la empresa) y
 *      confirma: todo el lote queda ACTUALIZADO.
 *   4. Al cierre de la semana o del mes, arma el reporte de MAL MANEJO del
 *      período (lotes confirmados en ese período): observación por área,
 *      un solo correo con CC a los jefes involucrados, y cierra el período
 *      (v3, 2026-10-05 — migración 20261005120000_inventory_damage_v3_periods.sql).
 *
 * Toda escritura pasa por funciones de la base (RPC) que validan permiso y
 * estado; las tablas no tienen insert/update/delete directo.
 */

export const DAMAGE_NAME = 'Control de Averías'
/** Vista `?view=` dentro de Inventory. */
export const DAMAGE_VIEW = 'averias'
/** Ruta pública del formulario que abre el QR (fuera de `RequireAccess`). */
export const DAMAGE_PUBLIC_PATH = '/averias'

export const DAMAGE_TABLES = {
  settings: 'inventory_damage_settings',
  origins: 'inventory_damage_origins',
  policies: 'inventory_damage_policies',
  reports: 'inventory_damage_reports',
  batches: 'inventory_damage_batches',
  findings: 'inventory_damage_findings',
  notices: 'inventory_damage_notices',
  periods: 'inventory_damage_periods',
  periodNotes: 'inventory_damage_period_notes',
} as const

/* ---------- Tipos ---------- */

export type DamageStatus = 'pendiente' | 'en_trabajo' | 'actualizado'

export const DAMAGE_STATUS_LABELS: Record<DamageStatus, string> = {
  pendiente: 'PENDIENTE',
  en_trabajo: 'EN TRABAJO',
  actualizado: 'ACTUALIZADO',
}

export const DAMAGE_STATUS_COLORS: Record<DamageStatus, string> = {
  pendiente: '#fbbf24',
  en_trabajo: '#a78bfa',
  actualizado: '#34d399',
}

/** Texto cuando el colaborador NO marcó "Sí, se descontó" en el formulario. */
export const NOT_DEDUCTED_LABEL = 'No se marcó como descontado'

/** Color de "mal manejo" (no cumplió una política). */
export const MISHANDLING_COLOR = '#f87171'

/** Marcada por Inventory en el lote: no entra al reporte impreso para el ajuste. */
export const NOT_APPLICABLE_LABEL = 'No aplica como avería'
export const NOT_APPLICABLE_COLOR = '#fbbf24'

export interface DamageOrigin {
  id: string
  name: string
  emails: string[]
  sort_order: number
  active: boolean
}

export interface DamagePolicy {
  id: string
  code: string | null
  label: string
  description: string | null
  sort_order: number
  active: boolean
}

export interface DamageReport {
  id: string
  folio: number
  created_at: string
  reporter_employee_id: string
  reporter_code: string
  reporter_name: string
  origin_id: string
  origin_name: string
  sku: string
  /** Breve descripción del producto (v3). Null en reportes anteriores al 2026-10-05. */
  product_description: string | null
  quantity: number
  deducted_from_location: boolean
  observation: string
  status: DamageStatus
  batch_id: string | null
  /** "No aplica como avería" (lo marca Inventory en el lote). */
  not_applicable: boolean
  /** Reporte de mal manejo por período (cerrado) que la incluyó. */
  period_id: string | null
}

/** "484152 · Juego de baño" (o solo el SKU si el reporte es anterior a la descripción). */
export const skuLabel = (r: Pick<DamageReport, 'sku' | 'product_description'>) =>
  r.product_description ? `${r.sku} · ${r.product_description}` : r.sku

export interface DamageBatch {
  id: string
  folio: number
  created_at: string
  worked_by_name: string
  status: 'en_trabajo' | 'actualizado'
  final_note: string | null
  erp_adjustment_ref: string | null
  closed_at: string | null
}

export interface DamageFinding {
  id: string
  batch_id: string
  report_id: string
  policy_id: string
  policy_label: string
}

export interface BatchSummary extends DamageBatch {
  reports: number
  units: number
  mishandled: number
  notApplicable: number
}

export interface BatchDetail {
  batch: DamageBatch
  reports: DamageReport[]
  findings: DamageFinding[]
  policies: DamagePolicy[]
  origins: DamageOrigin[]
}

/* ---------- Utilidades ---------- */

export const reportFolio = (n: number) => `AV-${String(n).padStart(5, '0')}`
export const batchFolio = (n: number) => `LT-${String(n).padStart(4, '0')}`

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  fail(error)
  return data as T
}

const REPORT_COLS =
  'id, folio, created_at, reporter_employee_id, reporter_code, reporter_name, origin_id, origin_name, sku, product_description, quantity, deducted_from_location, observation, status, batch_id, not_applicable, period_id'
const BATCH_COLS =
  'id, folio, created_at, worked_by_name, status, final_note, erp_adjustment_ref, closed_at'

/* ---------- Formulario público (QR, sin sesión) ---------- */

export interface PublicFormInfo {
  ok: boolean
  origins: { id: string; name: string }[]
}

export async function fetchPublicForm(token: string): Promise<PublicFormInfo> {
  const data = await rpc<{ ok: boolean; origins?: { id: string; name: string }[] }>('inventory_damage_public_form', {
    p_token: token,
  })
  return { ok: !!data?.ok, origins: data?.origins ?? [] }
}

export interface PublicEmployee {
  id: string
  full_name: string
  employee_code: string
}

export async function lookupEmployee(token: string, code: string): Promise<PublicEmployee | null> {
  return (await rpc<PublicEmployee | null>('inventory_damage_lookup_employee', { p_token: token, p_code: code })) ?? null
}

export interface NewDamageReport {
  employee_code: string
  origin_id: string
  sku: string
  description: string
  quantity: number
  deducted: boolean
  observation: string
}

/** Devuelve el folio del reporte creado. */
export async function submitDamageReport(token: string, input: NewDamageReport): Promise<number> {
  return rpc<number>('inventory_damage_submit', {
    p_token: token,
    p_employee_code: input.employee_code,
    p_origin_id: input.origin_id,
    p_sku: input.sku,
    p_quantity: input.quantity,
    p_deducted: input.deducted,
    p_observation: input.observation,
    p_description: input.description,
  })
}

/* ---------- Permisos (lo decide la base) ---------- */

export async function fetchCanManage(): Promise<boolean> {
  try {
    return !!(await rpc<boolean>('inventory_can_manage'))
  } catch {
    return false
  }
}

/* ---------- Catálogos ---------- */

export async function fetchOrigins(includeInactive = true): Promise<DamageOrigin[]> {
  let q = supabase.from(DAMAGE_TABLES.origins).select('id, name, emails, sort_order, active')
  if (!includeInactive) q = q.eq('active', true)
  const { data, error } = await q.order('sort_order').order('name')
  fail(error)
  return (data ?? []) as DamageOrigin[]
}

export async function fetchPolicies(includeInactive = true): Promise<DamagePolicy[]> {
  let q = supabase.from(DAMAGE_TABLES.policies).select('id, code, label, description, sort_order, active')
  if (!includeInactive) q = q.eq('active', true)
  const { data, error } = await q.order('sort_order').order('label')
  fail(error)
  return (data ?? []) as DamagePolicy[]
}

export async function saveOrigin(o: { id?: string; name: string; emails: string[]; sort_order: number; active: boolean }): Promise<void> {
  await rpc('inventory_damage_origin_save', {
    p_id: o.id ?? null,
    p_name: o.name,
    p_emails: o.emails,
    p_sort: o.sort_order,
    p_active: o.active,
  })
}

export async function deleteOrigin(id: string): Promise<void> {
  await rpc('inventory_damage_origin_delete', { p_id: id })
}

export async function savePolicy(p: { id?: string; label: string; description: string; sort_order: number; active: boolean }): Promise<void> {
  await rpc('inventory_damage_policy_save', {
    p_id: p.id ?? null,
    p_label: p.label,
    p_description: p.description,
    p_sort: p.sort_order,
    p_active: p.active,
  })
}

export async function deletePolicy(id: string): Promise<void> {
  await rpc('inventory_damage_policy_delete', { p_id: id })
}

/** Token vigente del QR (solo lo ve quien puede gestionar Inventory). */
export async function fetchQrToken(): Promise<string | null> {
  const { data, error } = await supabase.from(DAMAGE_TABLES.settings).select('qr_token').eq('id', 1).maybeSingle()
  fail(error)
  return (data?.qr_token as string | undefined) ?? null
}

/** Destinatario(s) principal(es) del correo de mal manejo del período (campo "Para"). */
export async function fetchMailTo(): Promise<string[]> {
  const { data, error } = await supabase.from(DAMAGE_TABLES.settings).select('mail_to').eq('id', 1).maybeSingle()
  fail(error)
  return (data?.mail_to as string[] | undefined) ?? []
}

export async function saveMailTo(emails: string[]): Promise<void> {
  await rpc('inventory_damage_settings_save', { p_mail_to: emails })
}

export async function regenerateQrToken(): Promise<string> {
  return rpc<string>('inventory_damage_regenerate_qr')
}

/**
 * Dirección pública (producción) a la que apunta el QR. NUNCA la del navegador
 * actual: si el QR se genera desde un deploy de vista previa de Vercel
 * (`neur-ale-xxxx.vercel.app`), Vercel le pide iniciar sesión en Vercel a
 * quien lo escanee (Deployment Protection). Se puede cambiar con la variable
 * de entorno `VITE_PUBLIC_APP_URL` (sin barra final) si el dominio cambia.
 */
export const PUBLIC_APP_URL = ((import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) || 'https://neur-ale.vercel.app').replace(
  /\/+$/,
  '',
)

export function publicFormUrl(token: string): string {
  return `${PUBLIC_APP_URL}${DAMAGE_PUBLIC_PATH}?t=${encodeURIComponent(token)}`
}

/** ¿Esta pantalla se abrió desde otra dirección (p. ej. una vista previa de Vercel)? */
export const isOffProductionHost = () => window.location.origin !== PUBLIC_APP_URL

/* ---------- Reportes ---------- */

export async function fetchPendingReports(): Promise<DamageReport[]> {
  const { data, error } = await supabase
    .from(DAMAGE_TABLES.reports)
    .select(REPORT_COLS)
    .eq('status', 'pendiente')
    .order('created_at', { ascending: true })
    .limit(2000)
  fail(error)
  return (data ?? []) as DamageReport[]
}

/** Reportes en un rango de fechas (hora de El Salvador) — `from`/`to` en YYYY-MM-DD. */
export async function fetchReports(from: string, to: string): Promise<DamageReport[]> {
  const { data, error } = await supabase
    .from(DAMAGE_TABLES.reports)
    .select(REPORT_COLS)
    .gte('created_at', `${from}T00:00:00-06:00`)
    .lte('created_at', `${to}T23:59:59.999-06:00`)
    .order('created_at', { ascending: false })
    .limit(2000)
  fail(error)
  return (data ?? []) as DamageReport[]
}

export async function deleteReport(id: string): Promise<void> {
  await rpc('inventory_damage_report_delete', { p_id: id })
}

/* ---------- Lotes ---------- */

export async function startBatch(reportIds: string[]): Promise<string> {
  return rpc<string>('inventory_damage_batch_start', { p_report_ids: reportIds })
}

export async function fetchBatches(): Promise<BatchSummary[]> {
  const { data, error } = await supabase.from(DAMAGE_TABLES.batches).select(BATCH_COLS).order('created_at', { ascending: false }).limit(200)
  fail(error)
  const batches = (data ?? []) as DamageBatch[]
  if (!batches.length) return []
  const ids = batches.map((b) => b.id)
  const [{ data: reps, error: e1 }, { data: finds, error: e2 }] = await Promise.all([
    supabase.from(DAMAGE_TABLES.reports).select('id, batch_id, quantity, not_applicable').in('batch_id', ids),
    supabase.from(DAMAGE_TABLES.findings).select('batch_id, report_id').in('batch_id', ids),
  ])
  fail(e1)
  fail(e2)
  return batches.map((b) => {
    const r = (reps ?? []).filter((x) => x.batch_id === b.id)
    const mishandled = new Set((finds ?? []).filter((f) => f.batch_id === b.id).map((f) => f.report_id as string))
    return {
      ...b,
      reports: r.length,
      units: r.reduce((s, x) => s + (x.quantity as number), 0),
      mishandled: mishandled.size,
      notApplicable: r.filter((x) => x.not_applicable).length,
    }
  })
}

export async function fetchBatchDetail(batchId: string): Promise<BatchDetail> {
  const [b, r, f, policies, origins] = await Promise.all([
    supabase.from(DAMAGE_TABLES.batches).select(BATCH_COLS).eq('id', batchId).maybeSingle(),
    supabase.from(DAMAGE_TABLES.reports).select(REPORT_COLS).eq('batch_id', batchId).order('origin_name').order('folio'),
    supabase.from(DAMAGE_TABLES.findings).select('id, batch_id, report_id, policy_id, policy_label').eq('batch_id', batchId),
    fetchPolicies(true),
    fetchOrigins(true),
  ])
  fail(b.error)
  fail(r.error)
  fail(f.error)
  if (!b.data) throw new Error('Lote no encontrado (pudo haberse cancelado).')
  return {
    batch: b.data as DamageBatch,
    reports: (r.data ?? []) as DamageReport[],
    findings: (f.data ?? []) as DamageFinding[],
    policies,
    origins,
  }
}

export async function setFinding(reportId: string, policyId: string, failed: boolean): Promise<void> {
  await rpc('inventory_damage_set_finding', { p_report_id: reportId, p_policy_id: policyId, p_failed: failed })
}

/** "No aplica como avería": sale del reporte impreso para el ajuste (sigue contando para mal manejo). */
export async function setNotApplicable(reportId: string, value: boolean): Promise<void> {
  await rpc('inventory_damage_set_not_applicable', { p_report_id: reportId, p_value: value })
}

export async function saveBatch(batchId: string, finalNote: string, erpRef: string): Promise<void> {
  await rpc('inventory_damage_batch_save', { p_batch_id: batchId, p_final_note: finalNote, p_erp_ref: erpRef })
}

export async function closeBatch(batchId: string, finalNote: string, erpRef: string): Promise<void> {
  await rpc('inventory_damage_batch_close', { p_batch_id: batchId, p_final_note: finalNote, p_erp_ref: erpRef })
}

export async function cancelBatch(batchId: string): Promise<void> {
  await rpc('inventory_damage_batch_cancel', { p_batch_id: batchId })
}

/* ---------- Mal manejo por departamento ---------- */

export interface DepartmentMishandling {
  origin_id: string
  origin_name: string
  emails: string[]
  reports: { report: DamageReport; failed: string[] }[]
  /** Observación de seguimiento del área (reporte del período). */
  note: string | null
}

/** Agrupa por departamento de origen las averías con al menos una política incumplida. */
export function mishandlingByDepartment(d: {
  reports: DamageReport[]
  findings: DamageFinding[]
  origins: DamageOrigin[]
  notes?: { origin_id: string; note: string | null }[]
}): DepartmentMishandling[] {
  const failedByReport = new Map<string, string[]>()
  for (const f of d.findings) {
    const list = failedByReport.get(f.report_id) ?? []
    list.push(f.policy_label)
    failedByReport.set(f.report_id, list)
  }
  const groups = new Map<string, DepartmentMishandling>()
  for (const r of d.reports) {
    const failed = failedByReport.get(r.id)
    if (!failed?.length) continue
    let g = groups.get(r.origin_id)
    if (!g) {
      const origin = d.origins.find((o) => o.id === r.origin_id)
      g = {
        origin_id: r.origin_id,
        origin_name: origin?.name ?? r.origin_name,
        emails: origin?.emails ?? [],
        reports: [],
        note: d.notes?.find((n) => n.origin_id === r.origin_id)?.note ?? null,
      }
      groups.set(r.origin_id, g)
    }
    g.reports.push({ report: r, failed })
  }
  return [...groups.values()].sort((a, b) => a.origin_name.localeCompare(b.origin_name))
}

/** Jefes de las áreas involucradas en el mal manejo (CC del correo), sin repetir ni duplicar el "Para". */
export function involvedCc(groups: DepartmentMishandling[], to: string[]): string[] {
  const skip = new Set(to.map((x) => x.toLowerCase()))
  const out: string[] = []
  for (const g of groups)
    for (const e of g.emails) {
      const k = e.toLowerCase()
      if (!skip.has(k)) {
        skip.add(k)
        out.push(e)
      }
    }
  return out
}

/* ---------- Reporte de mal manejo por período (semana / mes) ---------- */

export type PeriodKind = 'semana' | 'mes'
export type PeriodStatus = 'abierto' | 'cerrado'

export const PERIOD_STATUS_LABELS: Record<PeriodStatus, string> = { abierto: 'ABIERTO', cerrado: 'CERRADO' }
export const PERIOD_STATUS_COLORS: Record<PeriodStatus, string> = { abierto: '#fbbf24', cerrado: '#34d399' }

export interface DamagePeriod {
  id: string
  folio: number
  created_at: string
  kind: PeriodKind
  start_date: string
  end_date: string
  status: PeriodStatus
  general_note: string | null
  emailed_at: string | null
  emailed_to: string[]
  emailed_cc: string[]
  closed_at: string | null
}

export interface PeriodNote {
  origin_id: string
  origin_name: string
  note: string | null
}

export interface PeriodDetail {
  period: DamagePeriod
  /** Averías de lotes confirmados en el período (abierto) o amarradas a él (cerrado). */
  reports: DamageReport[]
  findings: DamageFinding[]
  notes: PeriodNote[]
  origins: DamageOrigin[]
  /** Folio de lote por id (para el detalle). */
  batchFolios: Record<string, number>
  /** Destinatario(s) principal(es) del correo (Ajustes). */
  mailTo: string[]
}

const PERIOD_COLS = 'id, folio, created_at, kind, start_date, end_date, status, general_note, emailed_at, emailed_to, emailed_cc, closed_at'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** "Semana del 28/09 al 04/10/2026" · "Mes de septiembre 2026". */
export function periodLabel(p: Pick<DamagePeriod, 'kind' | 'start_date' | 'end_date'>): string {
  if (p.kind === 'mes') return `Mes de ${MONTHS[Number(p.start_date.slice(5, 7)) - 1]} ${p.start_date.slice(0, 4)}`
  return `Semana del ${dm(p.start_date)} al ${dmy(p.end_date)}`
}

/** Lunes de la semana de una fecha YYYY-MM-DD. */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay() // 0 = domingo
  return addDaysISO(date, -((dow + 6) % 7))
}

function monthEnd(start: string): string {
  const y = Number(start.slice(0, 4))
  const m = Number(start.slice(5, 7))
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return addDaysISO(next, -1)
}

/** Semanas (lunes–domingo) o meses YA terminados, del más reciente al más viejo. */
export function completedPeriods(kind: PeriodKind, count: number, today = todaySV()): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = []
  if (kind === 'semana') {
    let start = addDaysISO(weekStart(today), -7)
    for (let i = 0; i < count; i++) {
      out.push({ start, end: addDaysISO(start, 6) })
      start = addDaysISO(start, -7)
    }
  } else {
    let y = Number(today.slice(0, 4))
    let m = Number(today.slice(5, 7))
    for (let i = 0; i < count; i++) {
      m -= 1
      if (m === 0) {
        m = 12
        y -= 1
      }
      const start = `${y}-${String(m).padStart(2, '0')}-01`
      out.push({ start, end: monthEnd(start) })
    }
  }
  return out
}

export async function fetchPeriods(): Promise<DamagePeriod[]> {
  const { data, error } = await supabase.from(DAMAGE_TABLES.periods).select(PERIOD_COLS).order('start_date', { ascending: false }).order('kind').limit(200)
  fail(error)
  return (data ?? []) as DamagePeriod[]
}

function chunks<T>(list: T[], size = 150): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export async function fetchPeriodDetail(periodId: string): Promise<PeriodDetail> {
  const [p, ids, n, origins, mailTo] = await Promise.all([
    supabase.from(DAMAGE_TABLES.periods).select(PERIOD_COLS).eq('id', periodId).maybeSingle(),
    rpc<string[] | null>('inventory_damage_period_report_ids', { p_period_id: periodId }),
    supabase.from(DAMAGE_TABLES.periodNotes).select('origin_id, origin_name, note').eq('period_id', periodId),
    fetchOrigins(true),
    fetchMailTo().catch(() => [] as string[]),
  ])
  fail(p.error)
  fail(n.error)
  if (!p.data) throw new Error('Reporte de período no encontrado (pudo haberse descartado).')
  const reportIds = (ids ?? []).map(String)

  const reports: DamageReport[] = []
  const findings: DamageFinding[] = []
  for (const part of chunks(reportIds)) {
    const [r, f] = await Promise.all([
      supabase.from(DAMAGE_TABLES.reports).select(REPORT_COLS).in('id', part),
      supabase.from(DAMAGE_TABLES.findings).select('id, batch_id, report_id, policy_id, policy_label').in('report_id', part),
    ])
    fail(r.error)
    fail(f.error)
    reports.push(...((r.data ?? []) as DamageReport[]))
    findings.push(...((f.data ?? []) as DamageFinding[]))
  }
  reports.sort((a, b) => a.origin_name.localeCompare(b.origin_name) || a.folio - b.folio)

  const batchFolios: Record<string, number> = {}
  const batchIds = [...new Set(reports.map((r) => r.batch_id).filter((x): x is string => !!x))]
  for (const part of chunks(batchIds)) {
    const { data, error } = await supabase.from(DAMAGE_TABLES.batches).select('id, folio').in('id', part)
    fail(error)
    for (const b of data ?? []) batchFolios[b.id as string] = b.folio as number
  }

  return {
    period: p.data as DamagePeriod,
    reports,
    findings,
    notes: (n.data ?? []) as PeriodNote[],
    origins,
    batchFolios,
    mailTo,
  }
}

/** Crea (o abre, si ya existe) el reporte de una semana / un mes terminado. */
export async function createPeriod(kind: PeriodKind, start: string): Promise<string> {
  return rpc<string>('inventory_damage_period_create', { p_kind: kind, p_start: start })
}

export async function savePeriodNote(periodId: string, originId: string, note: string): Promise<void> {
  await rpc('inventory_damage_period_save_note', { p_period_id: periodId, p_origin_id: originId, p_note: note })
}

export async function savePeriod(periodId: string, generalNote: string): Promise<void> {
  await rpc('inventory_damage_period_save', { p_period_id: periodId, p_general_note: generalNote })
}

/** Registra que se abrió el correo único del período (Para + CC usados). */
export async function markPeriodEmailed(periodId: string, to: string[], cc: string[]): Promise<void> {
  await rpc('inventory_damage_period_mark_emailed', { p_period_id: periodId, p_to: to, p_cc: cc })
}

export async function closePeriod(periodId: string, generalNote: string): Promise<void> {
  await rpc('inventory_damage_period_close', { p_period_id: periodId, p_general_note: generalNote })
}

export async function reopenPeriod(periodId: string): Promise<void> {
  await rpc('inventory_damage_period_reopen', { p_period_id: periodId })
}

export async function deletePeriod(periodId: string): Promise<void> {
  await rpc('inventory_damage_period_delete', { p_period_id: periodId })
}

/* ---------- Tiempo real ---------- */

export function subscribeDamages(onChange: () => void): () => void {
  const channel = supabase.channel(`damages-${Math.random().toString(36).slice(2)}`)
  ;[DAMAGE_TABLES.reports, DAMAGE_TABLES.batches, DAMAGE_TABLES.findings, DAMAGE_TABLES.periods, DAMAGE_TABLES.periodNotes].forEach((table) =>
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange),
  )
  channel.subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
