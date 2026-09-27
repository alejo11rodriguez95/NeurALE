import { supabase } from '@/lib/supabase'

/** Catálogo de puestos — tabla `admin_positions`, seedeada por la migración. */
export interface Position {
  id: string
  name: string
  active: boolean
}

/** Solo los activos — para los selects de Empleados / otros módulos. */
export async function fetchPositions(): Promise<Position[]> {
  const { data, error } = await supabase
    .from('admin_positions')
    .select('id, name, active')
    .eq('active', true)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as Position[]
}

/** Todos (activos e inactivos) — para la pantalla de administración de Puestos. */
export async function fetchAllPositions(): Promise<Position[]> {
  const { data, error } = await supabase
    .from('admin_positions')
    .select('id, name, active')
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

export async function updatePosition(
  id: string,
  patch: Partial<Pick<Position, 'name' | 'active'>>,
): Promise<Position> {
  const { data, error } = await supabase
    .from('admin_positions')
    .update(patch)
    .eq('id', id)
    .select('id, name, active')
    .single()

  if (error) throw error
  return data as Position
}

/**
 * Elimina un puesto en firme. Si ya hay empleados con ese puesto asignado,
 * `admin_employees.position_id` lo referencia y Postgres rechaza el delete
 * (foreign key) — se relanza un error legible en vez del mensaje crudo de
 * Postgres, para que la pantalla ofrezca desactivarlo en su lugar.
 */
export async function deletePosition(id: string): Promise<void> {
  const { error } = await supabase.from('admin_positions').delete().eq('id', id)
  if (error) {
    if (error.code === '23503' || /foreign key/i.test(error.message)) {
      throw new Error('No se puede eliminar: hay empleados con este puesto asignado. Desactívalo en su lugar.')
    }
    throw error
  }
}
