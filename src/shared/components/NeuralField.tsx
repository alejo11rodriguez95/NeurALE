import { useMemo } from 'react'

import { growDendrites, type NeuralBranch } from '@/shared/lib/neuralPaths'
import { hashSeed, mulberry32 } from '@/shared/lib/rng'
import { withAlpha } from '@/shared/modules'

interface Cell {
  x: number
  y: number
  r: number
  branches: NeuralBranch[]
}

function buildLayer(seed: number, cells: number, scale: number): Cell[] {
  const rnd = mulberry32(seed)
  return Array.from({ length: cells }, (_, i) => {
    const x = 40 + rnd() * 1120
    const y = 40 + rnd() * 820
    const r = (8 + rnd() * 8) * scale
    return {
      x,
      y,
      r,
      branches: growDendrites({
        origin: [x, y],
        count: 7 + Math.floor(rnd() * 4),
        length: (160 + rnd() * 150) * scale,
        soma: r,
        depth: 3,
        seed: seed + i * 977,
        rotation: rnd() * Math.PI,
      }),
    }
  })
}

/**
 * Tejido neuronal de fondo para las pantallas internas de cada módulo: neuronas
 * con sus dendritas, en dos capas (una lejana y difusa, otra cercana y luminosa),
 * teñidas con el color del módulo. Generado proceduralmente y determinista.
 */
export function NeuralField({
  color,
  seed,
  className = '',
}: {
  color: string
  seed: string
  className?: string
}) {
  const base = hashSeed(seed)
  const far = useMemo(() => buildLayer(base + 17, 11, 0.7), [base])
  const near = useMemo(() => buildLayer(base + 4021, 7, 1.2), [base])

  const renderCells = (cells: Cell[], strokeOpacity: number) => (
    <>
      <g fill="none" stroke={color} strokeLinecap="round">
        {cells.flatMap((cell, ci) =>
          cell.branches.map((b, bi) => (
            <path
              key={`${ci}-${bi}`}
              d={b.d}
              strokeWidth={b.width}
              opacity={b.opacity * strokeOpacity}
            />
          )),
        )}
      </g>
      {cells.map((cell, ci) => (
        <g key={ci}>
          <circle
            cx={cell.x}
            cy={cell.y}
            r={cell.r * 3.4}
            fill={withAlpha(color, 0.13)}
          />
          <circle
            cx={cell.x}
            cy={cell.y}
            r={cell.r * 1.5}
            fill={withAlpha(color, 0.35)}
          />
          <circle cx={cell.x} cy={cell.y} r={cell.r} fill={withAlpha(color, 0.8)} />
          <circle
            cx={cell.x}
            cy={cell.y}
            r={cell.r * 0.45}
            fill="#ffffff"
            opacity="0.8"
          />
        </g>
      ))}
    </>
  )

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none overflow-hidden ${className}`}
    >
      <svg
        viewBox="0 0 1200 900"
        preserveAspectRatio="xMidYMid slice"
        className="field-drift h-full w-full"
      >
        <defs>
          <filter id={`ff-${seed}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id={`fn-${seed}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id={`fg-${seed}`} cx="50%" cy="32%" r="80%">
            <stop offset="0%" stopColor={withAlpha(color, 0.3)} />
            <stop offset="60%" stopColor={withAlpha(color, 0.09)} />
            <stop offset="100%" stopColor="rgba(5,7,13,0)" />
          </radialGradient>
        </defs>

        <rect width="1200" height="900" fill={`url(#fg-${seed})`} />
        <g filter={`url(#ff-${seed})`} opacity="0.55">
          {renderCells(far, 0.85)}
        </g>
        <g filter={`url(#fn-${seed})`} opacity="0.8">
          {renderCells(near, 1)}
        </g>
      </svg>
    </div>
  )
}
