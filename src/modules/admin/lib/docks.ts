import { supabase } from '@/lib/supabase'

/**
 * Muelles — tabla `outbound_docks`. Sigue siendo propiedad de Outbound (ver
 * ARCHITECTURE.md), pero desde el 2026-09-16 se administra (agregar/quitar)
 * desde esta pantalla en vez de por SQL manual.
 */
export interface Dock {
  id: string
  code: string
  label: string
}

export async function fetchDocks(): Promise<Dock[]> {
  const { data, error } = await supabase
    .from('outbound_docks')
    .select('id, code, label')
    .order('code', { ascending: true })

  if (error) throw error
  return (data ?? []) as Dock[]
}

export async function createDock(input: { code: string; label: string }): Promise<Dock> {
  const { data, error } = await supabase
    .from('outbound_docks')
    .insert(input)
    .select('id, code, label')
    .single()

  if (error) throw error
  return data as Dock
}

export async function deleteDock(id: string): Promise<void> {
  const { error } = await supabase.from('outbound_docks').delete().eq('id', id)
  if (error) throw error
}
