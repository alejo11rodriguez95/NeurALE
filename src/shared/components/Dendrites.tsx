import { useMemo } from 'react'

import { growDendrites } from '@/shared/lib/neuralPaths'
import { hashSeed } from '@/shared/lib/rng'
import { withAlpha } from '@/shared/modules'

/**
 * Corona de dendritas que rodea al nodo de un módulo en el Núcleo Neuronal.
 * El patrón depende de la semilla, así que cada módulo tiene su propia forma
 * pero siempre la misma.
 */
export function Dendrites({
  color,
  seed,
  className = '',
}: {
  color: string
  seed: string
  className?: string
}) {
  const branches = useMemo(
    () =>
      growDendrites({
        origin: [170, 170],
        count: 9,
        length: 70,
        soma: 24,
        depth: 2,
        seed: hashSeed(seed),
      }),
    [seed],
  )

  return (
    <svg
      viewBox="0 0 340 340"
      className={className}
      aria-hidden="true"
      role="presentation"
    >
      <g fill="none" stroke={color} strokeLinecap="round">
        {branches.map((b, i) => (
          <path
            key={i}
            d={b.d}
            strokeWidth={b.width}
            opacity={b.opacity * 0.85}
          />
        ))}
      </g>
      {/* Terminales sinápticos */}
      <g fill={withAlpha(color, 0.75)}>
        {branches
          .filter((b) => b.level >= 2)
          .filter((_, i) => i % 3 === 0)
          .map((b, i) => (
            <circle key={i} cx={b.end[0]} cy={b.end[1]} r="1.6" opacity="0.6" />
          ))}
      </g>
    </svg>
  )
}
