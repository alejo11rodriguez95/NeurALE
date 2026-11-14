import { supabase } from '@/lib/supabase'

/**
 * Storage · Auditoría OPL — auditoría de inventario de operadores logísticos
 * (ej. TLA) a partir del Excel que entrega el OPL. Tablas y funciones en
 * supabase/migrations/20261114120000_storage_opl_audit.sql.
 *
 * - Asignación de OPL: se crea el OPL y se parametriza con un Excel modelo
 *   (hoja, fila de títulos y qué columna es la llave de conteo, SKU,
 *   descripción, cantidad, ubicación y extras).
 * - Auditoría {OPL}: cada Excel cargado es una auditoría. Se cuenta por llave
 *   (ej. LPN) en CONTEO CIEGO: quien cuenta nunca ve la cantidad esperada.
 * - Revisión de Discrepancias: SKU con todas sus llaves contadas cuyo total no
 *   cuadra con el formato → reconteo de sus llaves + cierre del supervisor.
 * - Resultados y avance.
 * Toda escritura pasa por funciones de la base que validan el rol.
 */

export const OPL_TABLES = {
  operators: 'storage_opl_operators',
  audits: 'storage_opl_audits',
  lines: 'storage_opl_audit_lines',
  extras: 'storage_opl_audit_extras',
  reviews: 'storage_opl_sku_reviews',
} as const

export const OPL_NAME = 'Auditoría OPL'

/* ---------- Tipos ---------- */

export interface OplMapping {
  /** Columna llave de conteo (ej. "LPN"): cada valor se cuenta una vez. */
  key: string
  /** Cómo se le llama a la llave en pantalla (ej. "LPN"). */
  key_label: string
  sku: string
  description: string
  qty: string
  location: string | null
  /** Columnas extra que se muestran al contar (ej. LOTE, UM, ESTADO). */
  extras: string[]
}

export interface OplOperator {
  id: string
  name: string
  active: boolean
  sheet_name: string | null
  header_row: number
  headers: string[]
  mapping: OplMapping
  sample_file_name: string | null
  created_at: string
}

export type AuditStatus = 'cargando' | 'en_curso' | 'cerrada'

export const AUDIT_STATUS_LABELS: Record<AuditStatus, string> = {
  cargando: 'Cargando',
  en_curso: 'En curso',
  cerrada: 'Cerrada',
}

export const AUDIT_STATUS_COLORS: Record<AuditStatus, string> = {
  cargando: '#94a3b8',
  en_curso: '#facc15',
  cerrada: '#4ade80',
}

export interface OplAudit {
  id: string
  operator_id: string
  folio: string
  status: AuditStatus
  file_name: string | null
  sheet_name: string | null
  mapping: OplMapping
  note: string | null
  line_count: number
  sku_count: number
  expected_total: number
  counted_lines: number
  counted_units: number
  extra_count: number
  last_activity_at: string | null
  created_at: string
  created_by_name: string | null
  closed_at: string | null
  closed_by_name: string | null
  close_note: string | null
}

export interface LookupResult {
  found: boolean
  extra_registered?: boolean
  key: string
  sku?: string
  description?: string | null
  location?: string | null
  extra?: Record<string, string>
  counted?: boolean
  counted_by?: string | null
  counted_at?: string | null
  mine?: boolean | null
  my_qty?: number | null
  review?: ReviewStatus | null
  qty?: number
  by?: string | null
  audit_status: AuditStatus
}

export type ReviewStatus = 'reconteo' | 'cuadrado' | 'diferencia_confirmada'

export const REVIEW_STATUS_LABELS: Record<ReviewStatus | 'pendiente', string> = {
  pendiente: 'Pendiente de reconteo',
  reconteo: 'En reconteo',
  cuadrado: 'Cuadró en reconteo',
  diferencia_confirmada: 'Diferencia confirmada',
}

export const REVIEW_STATUS_COLORS: Record<ReviewStatus | 'pendiente', string> = {
  pendiente: '#f87171',
  reconteo: '#facc15',
  cuadrado: '#4ade80',
  diferencia_confirmada: '#fb923c',
}

export interface SkuSummary {
  sku: string
  description: string | null
  lines_total: number
  lines_counted: number
  lines_recounted: number
  /** null para quien solo cuenta (conteo ciego). */
  expected: number | null
  counted: number | null
  final_qty: number | null
  extra_qty: number
  extra_lines: number
  complete: boolean
  discrepancy: boolean
  review_status: ReviewStatus | null
  review_note: string | null
  review_closed_by: string | null
  review_closed_at: string | null
}

export interface SkuLine {
  key_value: string
  location: string | null
  extra: Record<string, string>
  expected: number | null
  counted: number | null
  counted_by: string | null
  recount: number | null
  recount_by: string | null
  recount_mine: boolean
  recounted: boolean
  is_extra: boolean
  extra_id: string | null
}

export interface CounterStat {
  name: string
  lines: number
  units: number
  recounts: number
  extras: number
  last_at: string | null
}

