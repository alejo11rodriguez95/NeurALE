import { supabase } from '@/lib/supabase'

/**
 * Inventory · Control de Averías (ver ARCHITECTURE.md → "Inventory — Control
 * de Averías"). Tablas y funciones en
 * supabase/migrations/20261001120000_inventory_damage_control.sql.
 *
 * Flujo:
 *   1. El colaborador escanea el QR (sin sesión) y reporta la avería →
 *      estado PENDIENTE.
 *   2. Inventory toma las pendientes en un LOTE (EN TRABAJO), marca qué
 *      políticas de manejo no se cumplieron (= mal manejo), arma el reporte y
 *      el correo de seguimiento por departamento, y deja su observación final.
 *   3. Imprime el reporte (anexo del ajuste en el sistema de la empresa) y
 *      confirma: todo el lote queda ACTUALIZADO.
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

/** Color de "mal manejo" (no cumplió una política). */
export const MISHANDLING_COLOR = '#f87171'

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
  quantity: number
  deducted_from_location: boolean
  observation: string
  status: DamageStatus
  batch_id: string | null
}

export interface DamageBatch {
  id: string
  folio: number
  created_at: string
  worked_by_name: string
  status: 'en_trabajo' | 'actualizado'
  final_note: string | null
  erp_adjustment_ref: string | null
  closed_at: string | null
  /** Correo único de seguimiento del lote (v2): cuándo se abrió y a quién. */
  emailed_at: string | null
  emailed_to: string[]
  emailed_cc: string[]
}

export interface DamageFinding {
  id: string
  batch_id: string
  report_id: string
  policy_id: string
  policy_label: string
}

export interface DamageNotice {
  id: string
  batch_id: string
  origin_id: string
  origin_name: string
  emails: string[]
  note: string | null
  emailed_at: string | null
}

export interface BatchSummary extends DamageBatch {
  reports: number
  units: number
  mishandled: number
}

export interface BatchDetail {
  batch: DamageBatch
  reports: DamageReport[]
  findings: DamageFinding[]
  notices: DamageNotice[]
  policies: DamagePolicy[]
  origins: DamageOrigin[]
  /** Destinatario(s) principal(es) del correo (Ajustes). Vacío si el usuario no puede leer Ajustes. */
  mailTo: string[]
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
  'id, folio, created_at, reporter_employee_id, reporter_code, reporter_name, origin_id, origin_name, sku, quantity, deducted_from_location, observation, status, batch_id'
const BATCH_COLS =
  'id, folio, created_at, worked_by_name, status, final_note, erp_adjustment_ref, closed_at, emailed_at, emailed_to, emailed_cc'

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

/** Destinatario(s) principal(es) del correo de seguimiento (campo "Para"). */
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

export function publicFormUrl(token: string): string {
  return `${window.location.origin}${DAMAGE_PUBLIC_PATH}?t=${encodeURIComponent(token)}`
}

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
    supabase.from(DAMAGE_TABLES.reports).select('id, batch_id, quantity').in('batch_id', ids),
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
    }
  })
}

export async function fetchBatchDetail(batchId: string): Promise<BatchDetail> {
  const [b, r, f, n, policies, origins, mailTo] = await Promise.all([
    supabase.from(DAMAGE_TABLES.batches).select(BATCH_COLS).eq('id', batchId).maybeSingle(),
    supabase.from(DAMAGE_TABLES.reports).select(REPORT_COLS).eq('batch_id', batchId).order('origin_name').order('folio'),
    supabase.from(DAMAGE_TABLES.findings).select('id, batch_id, report_id, policy_id, policy_label').eq('batch_id', batchId),
    supabase.from(DAMAGE_TABLES.notices).select('id, batch_id, origin_id, origin_name, emails, note, emailed_at').eq('batch_id', batchId),
    fetchPolicies(true),
    fetchOrigins(true),
    fetchMailTo().catch(() => [] as string[]),
  ])
  fail(b.error)
  fail(r.error)
  fail(f.error)
  fail(n.error)
  if (!b.data) throw new Error('Lote no encontrado (pudo haberse cancelado).')
  return {
    batch: b.data as DamageBatch,
    reports: (r.data ?? []) as DamageReport[],
    findings: (f.data ?? []) as DamageFinding[],
    notices: (n.data ?? []) as DamageNotice[],
    policies,
    origins,
    mailTo,
  }
}

export async function setFinding(reportId: string, policyId: string, failed: boolean): Promise<void> {
  await rpc('inventory_damage_set_finding', { p_report_id: reportId, p_policy_id: policyId, p_failed: failed })
}

/** Observación de seguimiento de un área con mal manejo (va en el correo y en los reportes). */
export async function saveNotice(batchId: string, originId: string, note: string): Promise<void> {
  await rpc('inventory_damage_save_notice', { p_batch_id: batchId, p_origin_id: originId, p_note: note, p_emailed: false })
}

/** Registra que se abrió el correo único de seguimiento del lote (Para + CC usados). */
export async function markBatchEmailed(batchId: string, to: string[], cc: string[]): Promise<void> {
  await rpc('inventory_damage_batch_mark_emailed', { p_batch_id: batchId, p_to: to, p_cc: cc })
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
  notice: DamageNotice | null
}

/** Agrupa por departamento de origen las averías con al menos una política incumplida. */
export function mishandlingByDepartment(d: BatchDetail): DepartmentMishandling[] {
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
      const notice = d.notices.find((n) => n.origin_id === r.origin_id) ?? null
      g = {
        origin_id: r.origin_id,
        origin_name: origin?.name ?? r.origin_name,
        emails: origin?.emails ?? [],
        reports: [],
        notice,
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

/* ---------- Tiempo real ---------- */

export function subscribeDamages(onChange: () => void): () => void {
  const channel = supabase.channel(`damages-${Math.random().toString(36).slice(2)}`)
  ;[DAMAGE_TABLES.reports, DAMAGE_TABLES.batches, DAMAGE_TABLES.findings, DAMAGE_TABLES.notices].forEach((table) =>
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange),
  )
  channel.subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
