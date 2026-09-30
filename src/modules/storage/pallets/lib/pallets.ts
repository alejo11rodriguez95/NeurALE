import { supabase } from '@/lib/supabase'

/**
 * Storage · "Registro x Pallet" y "Control de Referencias" (agregado desde el
 * chat del Dashboard Neuronal — ver ARCHITECTURE.md → "Diálogo Táctico CD
 * Nneo" → v7 y v8). Tablas en
 * supabase/migrations/20260929200000_dashboard_tactical_v7_storage_pallets.sql y
 * supabase/migrations/20260930120000_storage_pallets_v8_multiref_process.sql.
 *
 * - Un registro = N pallets con UNA o VARIAS referencias (cada una con su
 *   cantidad de SKU). Los pallets suman una sola vez al Diálogo Táctico; cada
 *   referencia aparece por separado en Control de Referencias.
 * - Estados: EN PROCESO → (Procesar) ALMACENADO o CON DISCREPANCIA →
 *   (Inbound) ACTUALIZADO. Con discrepancia, Inbound debe dar seguimiento
 *   antes de actualizar.
 * - Todo cambio pasa por funciones de la base (RPC) que validan permisos.
 *   Eliminar/editar/reabrir: solo supervisor (puesto Coordinador/Jefe/Gerente
 *   con acceso a Storage, gerencia o admin).
 */

export const PALLET_TABLES = {
  records: 'storage_pallet_records',
  recordRefs: 'storage_pallet_record_refs',
  references: 'storage_references',
  summary: 'storage_references_summary',
} as const

export const PALLETS_NAME = 'Registro x Pallet'
export const REFERENCES_NAME = 'Control de Referencias'

/* ---------- Tipos ---------- */

export type ReferenceStatus = 'en_proceso' | 'almacenado' | 'discrepancia' | 'actualizado'

export const REFERENCE_STATUSES: ReferenceStatus[] = ['en_proceso', 'almacenado', 'discrepancia', 'actualizado']

export const REFERENCE_STATUS_LABELS: Record<ReferenceStatus, string> = {
  en_proceso: 'EN PROCESO',
  almacenado: 'ALMACENADO TOTAL',
  discrepancia: 'CON DISCREPANCIA',
  actualizado: 'ACTUALIZADO',
}

export const REFERENCE_STATUS_COLORS: Record<ReferenceStatus, string> = {
  en_proceso: '#fbbf24',
  almacenado: '#34d399',
  discrepancia: '#fb923c',
  actualizado: '#22d3ee',
}

export type DiscrepancyKind = 'faltante' | 'sobrante' | 'danado'

export const DISCREPANCY_KINDS: DiscrepancyKind[] = ['faltante', 'sobrante', 'danado']

export const DISCREPANCY_LABELS: Record<DiscrepancyKind, string> = {
  faltante: 'Faltante',
  sobrante: 'Sobrante',
  danado: 'Dañado',
}

export interface Discrepancy {
  sku: string
  qty: number
  kind: DiscrepancyKind
}

export interface PalletRecordRef {
  id: string
  reference_id: string
  reference: string
  status: ReferenceStatus | null
  sku_count: number
}

export interface PalletRecord {
  id: string
  recorded_at: string
  record_date: string
  stower_employee_id: string | null
  stower_name: string
  pallets: number
  sku_count: number
  refs: PalletRecordRef[]
}

export interface NewPalletRecord {
  stower_employee_id: string
  stower_name: string
  pallets: number
  refs: { reference: string; sku_count: number }[]
}

export interface ReferenceSummary {
  id: string
  reference: string
  status: ReferenceStatus
  created_at: string
  stored_at: string | null
  system_updated_at: string | null
  process_type: 'total' | 'discrepancia' | null
  process_note: string | null
  discrepancies: Discrepancy[]
  followup_note: string | null
  followup_at: string | null
  pallets: number
  sku_count: number
  records: number
  first_recorded_at: string | null
  last_recorded_at: string | null
}

export interface ReferenceLine {
  id: string
  sku_count: number
  recorded_at: string
  stower_name: string
  pallets: number
  /** Otras referencias del mismo pallet. */
  others: string[]
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  fail(error)
  return data as T
}

/* ---------- Permisos ---------- */

/** ¿Coordinador, jefe o gerente con acceso a Storage (o gerencia/admin)? Lo decide la base. */
export async function fetchIsSupervisor(): Promise<boolean> {
  try {
    return !!(await rpc<boolean>('storage_pallets_is_supervisor', {}))
  } catch {
    return false
  }
}

/* ---------- Registros ---------- */

interface RawRecord {
  id: string
  recorded_at: string
  record_date: string
  stower_employee_id: string | null
  stower_name: string
  pallets: number
  sku_count: number
  refs: { id: string; reference_id: string; sku_count: number; ref: { reference: string; status: ReferenceStatus } | null }[] | null
}

