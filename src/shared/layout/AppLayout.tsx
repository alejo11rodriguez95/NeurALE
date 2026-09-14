import { Outlet } from 'react-router-dom'

import { PageTransition } from '@/shared/components/PageTransition'
import { Starfield } from '@/shared/components/Starfield'

import { NavBar } from './NavBar'

/**
 * Layout compartido por toda la app: campo de estrellas de fondo, nav fijo arriba y
 * contenido de la ruta actual con la transición de entrada estándar. Todos los
 * módulos (y el Núcleo Neuronal) se renderizan dentro de este layout — ver
 * `routes.tsx`.
 */
export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Starfield />
      <NavBar />
      <main className="flex-1">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
    </div>
  )
}
