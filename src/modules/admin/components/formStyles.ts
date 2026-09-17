import type { CSSProperties } from 'react'

/**
 * Estilos de campo — mismo patrón que
 * `src/modules/outbound/components/formStyles.ts`. Duplicado a propósito
 * (ver esa nota): si un cuarto módulo lo necesita, se pide como componente
 * compartido en el chat de Setup y Diseño.
 */
export const fieldLabelClass = 'block text-xs font-medium text-white/55'

export const fieldControlClass =
  'mt-1.5 w-full rounded-lg border border-neurale-border bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 disabled:opacity-50'

export function ringStyle(color: string): CSSProperties {
  return { '--tw-ring-color': color } as CSSProperties
}
