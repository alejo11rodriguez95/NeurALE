import { BrainCore } from '@/shared/components/BrainCore'
import { Dendrites } from '@/shared/components/Dendrites'
import { GlassCard } from '@/shared/components/GlassCard'
import { useModuleNavigate } from '@/shared/hooks/useModuleNavigate'
import {
  DASHBOARD_MODULE,
  MODULES,
  withAlpha,
  type ModuleDef,
  type ModuleId,
} from '@/shared/modules'

/** Trazo de la vía neuronal dentro de un tramo (viewBox 0 0 90 260). */
const SPINE_LEFT = 'M45 0C31 46 59 96 45 140C31 184 56 216 45 260'
const SPINE_RIGHT = 'M45 0C59 46 31 96 45 140C59 184 34 216 45 260'

function Spine({
  from,
  to,
  index,
  className = '',
}: {
  from: string
  to: string
  index: number
  className?: string
}) {
  const id = `spine-grad-${index}`
  const d = index % 2 === 0 ? SPINE_RIGHT : SPINE_LEFT

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 90 260"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute top-0 left-1/2 z-0 h-full w-[90px] -translate-x-1/2 ${className}`}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <path
        d={d}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="2.5"
        opacity="0.4"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={d}
        fill="none"
        stroke={to}
        strokeWidth="3"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className="spine-pulse"
        style={{
          strokeDasharray: '5 300',
          ['--travel' as string]: '305',
          ['--dur' as string]: '3.6s',
          ['--delay' as string]: `${index * 0.55}s`,
        }}
      />
    </svg>
  )
}

function ModuleNode({
  module,
  index,
  previousColor,
  onEnter,
}: {
  module: ModuleDef<ModuleId>
  index: number
  previousColor: string
  onEnter: () => void
}) {
  const side = index % 2 === 0 ? 'right' : 'left'

  return (
    <li className="relative flex min-h-[300px] flex-col items-center justify-center gap-5 md:grid md:min-h-[250px] md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-10">
      <Spine from={previousColor} to={module.color} index={index} />

      {/* Cuerpo neuronal */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onEnter}
        className="group relative z-10 flex h-24 w-24 cursor-pointer items-center justify-center md:col-start-2 md:row-start-1"
      >
        <Dendrites
          color={module.color}
          seed={module.id}
          className="pointer-events-none absolute top-1/2 left-1/2 h-[270px] w-[270px] -translate-x-1/2 -translate-y-1/2 opacity-70 transition-opacity duration-700 group-hover:opacity-100 md:h-[330px] md:w-[330px]"
        />
        <span
          className="halo-pulse absolute h-16 w-16 rounded-full"
          style={{
            background: `radial-gradient(circle, ${withAlpha(module.color, 0.5)}, transparent 68%)`,
            ['--dur' as string]: `${3.4 + index * 0.4}s`,
          }}
        />
        <span
          className="relative block h-[18px] w-[18px] rounded-full transition-transform duration-500 group-hover:scale-125"
          style={{
            background: module.color,
            boxShadow: `0 0 18px 5px ${withAlpha(module.color, 0.7)}`,
          }}
        />
      </button>

      {/* Ficha del módulo */}
      <button
        type="button"
        onClick={onEnter}
        className={`group relative z-10 cursor-pointer md:row-start-1 ${
          side === 'left'
            ? 'md:col-start-1 md:justify-self-end'
            : 'md:col-start-3 md:justify-self-start'
        }`}
      >
        <GlassCard
          className="w-[min(86vw,330px)] p-5 text-left transition-all duration-500 group-hover:-translate-y-1"
          style={{
            borderColor: withAlpha(module.color, 0.3),
            boxShadow: `0 10px 40px -12px ${withAlpha(module.color, 0.45)}`,
          }}
        >
          <span
            className="block text-[10px] tracking-[0.28em] uppercase"
            style={{ color: module.color }}
          >
            {module.tagline}
          </span>
          <h2 className="mt-1.5 font-display text-xl font-semibold text-white">
            {module.label}
          </h2>
          <p className="mt-1.5 text-sm leading-snug text-white/50">
            {module.description}
          </p>
          <span
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium opacity-70 transition-opacity group-hover:opacity-100"
            style={{ color: module.color }}
          >
            Entrar al módulo
            <span className="transition-transform duration-500 group-hover:translate-x-1">
              →
            </span>
          </span>
        </GlassCard>
      </button>
    </li>
  )
}

