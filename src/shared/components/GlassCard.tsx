import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  className?: string
  as?: ElementType
}

/**
 * Tarjeta base de vidrio esmerilado (glassmorphism), usada en toda la app —
 * tarjetas de módulo, paneles del hub, contenido de pantallas de detalle.
 * Ver ARCHITECTURE.md → "Diseño visual" para los tokens (`neurale-surface`,
 * `neurale-border`, `rounded-2xl`, `backdrop-blur-md`).
 */
export function GlassCard({
  children,
  className = '',
  as: Tag = 'div',
  ...rest
}: GlassCardProps & Omit<ComponentPropsWithoutRef<'div'>, 'className' | 'children'>) {
  return (
    <Tag
      className={`rounded-2xl border border-neurale-border bg-neurale-surface backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.35)] ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}
