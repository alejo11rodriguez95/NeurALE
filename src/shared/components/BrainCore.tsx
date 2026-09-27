import type { KeyboardEvent } from 'react'

import { withAlpha } from '@/shared/modules'

export type HemisphereSide = 'left' | 'right'

/** Render del cerebro con sus cables, recortado del fondo blanco original. */
const SRC = '/brand/brain-hero.webp'
const SRC_SMALL = '/brand/brain-hero-small.webp'
/** Proporción del asset, para reservar el espacio y que nada salte al cargar. */
const RATIO = '1672 / 900'
/**
 * Dónde cae la fisura dentro de la imagen, medido sobre el propio archivo.
 * No es exactamente el 50%, así que se usa este valor tanto para partir las dos
 * mitades como para centrar la imagen: si no, el tallo que baja hacia los
 * módulos quedaría desalineado unos píxeles respecto al eje de la página.
 */
const FISSURE = 50.7

export interface HemisphereConfig {
  /** Color de acento de esa mitad. */
  color: string
  /** Tono claro, para el resplandor. */
  glow: string
  /** Nombre del destino — lo usa el lector de pantalla. */
  label: string
  /** Si es false, la mitad se ve y responde al cursor, pero no navega ni recibe foco. */
  enabled?: boolean
}

interface BrainCoreProps {
  left: HemisphereConfig
  right: HemisphereConfig
  /** Mitad resaltada. Lo controla la pantalla, para que el nombre de fuera y la
   *  mitad del cerebro se enciendan juntos. */
  active: HemisphereSide | null
  onActiveChange: (side: HemisphereSide | null) => void
  onSelect: (side: HemisphereSide) => void
  className?: string
}

function Hemisphere({
  side,
  config,
  state,
  onActiveChange,
  onSelect,
}: {
  side: HemisphereSide
  config: HemisphereConfig
  state: 'active' | 'dimmed' | 'idle'
  onActiveChange: (side: HemisphereSide | null) => void
  onSelect: (side: HemisphereSide) => void
}) {
  const enabled = config.enabled !== false
  const isActive = state === 'active'

  // Cada mitad es una copia de la imagen recortada por la fisura.
  const clip =
    side === 'left'
      ? `inset(0 ${100 - FISSURE}% 0 0)`
      : `inset(0 0 0 ${FISSURE}%)`

  const filter = isActive
    ? `brightness(1.18) saturate(1.25) drop-shadow(0 0 26px ${withAlpha(config.glow, 0.55)})`
    : state === 'dimmed'
      ? 'brightness(0.45) saturate(0.55)'
      : 'brightness(1) saturate(1)'

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!enabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(side)
    }
  }

  return (
    <div
      className={`hemi hemi-${side} absolute inset-0`}
      style={{ clipPath: clip, filter, cursor: enabled ? 'pointer' : 'default' }}
      role={enabled ? 'button' : undefined}
      tabIndex={enabled ? 0 : undefined}
      aria-label={enabled ? config.label : undefined}
      onPointerEnter={() => onActiveChange(side)}
      onPointerLeave={() => onActiveChange(null)}
      onFocus={() => onActiveChange(side)}
      onBlur={() => onActiveChange(null)}
      onClick={() => enabled && onSelect(side)}
      onKeyDown={handleKey}
    >
      <img
        src={SRC}
        srcSet={`${SRC_SMALL} 836w, ${SRC} 1672w`}
        sizes="(max-width: 640px) 100vw, 1100px"
        alt=""
        draggable={false}
        className="pointer-events-none h-full w-full select-none"
      />
    </div>
  )
}

/**
 * El cerebro del Núcleo Neuronal: el render con sus cables, recortado sobre
 * fondo transparente y partido por la fisura en dos mitades clicables e
 * independientes — la derecha abre el Dashboard Neuronal y la izquierda la
 * sección de Configuraciones y Administradores.
 *
 * Al activarse, una mitad sube en brillo y saturación, gana un halo de su color
 * y la otra se apaga.
 */
export function BrainCore({
  left,
  right,
  active,
  onActiveChange,
  onSelect,
  className = '',
}: BrainCoreProps) {
  const stateOf = (side: HemisphereSide): 'active' | 'dimmed' | 'idle' =>
    active === null ? 'idle' : active === side ? 'active' : 'dimmed'

  const halo = (side: HemisphereSide, cfg: HemisphereConfig) => (
    <span
      aria-hidden="true"
      className="halo-pulse pointer-events-none absolute top-[46%] h-[46%] w-[26%] -translate-y-1/2 rounded-full blur-2xl"
      style={{
        left: side === 'left' ? '30%' : '70%',
        transform: 'translate(-50%, -50%)',
        background: `radial-gradient(circle, ${withAlpha(cfg.glow, 0.5)}, transparent 70%)`,
        opacity: active === side ? 1 : 0,
        transition: 'opacity 0.45s var(--ease-neural)',
        ['--dur' as string]: '3.2s',
      }}
    />
  )

  // El anillo de foco va FUERA de la mitad recortada: `clip-path` también
  // recortaría el contorno, y entonces no se vería.
  const focusRing = (side: HemisphereSide, cfg: HemisphereConfig) => (
    <span
      aria-hidden="true"
      className={`brain-focus-ring ring-${side} pointer-events-none absolute inset-y-0 rounded-xl border-2 border-dashed`}
      style={{
        left: side === 'left' ? 0 : `${FISSURE}%`,
        width: side === 'left' ? `${FISSURE}%` : `${100 - FISSURE}%`,
        borderColor: withAlpha(cfg.glow, 0.9),
      }}
    />
  )

  return (
    <div
      className={`brain-stage relative ${className}`}
      // La fisura de la imagen no está exactamente en el centro: se corre la
      // pieza completa para que quede sobre el eje de la página, y así el tallo
      // empalme derecho con la vía neuronal de abajo.
      // Se usa `left` y no `transform` para no chocar con el centrado que la
      // pantalla aplica a este mismo elemento en móvil.
      style={{ aspectRatio: RATIO, left: `${(50 - FISSURE).toFixed(2)}%` }}
    >
      {halo('left', left)}
      {halo('right', right)}
      <Hemisphere
        side="left"
        config={left}
        state={stateOf('left')}
        onActiveChange={onActiveChange}
        onSelect={onSelect}
      />
      <Hemisphere
        side="right"
        config={right}
        state={stateOf('right')}
        onActiveChange={onActiveChange}
        onSelect={onSelect}
      />
      {left.enabled !== false && focusRing('left', left)}
      {right.enabled !== false && focusRing('right', right)}
    </div>
  )
}
