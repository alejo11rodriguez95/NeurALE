import { mulberry32 } from './rng'

export interface NeuralBranch {
  /** Atributo `d` del path SVG. */
  d: string
  /** Grosor del trazo. */
  width: number
  /** Opacidad del trazo. */
  opacity: number
  /** Punto final de la rama (terminal sináptico). */
  end: [number, number]
  /** Nivel de ramificación (0 = rama principal). */
  level: number
}

interface GrowOptions {
  /** Punto de origen de las dendritas. */
  origin: [number, number]
  /** Cuántas dendritas principales salen del cuerpo neuronal. */
  count: number
  /** Longitud de las dendritas principales. */
  length: number
  /** Radio del cuerpo neuronal: las dendritas nacen en su borde. */
  soma: number
  /** Niveles de ramificación (0 = sin ramas hijas). */
  depth: number
  /** Semilla para que el dibujo sea estable. */
  seed: number
  /** Rotación inicial en radianes. */
  rotation?: number
}

/**
 * Hace "crecer" un árbol de dendritas alrededor de un punto: ramas principales
 * repartidas en círculo, cada una curvada y con ramas hijas más cortas y finas.
 * Se usa tanto en los nodos de módulo del Núcleo Neuronal como en el tejido de
 * fondo de las pantallas internas.
 */
export function growDendrites({
  origin,
  count,
  length,
  soma,
  depth,
  seed,
  rotation = 0,
}: GrowOptions): NeuralBranch[] {
  const rnd = mulberry32(seed)
  const out: NeuralBranch[] = []

  const grow = (
    x: number,
    y: number,
    angle: number,
    len: number,
    level: number,
  ): void => {
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    // Perpendicular al avance: con ella curvamos la rama en S, que es lo que le da
    // el aspecto orgánico (una curva cuadrática sale demasiado recta).
    const px = -dy
    const py = dx
    const bend = (rnd() - 0.5) * len * 0.55

    const ex = x + dx * len
    const ey = y + dy * len
    const c1x = x + dx * len * 0.33 + px * bend
    const c1y = y + dy * len * 0.33 + py * bend
    const c2x = x + dx * len * 0.68 - px * bend * 0.7
    const c2y = y + dy * len * 0.68 - py * bend * 0.7

    const f = (n: number) => n.toFixed(1)
    out.push({
      d: `M${f(x)} ${f(y)}C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(ex)} ${f(ey)}`,
      width: Math.max(0.4, 1.7 - level * 0.5),
      opacity: Math.max(0.16, 0.72 - level * 0.17),
      end: [ex, ey],
      level,
    })

    if (level >= depth) return
    // La rama hija arranca siguiendo la tangente final de la rama madre.
    const tangent = Math.atan2(ey - c2y, ex - c2x)
    const children = rnd() > 0.35 ? 2 : 1
    for (let i = 0; i < children; i++) {
      const spread = (0.3 + rnd() * 0.5) * (i === 0 ? 1 : -1)
      grow(ex, ey, tangent + spread, len * (0.52 + rnd() * 0.24), level + 1)
    }
  }

  for (let i = 0; i < count; i++) {
    const angle = rotation + (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.45
    grow(
      origin[0] + Math.cos(angle) * soma,
      origin[1] + Math.sin(angle) * soma,
      angle,
      length * (0.7 + rnd() * 0.55),
      0,
    )
  }

  return out
}
