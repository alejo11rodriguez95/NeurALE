import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Aplica la animación de entrada compartida (fundido + escala, `.neural-enter` en
 * index.css) a cada pantalla al navegar. Se re-dispara en cada cambio de ruta
 * gracias a la `key` sobre el pathname.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation()
  return (
    <div key={location.pathname} className="neural-enter">
      {children}
    </div>
  )
}
