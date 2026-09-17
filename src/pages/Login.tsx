import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/shared/components/GlassCard'
import { useAuth } from '@/shared/auth/AuthContext'

/**
 * Pantalla de login (decisión 2026-09-16: se adelanta la autenticación real,
 * ver ARCHITECTURE.md → "Roles y accesos"). Visualmente reutiliza los tokens
 * ya definidos en Setup y Diseño (GlassCard, colores neurale-*) en vez de
 * crear un sistema nuevo — si el chat de Setup y Diseño quiere darle una
 * identidad propia (color/tagline del hemisferio izquierdo), esta pantalla
 * es el punto de partida a pulir, no algo cerrado.
 */
export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (session) {
    navigate(from, { replace: true })
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (signInError) {
      setError('Correo o contraseña incorrectos.')
      return
    }
    navigate(from, { replace: true })
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-16">
      <GlassCard className="w-full max-w-sm p-8">
        <h1 className="font-display text-2xl font-semibold text-white">Iniciar sesión</h1>
        <p className="mt-1 text-sm text-white/55">Accede con tu cuenta de NeurALE.</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="block text-xs font-medium text-white/55">
            Correo
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-neurale-border bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': '#5eead4' } as React.CSSProperties}
            />
          </label>

          <label className="block text-xs font-medium text-white/55">
            Contraseña
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-neurale-border bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': '#5eead4' } as React.CSSProperties}
            />
          </label>

          {error ? <p className="text-sm text-neurale-red">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-full bg-neurale-mind px-4 py-2 text-sm font-semibold text-neurale-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </GlassCard>
    </div>
  )
}
