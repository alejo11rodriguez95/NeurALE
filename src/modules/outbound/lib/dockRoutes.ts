import { supabase } from '@/lib/supabase'

/**
 * Gestión de Rutas — muelles, motoristas y registro de llegada/salida de
 * camiones. Tablas `outbound_docks`, `outbound_drivers`, `outbound_dock_visits`
 * (ver supabase/migrations). Los 9 muelles se siembran por SQL — no tienen
 * pantalla de administración propia.
 */

export interface Dock {
  id: string
  code: string
  label: string
}

export interface Driver {
  id: string
  full_name: string
  license_plate_assigned: string | null
  active: boolean
}

export type DockVisitStatus = 'en_muelle' | 'despachado'

export interface DockVisit {
  id: string
  created_at: string
  dock_id: string
  arrived_at: string
  departed_at: string | null
  vehicle_plate: string
  driver_id: string | null
  responsible: string
  pallet_count: number | null
  branches_loaded: string[] | null
  status: DockVisitStatus
  // Embebidos por PostgREST (ver fetchActiveDockVisits)
  dock?: { code: string; label: string }
  driver?: { full_name: string } | null
}

export async function fetchDocks(): Promise<Dock[]> {
  const { data, error } = await supabase
    .from('outbound_docks')
    .select('id, code, label')
    .order('code', { ascending: true })

  if (error) throw error
  return (data ?? []) as Dock[]
}

export async function fetchDrivers(): Promise<Driver[]> {
  const { data, error } = await supabase
    .from('outbound_drivers')
    .select('id, full_name, license_plate_assigned, active')
    .eq('active', true)
    .order('full_name', { ascending: true })

  if (error) throw error
  return (data ?? []) as Driver[]
}

export async function createDriver(input: {
  full_name: string
  license_plate_assigned?: string | null
}): Promise<Driver> {
  const { data, error } = await supabase
    .from('outbound_drivers')
    .insert(input)
    .select('id, full_name, license_plate_assigned, active')
    .single()

  if (error) throw error
  return data as Driver
}

/** Visitas activas (camión todavía en el muelle), con muelle y motorista embebidos. */
export async function fetchActiveDockVisits(): Promise<DockVisit[]> {
  const { data, error } = await supabase
    .from('outbound_dock_visits')
    .select(
      '*, dock:outbound_docks(code,label), driver:outbound_drivers(full_name)',
    )
    .eq('status', 'en_muelle')
    .order('arrived_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as DockVisit[]
}

/** Historial reciente (incluye ya despachados), para referencia rápida. */
export async function fetchRecentDockVisits(limit = 20): Promise<DockVisit[]> {
  const { data, error } = await supabase
    .from('outbound_dock_visits')
    .select(
      '*, dock:outbound_docks(code,label), driver:outbound_drivers(full_name)',
    )
    .order('arrived_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as DockVisit[]
}

/** Se crea al escanear el QR del muelle: registra dock + hora de llegada. */
export async function createDockVisit(dockId: string): Promise<DockVisit> {
  const { data, error } = await supabase
    .from('outbound_dock_visits')
    .insert({
      dock_id: dockId,
      vehicle_plate: '',
      responsible: '',
    })
    .select('*, dock:outbound_docks(code,label), driver:outbound_drivers(full_name)')
    .single()

  if (error) throw error
  return data as DockVisit
}

export async function updateDockVisit(
  id: string,
  patch: Partial<
    Pick<
      DockVisit,
      'vehicle_plate' | 'driver_id' | 'responsible' | 'pallet_count' | 'branches_loaded'
    >
  >,
): Promise<DockVisit> {
  const { data, error } = await supabase
    .from('outbound_dock_visits')
    .update(patch)
    .eq('id', id)
    .select('*, dock:outbound_docks(code,label), driver:outbound_drivers(full_name)')
    .single()

  if (error) throw error
  return data as DockVisit
}

/** Registra la salida del camión (fecha/hora de salida + cierre de estado). */
export async function closeDockVisit(id: string): Promise<DockVisit> {
  const { data, error } = await supabase
    .from('outbound_dock_visits')
    .update({ departed_at: new Date().toISOString(), status: 'despachado' })
    .eq('id', id)
    .select('*, dock:outbound_docks(code,label), driver:outbound_drivers(full_name)')
    .single()

  if (error) throw error
  return data as DockVisit
}
