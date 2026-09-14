import { useMemo } from 'react'

import { mulberry32 } from '@/shared/lib/rng'

/**
 * Campo de estrellas del fondo: capa fija detrás de todo, con parpadeo suave y dos
 * nebulosas tenues. Determinista — el cielo es siempre el mismo.
 */
export function Starfield({ count = 180 }: { count?: number }) {
  const stars = useMemo(() => {
    const rnd = mulberry32(20260914)
    return Array.from({ length: count }, () => ({
      left: rnd() * 100,
      top: rnd() * 100,
      size: 0.7 + rnd() * 1.9,
      dur: 3 + rnd() * 7,
      delay: rnd() * 8,
      min: 0.06 + rnd() * 0.18,
      max: 0.45 + rnd() * 0.5,
    }))
  }, [count])

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-neurale-bg"
    >
      {/* Nebulosas */}
      <div className="absolute -top-[10%] left-1/2 h-[70vh] w-[120vw] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(45,212,191,0.10),transparent_62%)]" />
      <div className="absolute bottom-[-15%] left-1/2 h-[80vh] w-[120vw] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(244,63,94,0.08),transparent_62%)]" />

      {stars.map((s, i) => (
        <span
          key={i}
          className="star absolute rounded-full bg-white"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            ['--dur' as string]: `${s.dur}s`,
            ['--delay' as string]: `${s.delay}s`,
            ['--star-min' as string]: s.min,
            ['--star-max' as string]: s.max,
          }}
        />
      ))}
    </div>
  )
}
