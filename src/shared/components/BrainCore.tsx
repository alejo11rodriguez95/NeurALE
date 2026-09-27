import { useId, type KeyboardEvent } from 'react'

import {
  BRAIN_LEFT,
  BRAIN_RIGHT,
  BRAIN_STEM,
  FISSURE_GAP,
  type BrainHemisphere,
} from '@/shared/brain/brainGraph'
import { withAlpha } from '@/shared/modules'

export type HemisphereSide = 'left' | 'right'

export interface HemisphereConfig {
  /** Color base de esa mitad: relleno y resplandor (el tono "de cuerpo"). */
  color: string
  /**
   * Tono claro del mismo color, para los trazos: contorno, conexiones y nodos.
   * Sobre un fondo casi negro, un rojo o un azul saturados se apagan en líneas
   * de medio píxel; el tono claro es lo que hace que la red se lea.
   */
  glow: string
  /** Nombre del destino — lo usa el lector de pantalla. */
  label: string
  /** Si es false, la mitad se ve y responde al hover, pero no navega ni recibe foco. */
  enabled?: boolean
}

interface BrainCoreProps {
  left: HemisphereConfig
  right: HemisphereConfig
  /** Mitad resaltada. Lo controla la pantalla, para que las etiquetas de fuera del
   *  SVG y los hemisferios se enciendan juntos. */
  active: HemisphereSide | null
  onActiveChange: (side: HemisphereSide | null) => void
  onSelect: (side: HemisphereSide) => void
  className?: string
}

function Hemisphere({
  side,
  data,
  config,
  state,
  uid,
  onActiveChange,
  onSelect,
}: {
  side: HemisphereSide
  data: BrainHemisphere
  config: HemisphereConfig
  state: 'active' | 'dimmed' | 'idle'
  uid: string
  onActiveChange: (side: HemisphereSide | null) => void
  onSelect: (side: HemisphereSide) => void
}) {
  // `line` dibuja (contorno, conexiones, nodos) y `body` tiñe (relleno, halo).
  const line = config.glow
  const body = config.color
  const enabled = config.enabled !== false
  const isActive = state === 'active'

  // Cada mitad se aparta del eje; al activarse se aparta un poco más y abre la fisura.
  const dir = side === 'left' ? -1 : 1
  const gap = isActive ? FISSURE_GAP.active : FISSURE_GAP.rest

  const handleKey = (e: KeyboardEvent<SVGGElement>) => {
    if (!enabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(side)
    }
  }

  return (
    <g
      className="hemi"
      style={{
        transform: `translateX(${dir * gap}px)`,
        opacity: state === 'dimmed' ? 0.45 : 1,
        cursor: enabled ? 'pointer' : 'default',
      }}
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
      {/* Resplandor de la mitad activa */}
      <path
        d={data.outline}
        fill="none"
        stroke={body}
        strokeWidth="5"
        filter={`url(#${uid}-bloom)`}
        style={{
          opacity: isActive ? 0.6 : 0,
          transition: 'opacity 0.45s var(--ease-neural)',
        }}
      />

      <g filter={`url(#${uid}-glow)`}>
        {/* Contorno: también es el área clicable */}
        <path
          d={data.outline}
          fill={`url(#${uid}-fill-${side})`}
          stroke={line}
          strokeWidth="0.9"
          style={{
            opacity: isActive ? 1 : 0.8,
            transition: 'opacity 0.45s var(--ease-neural)',
          }}
        />

        {/* Conexiones */}
        <g
          stroke={line}
          strokeWidth="0.5"
          style={{
            opacity: isActive ? 0.75 : 0.42,
            transition: 'opacity 0.45s var(--ease-neural)',
          }}
        >
          {data.edges.map(([a, b], i) => (
            <line
              key={i}
              x1={data.nodes[a][0]}
              y1={data.nodes[a][1]}
              x2={data.nodes[b][0]}
              y2={data.nodes[b][1]}
            />
          ))}
        </g>

        {/* Cuerpos neuronales */}
        <g fill={line} opacity="0.7">
          {data.nodes.map(([x, y], i) =>
            data.hubs.includes(i) ? null : (
              <circle key={i} cx={x} cy={y} r="1.5" />
            ),
          )}
        </g>

        {/* Nodos destacados: laten */}
        {data.hubs.map((i, k) => (
          <g key={i}>
            <circle
              cx={data.nodes[i][0]}
              cy={data.nodes[i][1]}
              r="5"
              fill={withAlpha(line, isActive ? 0.42 : 0.28)}
              className="soma-pulse"
              style={{
                ['--dur' as string]: `${2.6 + (k % 5) * 0.55}s`,
                ['--delay' as string]: `${(k % 7) * 0.4}s`,
              }}
            />
            <circle
              cx={data.nodes[i][0]}
              cy={data.nodes[i][1]}
              r="2.3"
              fill="#ffffff"
              opacity="0.92"
            />
          </g>
        ))}
      </g>

      {/* Anillo de foco de teclado: sigue el contorno, no un rectángulo */}
      <path
        className="hemi-ring"
        d={data.outline}
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.4"
        strokeDasharray="4 3"
      />
    </g>
  )
}

