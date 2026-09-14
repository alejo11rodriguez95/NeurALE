/**
 * Generador pseudoaleatorio determinista (mulberry32). Todo el arte procedural de
 * NeurALE — estrellas, dendritas, tejido neuronal — se genera con una semilla fija,
 * de modo que el dibujo es siempre el mismo entre renders, recargas y despliegues.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Convierte un texto (por ejemplo el id de un módulo) en una semilla estable. */
export function hashSeed(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
