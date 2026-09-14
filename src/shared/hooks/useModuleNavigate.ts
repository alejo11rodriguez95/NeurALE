import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => void
}

/**
 * Navega entre el hub y los módulos usando la View Transitions API cuando el
 * navegador la soporta (crossfade nativo entre vistas), con fallback silencioso a
 * una navegación normal — la animación de entrada `.neural-enter` (PageTransition)
 * siempre se aplica de cualquier forma.
 */
export function useModuleNavigate() {
  const navigate = useNavigate()

  return useCallback(
    (path: string) => {
      const doc = document as DocumentWithViewTransition
      if (typeof doc.startViewTransition === 'function') {
        doc.startViewTransition(() => navigate(path))
      } else {
        navigate(path)
      }
    },
    [navigate],
  )
}