/**
 * El cerebro del Núcleo Neuronal, dibujado como una red: nodos y conexiones
 * muestreados dentro del contorno cerebral (ver `shared/brain/brainGraph.ts`).
 * No es una imagen — es SVG, así que escala sin perder nitidez y late.
 *
 * Se divide en dos hemisferios clicables e independientes: el derecho (rojo)
 * abre el Dashboard Neuronal y el izquierdo (azul) la sección de Configuraciones
 * y Administradores. La división no es un corte añadido: el grafo se generó con
 * la fisura ya presente (ninguna conexión cruza de un lado al otro), así que
 * cada mitad es un subgrafo completo por sí mismo.
 *
 * El cerebro no lleva ningún texto encima: el nombre de cada mitad lo pone la
 * pantalla, debajo, y solo mientras esa mitad está activa.
 */
export function BrainCore({
  left,
  right,
  active,
  onActiveChange,
  onSelect,
  className = '',
}: BrainCoreProps) {
  const uid = useId().replace(/:/g, '')

  const stateOf = (side: HemisphereSide): 'active' | 'dimmed' | 'idle' =>
    active === null ? 'idle' : active === side ? 'active' : 'dimmed'

  return (
    <svg viewBox="-118 -112 236 186" className={className}>
      <defs>
        <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={`${uid}-bloom`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        {/* La fisura es un rectángulo muy angosto: si la región del filtro se define
            en porcentajes, el desenfoque se recorta y el canal sale como una línea
            dura. Por eso aquí la región va en unidades del propio viewBox. */}
        <filter
          id={`${uid}-fissure-blur`}
          filterUnits="userSpaceOnUse"
          x="-26"
          y="-100"
          width="52"
          height="160"
        >
          <feGaussianBlur stdDeviation="4.2" />
        </filter>
        <radialGradient id={`${uid}-fill-left`} cx="62%" cy="38%" r="70%">
          <stop offset="0%" stopColor={withAlpha(left.color, 0.3)} />
          <stop offset="100%" stopColor={withAlpha(left.color, 0.04)} />
        </radialGradient>
        <radialGradient id={`${uid}-fill-right`} cx="38%" cy="38%" r="70%">
          <stop offset="0%" stopColor={withAlpha(right.color, 0.3)} />
          <stop offset="100%" stopColor={withAlpha(right.color, 0.04)} />
        </radialGradient>
        {/* La luz del canal pasa de un color al otro: arriba la mitad derecha,
            abajo la izquierda. Es lo que hace legible que son dos órganos. */}
        <linearGradient id={`${uid}-fissure`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <stop offset="35%" stopColor={withAlpha(right.glow, 0.5)} />
          <stop offset="70%" stopColor={withAlpha(left.glow, 0.45)} />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        {/* El resplandor de fondo toma los dos colores, uno por lado: con un
            solo tono el hemisferio contrario quedaba bañado del color ajeno. */}
        <linearGradient id={`${uid}-halo`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={withAlpha(left.color, 0.11)} />
          <stop offset="42%" stopColor={withAlpha(left.color, 0.05)} />
          <stop offset="58%" stopColor={withAlpha(right.color, 0.05)} />
          <stop offset="100%" stopColor={withAlpha(right.color, 0.11)} />
        </linearGradient>
        <linearGradient id={`${uid}-stem`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={right.glow} />
          <stop offset="100%" stopColor={withAlpha(right.glow, 0.15)} />
        </linearGradient>
      </defs>

      {/* Halo general */}
      <ellipse
        cx="0"
        cy="-18"
        rx="115"
        ry="100"
        fill={`url(#${uid}-halo)`}
        className="halo-pulse"
        style={{ ['--dur' as string]: '7s' }}
      />

      {/* Luz dentro del canal de la fisura: lo que separa ambas mitades no es un
          tajo vacío, es una hendidura iluminada. */}
      {/* La banda va ancha y muy desenfocada a propósito: si fuera angosta y
          nítida se leería como una línea recta dibujada encima del cerebro, no
          como luz saliendo de la hendidura. Termina antes que el contorno para
          que no asome por debajo. */}
      <rect
        x="-2.6"
        y="-82"
        width="5.2"
        height="116"
        fill={`url(#${uid}-fissure)`}
        filter={`url(#${uid}-fissure-blur)`}
        opacity="0.5"
      />

      <g className="mind-breathe">
        <Hemisphere
          side="left"
          data={BRAIN_LEFT}
          config={left}
          state={stateOf('left')}
          uid={uid}
          onActiveChange={onActiveChange}
          onSelect={onSelect}
        />
        <Hemisphere
          side="right"
          data={BRAIN_RIGHT}
          config={right}
          state={stateOf('right')}
          uid={uid}
          onActiveChange={onActiveChange}
          onSelect={onSelect}
        />
      </g>

      {/* Tallo: fuera de los hemisferios, para que la vía neuronal no se mueva
          cuando una mitad reacciona al hover. */}
      <path
        d={BRAIN_STEM}
        fill="none"
        stroke={`url(#${uid}-stem)`}
        strokeWidth="2"
        strokeLinecap="round"
        filter={`url(#${uid}-glow)`}
      />
    </svg>
  )
}
