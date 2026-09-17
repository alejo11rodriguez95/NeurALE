import { supabase } from '@/lib/supabase'

/**
 * Catálogo maestro de empleados — tabla `admin_employees`. Alimenta selects
 * de otros módulos (ej. motorista en Outbound — Gestión de Rutas) según el
 * puesto de cada empleado. Cargar un empleado aquí NO le da acceso al
 * sistema — eso se hace aparte, en Usuarios y Roles (ver `lib/users.ts`).
 */
export interface Employee {
  id: string
  employee_code: string
  full_name: string
  position_id: string | null
  active: boolean
  // Embebido por PostgREST
  position?: { name: string } | null
}

export async function fetchEmployees(): Promise<Employee[]> {
  const { data, error } = await supabase
    .from('admin_employees')
    .select('id, employee_code, full_name, position_id, active, position:admin_positions(name)')
    .order('full_name', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as Employee[]
}

/** Empleados activos con un puesto determinado (ej. para el selector de motorista en Rutas). */
export async function fetchEmployeesByPosition(positionName: string): Promise<Employee[]> {
  const { data, error } = await supabase
    .from('admin_employees')
    .select('id, employee_code, full_name, position_id, active, position:admin_positions!inner(name)')
    .eq('active', true)
    .eq('admin_positions.name', positionName)
    .order('full_name', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as Employee[]
}

export async function createEmployee(input: {
  employee_code: string
  full_name: string
  position_id: string | null
}): Promise<Employee> {
  const { data, error } = await supabase
    .from('admin_employees')
    .insert(input)
    .select('id, employee_code, full_name, position_id, active, position:admin_positions(name)')
    .single()

  if (error) throw error
  return data as unknown as Employee
}

export async function updateEmployee(
  id: string,
  patch: Partial<Pick<Employee, 'full_name' | 'position_id' | 'active'>>,
): Promise<Employee> {
  const { data, error } = await supabase
    .from('admin_employees')
    .update(patch)
    .eq('id', id)
    .select('id, employee_code, full_name, position_id, active, position:admin_positions(name)')
    .single()

  if (error) throw error
  return data as unknown as Employee
}

/**
 * Carga masiva: filas ya parseadas de un CSV (employee_code, full_name,
 * position_name). El puesto se resuelve por nombre contra `admin_positions` —
 * si no existe, se crea (mismo criterio que "+ Agregar" en otros catálogos).
 */
export async function bulkImportEmployees(
  rows: { employee_code: string; full_name: string; position_name: string }[],
): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = []
  let imported = 0

  const { data: positions } = await supabase.from('admin_positions').select('id, name')
  const byName = new Map((positions ?? []).map((p) => [p.name.trim().toLowerCase(), p.id as string]))

  for (const row of rows) {
    const code = row.employee_code?.trim()
    const name = row.full_name?.trim()
    const positionName = row.position_name?.trim()
    if (!code || !name) {
      errors.push(`Fila sin código o nombre: ${JSON.stringify(row)}`)
      continue
    }

    let positionId = byName.get(positionName?.toLowerCase())
    if (!positionId && positionName) {
      const { data: created, error: createError } = await supabase
        .from('admin_positions')
        .insert({ name: positionName })
        .select('id')
        .single()
      if (createError) {
        errors.push(`${code}: no se pudo crear el puesto "${positionName}" (${createError.message})`)
        continue
      }
      positionId = created.id as string
      byName.set(positionName.toLowerCase(), positionId)
    }

    const { error } = await supabase
      .from('admin_employees')
      .upsert(
        { employee_code: code, full_name: name, position_id: positionId ?? null },
        { onConflict: 'employee_code' },
      )

    if (error) errors.push(`${code}: ${error.message}`)
    else imported += 1
  }

  return { imported, errors }
}