export default function NucleoNeuronal() {
  const goTo = useModuleNavigate()

  return (
    <div className="relative overflow-x-clip">
      {/* Cerebro: Núcleo Neuronal + acceso al Dashboard gerencial.
          El texto va ARRIBA del cerebro para que el tallo baje limpio hacia los
          módulos, sin cruzar ningún título. */}
      <section className="relative flex flex-col items-center px-4 pt-6 sm:pt-10">
        <button
          type="button"
          onClick={() => goTo(DASHBOARD_MODULE.path)}
          className="group relative flex cursor-pointer flex-col items-center"
        >
          <span className="text-[10px] tracking-[0.4em] text-white/35 uppercase">
            NeurALE · CD NNEO
          </span>
          <h1 className="mt-2 font-display text-3xl font-semibold text-white sm:text-4xl">
            Núcleo Neuronal
          </h1>
          <span
            className="mt-3 rounded-full border px-4 py-1.5 text-[11px] tracking-[0.18em] uppercase transition-all duration-500 group-hover:brightness-125"
            style={{
              color: DASHBOARD_MODULE.color,
              borderColor: withAlpha(DASHBOARD_MODULE.color, 0.35),
              background: withAlpha(DASHBOARD_MODULE.color, 0.07),
            }}
          >
            {DASHBOARD_MODULE.label} · Gerencia
          </span>
          <p className="mt-4 max-w-xs text-center text-sm text-white/40 sm:max-w-sm">
            La corteza que integra la actividad de todos los módulos.
          </p>

          <BrainCore
            color={DASHBOARD_MODULE.color}
            className="mt-2 w-[290px] transition-transform duration-700 group-hover:scale-[1.03] sm:w-[400px] md:w-[460px]"
          />
        </button>
      </section>

      {/* Tramo del tallo al primer módulo */}
      <div className="relative h-20 sm:h-24">
        <Spine
          from={DASHBOARD_MODULE.color}
          to={MODULES[0].color}
          index={-1}
          className="opacity-90"
        />
      </div>

      {/* Vía neuronal descendente con los módulos */}
      <ol className="relative mx-auto max-w-5xl px-4 pb-4">
        {MODULES.map((module, i) => (
          <ModuleNode
            key={module.id}
            module={module}
            index={i}
            previousColor={
              i === 0 ? DASHBOARD_MODULE.color : MODULES[i - 1].color
            }
            onEnter={() => goTo(module.path)}
          />
        ))}
      </ol>

      {/* Terminal: la operación */}
      <section className="relative flex flex-col items-center pb-16">
        {/* El trazo termina aquí; el orbe y la etiqueta van debajo, sin cruces. */}
        <div className="relative h-24 w-full sm:h-28">
          <Spine
            from={MODULES[MODULES.length - 1].color}
            to="#e30613"
            index={MODULES.length}
          />
        </div>
        <div className="relative flex flex-col items-center gap-4">
          <span className="relative flex h-6 w-6 items-center justify-center">
            <span
              className="halo-pulse absolute h-20 w-20 rounded-full"
              style={{
                background:
                  'radial-gradient(circle, rgba(227,6,19,0.5), transparent 68%)',
              }}
            />
            <span
              className="relative block h-4 w-4 rounded-full bg-neurale-red"
              style={{ boxShadow: '0 0 26px 8px rgba(227,6,19,0.55)' }}
            />
          </span>
          <span className="text-[10px] tracking-[0.35em] text-white/40 uppercase">
            Operación CD NNEO
          </span>
        </div>
      </section>
    </div>
  )
}
