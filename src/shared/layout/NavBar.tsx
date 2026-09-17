import { Link, useLocation } from 'react-router-dom'

import { useAuth } from '@/shared/auth/AuthContext'
import { ALL_MODULES, withAlpha } from '@/shared/modules'

export function NavBar() {
  const location = useLocation()
  const { session, signOut } = useAuth()
  const current = ALL_MODULES.find((m) => m.path === location.pathname)
  const accent = current?.color ?? '#5eead4'

  return (
    <header className="sticky top-0 z-50 border-b border-neurale-border bg-neurale-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-3">
          <span className="flex h-8 w-[78px] shrink-0 items-center justify-center rounded-md bg-white px-1.5 py-1">
            <img
              src="/brand/logo-cdnneo.jpeg"
              alt="CD NNEO"
              className="h-full w-full object-contain"
            />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight whitespace-nowrap text-white">
            Neur<span className="text-neurale-red">ALE</span>
          </span>
        </Link>

        {current ? (
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 text-sm text-white/65 sm:flex">
              <span
                className="block h-1.5 w-1.5 rounded-full"
                style={{
                  background: accent,
                  boxShadow: `0 0 10px 2px ${withAlpha(accent, 0.7)}`,
                }}
              />
              {current.label}
            </span>
            <Link
              to="/"
              className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                color: withAlpha(accent, 0.9),
                borderColor: withAlpha(accent, 0.3),
                background: withAlpha(accent, 0.07),
              }}
            >
              ← Núcleo Neuronal
            </Link>
            {session ? (
              <button
                type="button"
                onClick={() => signOut()}
                className="rounded-full border border-neurale-border px-3 py-1.5 text-xs font-medium text-white/50 transition-colors hover:text-white/80"
              >
                Cerrar sesión
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="hidden text-xs tracking-[0.2em] text-white/35 uppercase sm:inline">
              CD NNEO · VIDRI
            </span>
            {session ? (
              <button
                type="button"
                onClick={() => signOut()}
                className="rounded-full border border-neurale-border px-3 py-1.5 text-xs font-medium text-white/50 transition-colors hover:text-white/80"
              >
                Cerrar sesión
              </button>
            ) : null}
          </div>
        )}
      </div>
    </header>
  )
}
