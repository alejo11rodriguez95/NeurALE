import type { AnyModuleId, ModuleDef } from '@/shared/modules'

import { GlassCard } from './GlassCard'

/**
 * Pantalla de espera para un módulo que todavía no tiene sus pantallas de negocio.
 * Cada módulo la reemplaza en su propio chat, reutilizando la base y el sistema de
 * diseño creados aquí (GlassCard, tokens de Tailwind, layout, transiciones).
 */
export function ModulePlaceholder({ module }: { module: ModuleDef<AnyModuleId> }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-20 text-center sm:py-28">
      <span className="rounded-full border border-neurale-border bg-neurale-surface px-4 py-1 text-xs tracking-[0.2em] text-neurale-gold uppercase">
        Módulo
      </span>
      <h1 className="font-display text-4xl font-semibold text-white sm:text-5xl">
        {module.label}
      </h1>
      <p className="max-w-xl text-white/60">{module.description}</p>
      <GlassCard className="w-full p-8 text-left">
        <p className="text-sm text-white/50">
          Este módulo aún no tiene pantallas de negocio — se construyen en su propio
          chat dentro del proyecto NeurALE, sobre la base creada en el chat de Setup
          y Diseño.
        </p>
      </GlassCard>
    </div>
  )
}
