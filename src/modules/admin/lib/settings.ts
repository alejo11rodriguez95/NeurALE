import { supabase } from '@/lib/supabase'

/** Ajustes generales de la plataforma — tabla `admin_settings` (key/value). */
export interface Setting {
  key: string
  value: unknown
  description: string | null
  updated_at: string
}

export async function fetchSettings(): Promise<Setting[]> {
  const { data, error } = await supabase
    .from('admin_settings')
    .select('key, value, description, updated_at')
    .order('key', { ascending: true })

  if (error) throw error
  return (data ?? []) as Setting[]
}

export async function updateSetting(key: string, value: unknown): Promise<void> {
  const { error } = await supabase
    .from('admin_settings')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key)

  if (error) throw error
}

export async function createSetting(input: {
  key: string
  value: unknown
  description?: string
}): Promise<void> {
  const { error } = await supabase.from('admin_settings').insert(input)
  if (error) throw error
}
