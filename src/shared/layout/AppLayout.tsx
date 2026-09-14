import { Outlet } from 'react-router-dom'

import { PageTransition } from '@/shared/components/PageTransition'

import { NavBar } from './NavBar'

/**
 * Layout compartido por toda la app: nav fijo arriba + contenido de la ruta actual
 * con la transición de entrada estándar. Todos los módulos (y el hub) se renderizan
 * dentro de este layout — ver `routes.tsx`.
 */
export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <NavBar />
      <main className="flex-1">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
    </div>
  )
}
