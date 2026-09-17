import { supabase } from '@/lib/supabase'

/** Catálogo de puestos — tabla `admin_positions`, seedeada por la migración. */
export interface Position {
  id: string
  name: string
  active: boolean
}

export async function fetchPositions(): Promise<Position[]> {
  const { data, error } = await supabase
    .from('admin_positions')
    .select('id, name, active')
    .eq('active', true)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as Position[]
}

export async function createPosition(name: string): Promise<Position> {
  const { data, error } = await supabase
    .from('admin_positions')
    .insert({ name })
    .select('id, name, active')
    .single()

  if (error) throw error
  return data as Position
}
