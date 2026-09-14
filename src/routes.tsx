import { createBrowserRouter } from 'react-router-dom'

import DashboardModule from '@/modules/dashboard'
import InboundModule from '@/modules/inbound'
import InventoryModule from '@/modules/inventory'
import OutboundModule from '@/modules/outbound'
import PickingModule from '@/modules/picking'
import StorageModule from '@/modules/storage'
import NotFound from '@/pages/NotFound'
import NucleoNeuronal from '@/pages/NucleoNeuronal'
import { AppLayout } from '@/shared/layout/AppLayout'

/**
 * Enrutamiento de toda la app. Cada módulo de negocio se agrega aquí como una
 * ruta hija del `AppLayout` (nav + transición compartidos) — ver
 * `src/shared/modules.ts` para la convención de módulos nuevos.
 */
export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <NucleoNeuronal /> },
      { path: '/inbound', element: <InboundModule /> },
      { path: '/storage', element: <StorageModule /> },
      { path: '/picking', element: <PickingModule /> },
      { path: '/outbound', element: <OutboundModule /> },
      { path: '/inventory', element: <InventoryModule /> },
      { path: '/dashboard', element: <DashboardModule /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
