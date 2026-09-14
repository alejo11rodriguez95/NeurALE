import type { ReactNode } from 'react'

import { NeuralField } from '@/shared/components/NeuralField'
import { withAlpha, type AnyModuleId, type ModuleDef } from '@/shared/modules'

/**
 * Carcasa compartida de toda pantalla de módulo: tejido neuronal de fondo teñido
 * con el color del módulo, encabezado y contenedor del contenido.
 *
 * Convención: el chat de cada módulo construye su pantalla dentro de
 * `<ModuleScreen module={...}>…</ModuleScreen>`, así todos los módulos comparten el
 * mismo lenguaje visual y solo cambia el tono.
 */
export function ModuleScreen({
  module,
  children,
}: {
  module: ModuleDef<AnyModuleId>
  children?: ReactNode
}) {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      {/* Tejido neuronal del módulo */}
      <NeuralField
        color={module.color}
        seed={module.id}
        className="absolute inset-0"
      />
      {/* Velos para que el contenido siempre sea legible sobre el tejido */}
      <div className="absolute inset-0 bg-gradient-to-b from-neurale-bg/85 via-neurale-bg/35 to-neurale-bg/80" />
      <div
        className="absolute inset-x-0 top-0 h-64"
        style={{
          background: `radial-gradient(ellipse at 50% -20%, ${withAlpha(module.color, 0.22)}, transparent 70%)`,
        }}
      />

      <div className="relative mx-auto max-w-5xl px-4 py-12 sm:py-16">
        <header className="flex flex-col items-start gap-3">
          <span className="flex items-center gap-2.5">
            <span
              className="block h-2.5 w-2.5 rounded-full"
              style={{
                background: module.color,
                boxShadow: `0 0 14px 4px ${withAlpha(module.color, 0.65)}`,
              }}
            />
            <span
              className="text-[10px] tracking-[0.3em] uppercase"
              style={{ color: module.color }}
            >
              {module.tagline}
            </span>
          </span>

          <h1
            className="font-display text-4xl font-semibold text-white sm:text-5xl"
            style={{ textShadow: `0 0 38px ${withAlpha(module.color, 0.45)}` }}
          >
            {module.label}
          </h1>

          <p className="max-w-xl text-white/55">{module.description}</p>

          <span
            className="mt-1 block h-px w-24"
            style={{
              background: `linear-gradient(90deg, ${module.color}, transparent)`,
            }}
          />
        </header>

        <div className="mt-10">{children}</div>
      </div>
    </div>
  )
}
