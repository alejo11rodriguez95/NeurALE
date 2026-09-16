import { supabase } from '@/lib/supabase'

/**
 * Control de Calidad — incidencias encontradas en la preparación de pedidos.
 * Tabla `outbound_quality_incidents` (ver supabase/migrations). Este módulo es
 * el dueño de la tabla; el módulo Picking la reutiliza en su pantalla
 * "Gestión de Control de Calidad" para dar seguimiento (import cross-módulo
 * intencional — evita duplicar la lógica de acceso a datos).
 */

const TABLE = 'outbound_quality_incidents'

export type QualityErrorType =
  | 'faltante'
  | 'sobrante'
  | 'averia'
  | 'producto_incorrecto'
  | 'pedido_incompleto'
  | 'sobre_stock'

export const QUALITY_ERROR_TYPES: QualityErrorType[] = [
  'faltante',
  'sobrante',
  'averia',
  'producto_incorrecto',
  'pedido_incompleto',
  'sobre_stock',
]

export const QUALITY_ERROR_TYPE_LABELS: Record<QualityErrorType, string> = {
  faltante: 'Faltante',
  sobrante: 'Sobrante',
  averia: 'Avería',
  producto_incorrecto: 'Producto incorrecto',
  pedido_incompleto: 'Pedido incompleto',
  sobre_stock: 'Sobre stock',
}

export type QualityIncidentStatus = 'abierta' | 'en_seguimiento' | 'resuelta'

export const QUALITY_STATUSES: QualityIncidentStatus[] = [
  'abierta',
  'en_seguimiento',
  'resuelta',
]

export const QUALITY_STATUS_LABELS: Record<QualityIncidentStatus, string> = {
  abierta: 'Abierta',
  en_seguimiento: 'En seguimiento',
  resuelta: 'Resuelta',
}

/** Color de acento por estado — usado tanto en Outbound como en la pantalla
 * de seguimiento de Picking, para que una incidencia se vea igual en ambos. */
export const QUALITY_STATUS_COLORS: Record<QualityIncidentStatus, string> = {
  abierta: '#fb7185',
  en_seguimiento: '#fbbf24',
  resuelta: '#34d399',
}

/** Unidades de medida comunes. Lista fija por ahora (no depende de otra tabla). */
export const UNITS_OF_MEASURE = [
  'Unidad',
  'Caja',
  'Pallet',
  'Libra',
  'Kilogramo',
  'Galón',
  'Paquete',
]

export interface QualityIncident {
  id: string
  created_at: string
  sku: string
  quantity: number
  lot: string | null
  expiration_date: string | null
  unit_of_measure: string
  branch: string
  order_number: string
  location: string | null
  error_type: QualityErrorType
  prepared_by: string
  verified_by: string
  status: QualityIncidentStatus
  assigned_to: string | null
  resolution_notes: string | null
  resolved_at: string | null
}

export type NewQualityIncident = {
  sku: string
  quantity: number
  lot: string | null
  expiration_date: string | null
  unit_of_measure: string
  branch: string
  order_number: string
  location: string | null
  error_type: QualityErrorType
  prepared_by: string
  verified_by: string
}

export async function fetchQualityIncidents(): Promise<QualityIncident[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as QualityIncident[]
}

export async function createQualityIncident(
  input: NewQualityIncident,
): Promise<QualityIncident> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(input)
    .select('*')
    .single()

  if (error) throw error
  return data as QualityIncident
}

export async function updateQualityIncident(
  id: string,
  patch: Partial<
    Pick<QualityIncident, 'status' | 'assigned_to' | 'resolution_notes' | 'resolved_at'>
  >,
): Promise<QualityIncident> {
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as QualityIncident
}
