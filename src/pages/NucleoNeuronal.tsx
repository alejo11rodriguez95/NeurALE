import type { CSSProperties } from 'react'

import { GlassCard } from '@/shared/components/GlassCard'
import { useModuleNavigate } from '@/shared/hooks/useModuleNavigate'
import { MODULES, type ModuleDef } from '@/shared/modules'

// 5 tarjetas repartidas cada 72°, empezando arriba (-90°) y en sentido horario —
// mismo criterio usado para el ícono de la app (ver public/icon-master.svg).
const ANGLES_DEG = [-90, -18, 54, 126, 198]
const RADIUS_PERCENT = 36

function polarPosition(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: 50 + radius * Math.cos(rad),
    y: 50 + radius * Math.sin(rad),
  }
}

function ModuleCard({
  module,
  style,
  onClick,
}: {
  module: ModuleDef
  style?: CSSProperties
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className="group absolute flex w-32 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 rounded-2xl border border-neurale-border bg-neurale-surface px-3 py-4 text-center backdrop-blur-md transition-all duration-300 ease-out hover:-translate-y-[calc(50%+4px)] hover:border-neurale-gold/60 hover:shadow-[0_0_24px_rgba(237,180,11,0.25)] sm:w-40 sm:py-5"
    >
      <span className="h-2 w-2 rounded-full bg-neurale-gold transition-shadow group-hover:shadow-[0_0_10px_rgba(237,180,11,0.8)]" />
      <span className="font-display text-sm font-semibold text-white sm:text-base">
        {module.label}
      </span>
      <span className="hidden text-[11px] leading-tight text-white/50 sm:block">
        {module.description}
      </span>
    </button>
  )
}

export default function NucleoNeuronal() {
  const goTo = useModuleNavigate()

  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center gap-10 px-4 py-10 sm:py-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="rounded-full border border-neurale-border bg-neurale-surface px-4 py-1 text-xs tracking-[0.2em] text-neurale-gold uppercase">
          Núcleo Neuronal
        </span>
        <h1 className="font-display text-3xl font-semibold text-white sm:text-4xl">
          Centro de Distribución NNEO
        </h1>
        <p className="max-w-md text-sm text-white/50">
          Selecciona un módulo para entrar a su región de operación.
        </p>
      </div>

      {/* Hub circular — pantallas medianas y grandes */}
      <div className="relative hidden aspect-square w-full max-w-[720px] md:block">
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="pulse-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#EDB40B" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#E30613" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          {ANGLES_DEG.map((angle) => {
            const { x, y } = polarPosition(angle, RADIUS_PERCENT)
            return (
              <line
                key={angle}
                x1={50}
                y1={50}
                x2={x}
                y2={y}
                stroke="url(#pulse-grad)"
                strokeWidth={0.5}
                className="neural-pulse-line"
              />
            )
          })}
        </svg>

        {/* Núcleo central */}
        <div className="neural-core-glow absolute top-1/2 left-1/2 flex h-32 w-32 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full border border-neurale-red/50 bg-neurale-bg text-center">
          <span className="font-display text-lg font-bold text-neurale-red">
            NNEO
          </span>
          <span className="text-[10px] tracking-[0.15em] text-white/40 uppercase">
            Núcleo
          </span>
        </div>

        {MODULES.map((module, i) => {
          const { x, y } = polarPosition(ANGLES_DEG[i], RADIUS_PERCENT)
          return (
            <ModuleCard
              key={module.id}
              module={module}
              style={{ left: `${x}%`, top: `${y}%` }}
              onClick={() => goTo(module.path)}
            />
          )
        })}
      </div>

      {/* Lista apilada — pantallas pequeñas */}
      <div className="flex w-full flex-col gap-4 md:hidden">
        <GlassCard className="flex flex-col items-center gap-1 p-6 text-center">
          <span className="font-display text-lg font-bold text-neurale-red">
            NNEO
          </span>
          <span className="text-[10px] tracking-[0.15em] text-white/40 uppercase">
            Núcleo
          </span>
        </GlassCard>
        {MODULES.map((module) => (
          <button
            key={module.id}
            type="button"
            onClick={() => goTo(module.path)}
            className="text-left"
          >
            <GlassCard className="flex items-center gap-3 p-4 transition-colors active:border-neurale-gold/60">
              <span className="h-2 w-2 shrink-0 rounded-full bg-neurale-gold" />
              <span className="flex flex-col">
                <span className="font-display text-base font-semibold text-white">
                  {module.label}
                </span>
                <span className="text-xs text-white/50">
                  {module.description}
                </span>
              </span>
            </GlassCard>
          </button>
        ))}
      </div>
    </div>
  )
}