export interface MyCount {
  key_value: string
  sku: string
  description: string | null
  location: string | null
  qty: number
  counted_at: string
}

export interface AuditLine {
  id: number
  line_no: number | null
  key_value: string
  sku: string
  description: string | null
  location: string | null
  expected_qty: number
  extra: Record<string, string>
  counted_qty: number | null
  counted_by_name: string | null
  counted_at: string | null
  recount_qty: number | null
  recount_by_name: string | null
  recount_at: string | null
}

export interface AuditExtra {
  id: string
  key_value: string
  sku: string
  description: string | null
  location: string | null
  qty: number
  note: string | null
  created_at: string
  created_by_name: string | null
}

/** Línea lista para enviar a la base (nombres cortos para aligerar la carga). */
export interface UploadLine {
  n: number
  k: string
  s: string
  d: string
  l: string
  q: number
  x: Record<string, string>
}

/* ---------- Base ---------- */

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  fail(error)
  return data as T
}

const num = (x: unknown) => (x === null || x === undefined ? null : Number(x))

/* ---------- OPL ---------- */

function normOperator(r: Record<string, unknown>): OplOperator {
  const m = (r.mapping ?? {}) as Partial<OplMapping>
  return {
    ...(r as unknown as OplOperator),
    headers: (r.headers as string[] | null) ?? [],
    mapping: {
      key: m.key ?? '',
      key_label: m.key_label || m.key || 'Llave',
      sku: m.sku ?? '',
      description: m.description ?? '',
      qty: m.qty ?? '',
      location: m.location ?? null,
      extras: m.extras ?? [],
    },
  }
}

export async function fetchOperators(includeInactive = false): Promise<OplOperator[]> {
  let q = supabase.from(OPL_TABLES.operators).select('*')
  if (!includeInactive) q = q.eq('active', true)
  const { data, error } = await q.order('name')
  fail(error)
  return (data ?? []).map((r) => normOperator(r as Record<string, unknown>))
}

export async function saveOperator(input: {
  id: string | null
  name: string
  sheet_name: string | null
  header_row: number
  headers: string[]
  mapping: OplMapping
  sample_file_name: string | null
  active: boolean
}): Promise<string> {
  return rpc<string>('storage_opl_operator_save', {
    p_id: input.id,
    p_name: input.name,
    p_sheet: input.sheet_name,
    p_header_row: input.header_row,
    p_headers: input.headers,
    p_mapping: input.mapping,
    p_sample_file: input.sample_file_name,
    p_active: input.active,
  })
}

export async function deleteOperator(id: string): Promise<void> {
  await rpc('storage_opl_operator_delete', { p_id: id })
}

/* ---------- Auditorías ---------- */

function normAudit(r: Record<string, unknown>): OplAudit {
  return {
    ...(r as unknown as OplAudit),
    expected_total: Number(r.expected_total ?? 0),
    counted_units: Number(r.counted_units ?? 0),
    mapping: normOperator({ mapping: r.mapping } as Record<string, unknown>).mapping,
  }
}

export async function fetchAudits(operatorId?: string): Promise<OplAudit[]> {
  let q = supabase.from(OPL_TABLES.audits).select('*').neq('status', 'cargando')
  if (operatorId) q = q.eq('operator_id', operatorId)
  const { data, error } = await q.order('created_at', { ascending: false })
  fail(error)
  return (data ?? []).map((r) => normAudit(r as Record<string, unknown>))
}

export async function fetchAudit(id: string): Promise<OplAudit | null> {
  const { data, error } = await supabase.from(OPL_TABLES.audits).select('*').eq('id', id).maybeSingle()
  fail(error)
  return data ? normAudit(data as Record<string, unknown>) : null
}

const CHUNK = 1500

/** Crea la auditoría y sube las líneas en partes. Si algo falla, borra la carga a medias. */
export async function createAudit(
  operatorId: string,
  fileName: string,
  sheet: string,
  note: string,
  lines: UploadLine[],
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const id = await rpc<string>('storage_opl_audit_create', {
    p_operator: operatorId,
    p_file_name: fileName,
    p_sheet: sheet,
    p_note: note,
  })
  try {
    for (let i = 0; i < lines.length; i += CHUNK) {
      await rpc('storage_opl_audit_add_lines', { p_audit: id, p_lines: lines.slice(i, i + CHUNK) })
      onProgress?.(Math.min(i + CHUNK, lines.length), lines.length)
    }
    await rpc('storage_opl_audit_finalize', { p_audit: id })
  } catch (e) {
    await rpc('storage_opl_audit_delete', { p_audit: id }).catch(() => undefined)
    throw e
  }
  return id
}

export const closeAudit = (id: string, note: string) => rpc('storage_opl_audit_close', { p_audit: id, p_note: note })
export const reopenAudit = (id: string) => rpc('storage_opl_audit_reopen', { p_audit: id })
export const deleteAudit = (id: string) => rpc('storage_opl_audit_delete', { p_audit: id })

/* ---------- Conteo ---------- */

