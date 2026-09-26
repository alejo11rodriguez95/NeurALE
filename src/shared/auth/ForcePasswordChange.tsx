import { useState } from 'react'

import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/shared/components/GlassCard'

import { useAuth } from './AuthContext'

/**
 * Bloquea la entrada a cualquier módulo hasta que el usuario cambie la
 * contraseña temporal que le puso un admin — ver `RequireAccess`, que
 * renderiza esto en vez de sus `children` mientras `adminUser.must_change_password`
 * sea true (decisión 2026-09-21).
 *
 * El cambio de contraseña en sí (`auth.updateUser`) no necesita la Edge
 * Function — lo puede hacer cualquier usuario logueado sobre su propia
 * cuenta con la anon key. Después, `ack_password_changed` (que sí pasa por
 * la función) baja la bandera en `admin_users`, porque escribir esa tabla
 * está bloqueado para todo lo que no sea la Edge Function (ver su RLS).
 */
export function ForcePasswordChange() {
  const { refreshAdminUser } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setSaving(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      const { error: ackError } = await supabase.functions.invoke('admin-manage-user', {
        body: { action: 'ack_password_changed' },
      })
      if (ackError) throw ackError

      await refreshAdminUser()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 py-16">
      <GlassCard className="w-full max-w-sm p-8">
        <h1 className="font-display text-xl font-semibold text-white">Elige tu contraseña</h1>
        <p className="mt-1 text-sm text-white/55">
          Tu cuenta se creó con una contraseña temporal. Elige una nueva antes de continuar.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="block text-xs font-medium text-white/55">
            Nueva contraseña
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-neurale-border bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': '#5eead4' } as React.CSSProperties}
            />
          </label>

          <label className="block text-xs font-medium text-white/55">
            Confirmar contraseña
            <input
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-neurale-border bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': '#5eead4' } as React.CSSProperties}
            />
          </label>

          {error ? <p className="text-sm text-neurale-red">{error}</p> : null}

          <button
            type="submit"
            disabled={saving}
            className="mt-2 rounded-full bg-neurale-mind px-4 py-2 text-sm font-semibold text-neurale-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar y continuar'}
          </button>
        </form>
      </GlassCard>
    </div>
  )
}
