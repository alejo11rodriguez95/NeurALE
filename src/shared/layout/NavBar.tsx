import { Link, useLocation } from 'react-router-dom'

import { ALL_MODULES } from '@/shared/modules'

export function NavBar() {
  const location = useLocation()
  const current = ALL_MODULES.find((m) => m.path === location.pathname)

  return (
    <header className="sticky top-0 z-50 border-b border-neurale-border bg-neurale-bg/75 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white p-1.5 shadow-sm">
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
            <span className="hidden text-sm text-white/70 sm:inline">
              {current.label}
            </span>
            <Link
              to="/"
              className="rounded-full border border-neurale-border bg-neurale-surface px-3 py-1.5 text-xs font-medium text-white/80 transition-colors hover:border-neurale-gold/60 hover:text-neurale-gold"
            >
              ← Núcleo Neuronal
            </Link>
          </div>
        ) : (
          <span className="hidden text-xs tracking-[0.2em] text-white/40 uppercase sm:inline">
            CD NNEO · VIDRI
          </span>
        )}
      </div>
    </header>
  )
}
