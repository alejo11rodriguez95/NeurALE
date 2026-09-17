import type { ReactNode } from 'react'

import { withAlpha } from '@/shared/modules'

/**
 * Tarjeta de opción del menú de Configuraciones y Administradores — mismo
 * patrón que `src/modules/outbound/components/OptionCard.tsx` y
 * `src/modules/picking/components/OptionCard.tsx`. Este es el tercer módulo
 * que la necesita: ver ARCHITECTURE.md → "Convenciones de Setup y Diseño"
 * (candidato a promover a `src/shared/components/` — pedirlo en el chat de
 * Setup y Diseño).
 */
export function OptionCard({
  color,
  icon,
  title,
  description,
  onClick,
  disabled,
}: {
  color: string
  icon: ReactNode
  title: string
  description: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full flex-col items-start gap-3 rounded-2xl border border-neurale-border bg-neurale-surface p-5 text-left shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
      style={{ borderColor: withAlpha(color, 0.22) }}
    >
      <span
        className="flex h-10 w-10 items-center justify-center rounded-xl text-lg"
        style={{ background: withAlpha(color, 0.14), color }}
      >
        {icon}
      </span>
      <span className="font-display text-base font-semibold text-white">
        {title}
      </span>
      <span className="text-sm leading-relaxed text-white/55">{description}</span>
    </button>
  )
}
