import { supabase } from '@/lib/supabase'

/** Catálogo de sucursales — tabla `admin_branches`, resuelve `branch`/`branches_loaded` en Outbound. */
export interface Branch {
  id: string
  code: string
  name: string
  active: boolean
}

export async function fetchBranches(): Promise<Branch[]> {
  const { data, error } = await supabase
    .from('admin_branches')
    .select('id, code, name, active')
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as Branch[]
}

export async function createBranch(input: { code: string; name: string }): Promise<Branch> {
  const { data, error } = await supabase
    .from('admin_branches')
    .insert(input)
    .select('id, code, name, active')
    .single()

  if (error) throw error
  return data as Branch
}

export async function updateBranch(
  id: string,
  patch: Partial<Pick<Branch, 'code' | 'name' | 'active'>>,
): Promise<Branch> {
  const { data, error } = await supabase
    .from('admin_branches')
    .update(patch)
    .eq('id', id)
    .select('id, code, name, active')
    .single()

  if (error) throw error
  return data as Branch
}
