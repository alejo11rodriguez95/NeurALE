import { supabase } from '@/lib/supabase'

/**
 * Storage · "Registro x Pallet" y "Control de Referencias" (agregado desde el
 * chat del Dashboard Neuronal, 2026-09-29 — ver ARCHITECTURE.md → "Diálogo
 * Táctico CD Nneo" → v7). Tablas en
 * supabase/migrations/20260929200000_dashboard_tactical_v7_storage_pallets.sql.
 *
 * - Cada registro suma sus pallets a los "pallets reales" de Storage en el
 *   Diálogo Táctico (turno a turno o día a día según Ajustes → Turnos).
 * - Cada referencia nueva se crea sola en EN PROCESO; Storage la marca
 *   ALMACENADO y entonces Inbound puede marcarla ACTUALIZADO.
 */

export const PALLET_TABLES = {
  records: 'storage_pallet_records',
  references: 'storage_references',
  summary: 'storage_references_summary',
} as const

export const PALLETS_NAME = 'Registro x Pallet'
export const REFERENCES_NAME = 'Control de Referencias'

export interface PalletRecord {
  id: string
  recorded_at: string
  record_date: string
  stower_employee_id: string | null
  stower_name: string
  reference: string
  pallets: number
  sku_count: number
}

export interface NewPalletRecord {
  stower_employee_id: string
  stower_name: string
  reference: string
  pallets: number
  sku_count: number
}

export type ReferenceStatus = 'en_proceso' | 'almacenado' | 'actualizado'

export const REFERENCE_STATUSES: ReferenceStatus[] = ['en_proceso', 'almacenado', 'actualizado']

export const REFERENCE_STATUS_LABELS: Record<ReferenceStatus, string> = {
  en_proceso: 'EN PROCESO',
  almacenado: 'ALMACENADO',
  actualizado: 'ACTUALIZADO',
}

export const REFERENCE_STATUS_COLORS: Record<ReferenceStatus, string> = {
  en_proceso: '#fbbf24',
  almacenado: '#34d399',
  actualizado: '#22d3ee',
}

export interface ReferenceSummary {
  id: string
  reference: string
  status: ReferenceStatus
  created_at: string
  stored_at: string | null
  system_updated_at: string | null
  pallets: number
  sku_count: number
  records: number
  first_recorded_at: string | null
  last_recorded_at: string | null
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

/* ---------- Registros ---------- */

export async function fetchPalletRecords(from: string, to: string): Promise<PalletRecord[]> {
  const { data, error } = await supabase
    .from(PALLET_TABLES.records)
    .select('id, recorded_at, record_date, stower_employee_id, stower_name, reference, pallets, sku_count')
    .gte('record_date', from)
    .lte('record_date', to)
    .order('recorded_at', { ascending: false })
  fail(error)
  return (data ?? []) as PalletRecord[]
}

export async function createPalletRecord(input: NewPalletRecord): Promise<void> {
  const { error } = await supabase.from(PALLET_TABLES.records).insert(input)
  fail(error)
}

export async function deletePalletRecord(id: string): Promise<void> {
  const { data, error } = await supabase.from(PALLET_TABLES.records).delete().eq('id', id).select('id')
  fail(error)
  if (!data?.length) throw new Error('Solo el jefe de Storage, gerencia o admin pueden eliminar registros.')
}

/* ---------- Referencias ---------- */

export async function fetchReferences(statuses?: ReferenceStatus[]): Promise<ReferenceSummary[]> {
  let q = supabase.from(PALLET_TABLES.summary).select('*')
  if (statuses?.length) q = q.in('status', statuses)
  const { data, error } = await q.order('last_recorded_at', { ascending: false, nullsFirst: false }).limit(500)
  fail(error)
  return (data ?? []) as ReferenceSummary[]
}

export async function setReferenceStatus(id: string, status: ReferenceStatus): Promise<void> {
  const { data, error } = await supabase.from(PALLET_TABLES.references).update({ status }).eq('id', id).select('id')
  fail(error)
  if (!data?.length) throw new Error('No tienes permiso para cambiar el estado de esta referencia.')
}

/* ---------- Tiempo real ---------- */

export function subscribePallets(onChange: () => void): () => void {
  const channel = supabase.channel(`pallets-${Math.random().toString(36).slice(2)}`)
  Object.values(PALLET_TABLES)
    .filter((t) => t !== PALLET_TABLES.summary)
    .forEach((table) => channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange))
  channel.subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
