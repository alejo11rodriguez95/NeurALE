import {
  BRAIN_EDGES,
  BRAIN_FISSURE,
  BRAIN_HUBS,
  BRAIN_NODES,
  BRAIN_OUTLINE,
} from '@/shared/brain/brainGraph'
import { withAlpha } from '@/shared/modules'

/**
 * El cerebro del Núcleo Neuronal, dibujado como una red: nodos y conexiones
 * muestreados dentro del contorno cerebral (ver `shared/brain/brainGraph.ts`).
 * No es una imagen — es SVG, así que escala sin perder nitidez y late.
 */
export function BrainCore({
  color = '#5eead4',
  className = '',
}: {
  color?: string
  className?: string
}) {
  const hubSet = new Set(BRAIN_HUBS)

  return (
    <svg
      viewBox="-118 -112 236 186"
      className={className}
      aria-hidden="true"
      role="presentation"
    >
      <defs>
        <filter id="brain-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="brain-fill" cx="50%" cy="38%" r="62%">
          <stop offset="0%" stopColor={withAlpha(color, 0.22)} />
          <stop offset="100%" stopColor={withAlpha(color, 0.03)} />
        </radialGradient>
        <linearGradient id="brain-stem" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor={withAlpha(color, 0.15)} />
        </linearGradient>
      </defs>

      {/* Halo */}
      <ellipse
        cx="0"
        cy="-18"
        rx="115"
        ry="100"
        fill={withAlpha(color, 0.07)}
        className="halo-pulse"
        style={{ ['--dur' as string]: '7s' }}
      />

      <g className="mind-breathe" filter="url(#brain-glow)">
        {/* Contorno */}
        <path
          d={BRAIN_OUTLINE}
          fill="url(#brain-fill)"
          stroke={color}
          strokeWidth="0.9"
          opacity="0.8"
        />
        {/* Fisura interhemisférica */}
        <path
          d={BRAIN_FISSURE}
          fill="none"
          stroke={color}
          strokeWidth="0.8"
          opacity="0.45"
        />

        {/* Conexiones */}
        <g stroke={color} strokeWidth="0.5" opacity="0.42">
          {BRAIN_EDGES.map(([a, b], i) => (
            <line
              key={i}
              x1={BRAIN_NODES[a][0]}
              y1={BRAIN_NODES[a][1]}
              x2={BRAIN_NODES[b][0]}
              y2={BRAIN_NODES[b][1]}
            />
          ))}
        </g>

        {/* Cuerpos neuronales */}
        <g fill={color}>
          {BRAIN_NODES.map(([x, y], i) =>
            hubSet.has(i) ? null : (
              <circle key={i} cx={x} cy={y} r="1.5" opacity="0.7" />
            ),
          )}
        </g>

        {/* Nodos destacados: laten */}
        <g>
          {BRAIN_HUBS.map((i, k) => (
            <g key={i}>
              <circle
                cx={BRAIN_NODES[i][0]}
                cy={BRAIN_NODES[i][1]}
                r="5"
                fill={withAlpha(color, 0.28)}
                className="soma-pulse"
                style={{
                  ['--dur' as string]: `${2.6 + (k % 5) * 0.55}s`,
                  ['--delay' as string]: `${(k % 7) * 0.4}s`,
                }}
              />
              <circle
                cx={BRAIN_NODES[i][0]}
                cy={BRAIN_NODES[i][1]}
                r="2.3"
                fill="#ffffff"
                opacity="0.92"
              />
            </g>
          ))}
        </g>

        {/* Tallo: de aquí baja la vía neuronal hacia los módulos */}
        <path
          d="M0 46C1.5 54 -1.5 62 0 72"
          fill="none"
          stroke="url(#brain-stem)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}