export async function lookupKey(auditId: string, key: string): Promise<LookupResult> {
  return rpc<LookupResult>('storage_opl_lookup', { p_audit: auditId, p_key: key })
}

export async function countKey(
  auditId: string,
  key: string,
  qty: number,
): Promise<{ ok: boolean; reason?: string; counted_by?: string; counted_at?: string }> {
  return rpc('storage_opl_count', { p_audit: auditId, p_key: key, p_qty: qty })
}

export const undoCount = (auditId: string, key: string) => rpc('storage_opl_count_undo', { p_audit: auditId, p_key: key })

export const registerExtra = (
  auditId: string,
  v: { key: string; sku: string; description: string; location: string; qty: number; note: string },
) =>
  rpc('storage_opl_extra_register', {
    p_audit: auditId,
    p_key: v.key,
    p_sku: v.sku,
    p_description: v.description,
    p_location: v.location,
    p_qty: v.qty,
    p_note: v.note,
  })

export const deleteExtra = (id: string) => rpc('storage_opl_extra_delete', { p_id: id })

export async function fetchMyCounts(auditId: string, limit = 15): Promise<MyCount[]> {
  const data = await rpc<MyCount[]>('storage_opl_my_counts', { p_audit: auditId, p_limit: limit })
  return (data ?? []).map((r) => ({ ...r, qty: Number(r.qty) }))
}

/* ---------- Avance, discrepancias y resultados ---------- */

export async function fetchSkuSummary(auditId: string): Promise<SkuSummary[]> {
  const data = await rpc<SkuSummary[]>('storage_opl_sku_summary', { p_audit: auditId })
  return (data ?? []).map((r) => ({
    ...r,
    expected: num(r.expected),
    counted: num(r.counted),
    final_qty: num(r.final_qty),
    extra_qty: Number(r.extra_qty ?? 0),
  }))
}

export async function fetchSkuLines(auditId: string, sku: string): Promise<SkuLine[]> {
  const data = await rpc<SkuLine[]>('storage_opl_sku_lines', { p_audit: auditId, p_sku: sku })
  return (data ?? []).map((r) => ({
    ...r,
    expected: num(r.expected),
    counted: num(r.counted),
    recount: num(r.recount),
    extra: (r.extra as Record<string, string>) ?? {},
  }))
}

export const recountKey = (auditId: string, key: string, qty: number) =>
  rpc('storage_opl_recount', { p_audit: auditId, p_key: key, p_qty: qty })

export const closeReview = (auditId: string, sku: string, status: 'cuadrado' | 'diferencia_confirmada', note: string) =>
  rpc('storage_opl_review_close', { p_audit: auditId, p_sku: sku, p_status: status, p_note: note })

export const reopenReview = (auditId: string, sku: string) =>
  rpc('storage_opl_review_reopen', { p_audit: auditId, p_sku: sku })

export async function fetchCounters(auditId: string): Promise<CounterStat[]> {
  const data = await rpc<CounterStat[]>('storage_opl_counters', { p_audit: auditId })
  return (data ?? []).map((r) => ({ ...r, units: Number(r.units ?? 0) }))
}

/** Detalle completo (solo configuradores: la RLS oculta las líneas a quien solo cuenta). */
export async function fetchAuditLines(auditId: string): Promise<AuditLine[]> {
  const out: AuditLine[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(OPL_TABLES.lines)
      .select('id,line_no,key_value,sku,description,location,expected_qty,extra,counted_qty,counted_by_name,counted_at,recount_qty,recount_by_name,recount_at')
      .eq('audit_id', auditId)
      .order('id')
      .range(from, from + 999)
    fail(error)
    const rows = (data ?? []) as AuditLine[]
    out.push(
      ...rows.map((r) => ({
        ...r,
        expected_qty: Number(r.expected_qty),
        counted_qty: num(r.counted_qty),
        recount_qty: num(r.recount_qty),
      })),
    )
    if (rows.length < 1000) break
  }
  return out
}

export async function fetchAuditExtras(auditId: string): Promise<AuditExtra[]> {
  const { data, error } = await supabase
    .from(OPL_TABLES.extras)
    .select('id,key_value,sku,description,location,qty,note,created_at,created_by_name')
    .eq('audit_id', auditId)
    .order('created_at', { ascending: false })
  fail(error)
  return ((data ?? []) as AuditExtra[]).map((r) => ({ ...r, qty: Number(r.qty) }))
}

/* ---------- Tiempo real ---------- */

/** Cambios en auditorías (cada conteo actualiza su avance), revisiones y sobrantes. */
export function subscribeOpl(onChange: () => void): () => void {
  const channel = supabase.channel(`opl-${Math.random().toString(36).slice(2)}`)
  ;[OPL_TABLES.audits, OPL_TABLES.reviews, OPL_TABLES.extras].forEach((table) =>
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange),
  )
  channel.subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

/* ---------- Formatos ---------- */

const nf = new Intl.NumberFormat('es-SV', { maximumFractionDigits: 2 })
export const fmtNum = (x: number | null | undefined) => (x === null || x === undefined ? '—' : nf.format(x))
export const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0)
