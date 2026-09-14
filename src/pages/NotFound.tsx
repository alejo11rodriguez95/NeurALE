import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-28 text-center">
      <span className="font-display text-6xl font-semibold text-neurale-red">
        404
      </span>
      <p className="text-white/60">
        Esta pantalla no existe dentro de NeurALE.
      </p>
      <Link
        to="/"
        className="rounded-full border border-neurale-border bg-neurale-surface px-4 py-2 text-sm text-white/80 transition-colors hover:border-neurale-gold/60 hover:text-neurale-gold"
      >
        Volver al Núcleo Neuronal
      </Link>
    </div>
  )
}