export async function fetchPalletRecords(from: string, to: string): Promise<PalletRecord[]> {
  const { data, error } = await supabase
    .from(PALLET_TABLES.records)
    .select(
      'id, recorded_at, record_date, stower_employee_id, stower_name, pallets, sku_count, refs:storage_pallet_record_refs(id, reference_id, sku_count, ref:storage_references(reference, status))',
    )
    .gte('record_date', from)
    .lte('record_date', to)
    .order('recorded_at', { ascending: false })
  fail(error)
  return ((data ?? []) as unknown as RawRecord[]).map((r) => ({
    ...r,
    refs: (r.refs ?? []).map((x) => ({
      id: x.id,
      reference_id: x.reference_id,
      reference: x.ref?.reference ?? '—',
      status: x.ref?.status ?? null,
      sku_count: x.sku_count,
    })),
  }))
}

export async function createPalletRecord(input: NewPalletRecord): Promise<void> {
  await rpc('storage_register_pallets', {
    p_stower_employee_id: input.stower_employee_id,
    p_stower_name: input.stower_name,
    p_pallets: input.pallets,
    p_refs: input.refs,
  })
}

export async function deletePalletRecord(id: string): Promise<void> {
  await rpc('storage_pallet_record_delete', { p_id: id })
}

/* ---------- Referencias ---------- */

export async function fetchReferences(statuses?: ReferenceStatus[]): Promise<ReferenceSummary[]> {
  let q = supabase.from(PALLET_TABLES.summary).select('*')
  if (statuses?.length) q = q.in('status', statuses)
  const { data, error } = await q.order('last_recorded_at', { ascending: false, nullsFirst: false }).limit(500)
  fail(error)
  return ((data ?? []) as ReferenceSummary[]).map((r) => ({ ...r, discrepancies: Array.isArray(r.discrepancies) ? r.discrepancies : [] }))
}

interface RawLine {
  id: string
  sku_count: number
  record: {
    recorded_at: string
    stower_name: string
    pallets: number
    refs: { reference_id: string; ref: { reference: string } | null }[] | null
  } | null
}

/** Registros (pallets) de una referencia, para editar su SKU. */
export async function fetchReferenceLines(referenceId: string): Promise<ReferenceLine[]> {
  const { data, error } = await supabase
    .from(PALLET_TABLES.recordRefs)
    .select(
      'id, sku_count, record:storage_pallet_records(recorded_at, stower_name, pallets, refs:storage_pallet_record_refs(reference_id, ref:storage_references(reference)))',
    )
    .eq('reference_id', referenceId)
  fail(error)
  return ((data ?? []) as unknown as RawLine[])
    .map((l) => ({
      id: l.id,
      sku_count: l.sku_count,
      recorded_at: l.record?.recorded_at ?? '',
      stower_name: l.record?.stower_name ?? '—',
      pallets: l.record?.pallets ?? 0,
      others: (l.record?.refs ?? []).filter((x) => x.reference_id !== referenceId).map((x) => x.ref?.reference ?? '—'),
    }))
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
}

export async function processReference(id: string, type: 'total' | 'discrepancia', note: string, items: Discrepancy[]): Promise<void> {
  await rpc('storage_reference_process', { p_id: id, p_type: type, p_note: note, p_items: type === 'discrepancia' ? items : [] })
}

export async function reopenReference(id: string): Promise<void> {
  await rpc('storage_reference_reopen', { p_id: id })
}

export async function inboundUpdateReference(id: string, followup: string, markUpdated: boolean): Promise<void> {
  await rpc('storage_reference_inbound_update', { p_id: id, p_followup: followup, p_mark_updated: markUpdated })
}

export async function inboundUndoReference(id: string): Promise<void> {
  await rpc('storage_reference_inbound_undo', { p_id: id })
}

export async function editReference(id: string, reference: string, skus: { id: string; sku_count: number }[]): Promise<void> {
  await rpc('storage_reference_edit', { p_id: id, p_reference: reference, p_skus: skus })
}

/** Devuelve cuántos pallets se eliminaron (los que solo tenían esta referencia). */
export async function deleteReference(id: string): Promise<number> {
  return (await rpc<number>('storage_reference_delete', { p_id: id })) ?? 0
}

/* ---------- Tiempo real ---------- */

export function subscribePallets(onChange: () => void): () => void {
  const channel = supabase.channel(`pallets-${Math.random().toString(36).slice(2)}`)
  ;[PALLET_TABLES.records, PALLET_TABLES.recordRefs, PALLET_TABLES.references].forEach((table) =>
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange),
  )
  channel.subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
