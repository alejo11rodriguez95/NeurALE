import { createBrowserRouter } from 'react-router-dom'

import AdminModule from '@/modules/admin'
import DashboardModule from '@/modules/dashboard'
import InboundModule from '@/modules/inbound'
import InventoryModule from '@/modules/inventory'
import OutboundModule from '@/modules/outbound'
import PickingModule from '@/modules/picking'
import StorageModule from '@/modules/storage'
import NotFound from '@/pages/NotFound'
import NucleoNeuronal from '@/pages/NucleoNeuronal'
import Login from '@/pages/Login'
import { AppLayout } from '@/shared/layout/AppLayout'
import {
  RequireAccess,
  allowAdminSection,
  allowDashboard,
  allowModule,
} from '@/shared/auth/RequireAccess'

/**
 * Enrutamiento de toda la app. Cada módulo de negocio se agrega aquí como una
 * ruta hija del `AppLayout` (nav + transición compartidos) — ver
 * `src/shared/modules.ts` para la convención de módulos nuevos.
 *
 * Desde la decisión 2026-09-16 (ver ARCHITECTURE.md → "Roles y accesos"), el
 * Núcleo Neuronal (`/`) sigue público, pero entrar a un módulo, al Dashboard
 * o a Configuraciones y Administradores exige sesión — de eso se encarga
 * `RequireAccess` envolviendo cada uno.
 */
export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <NucleoNeuronal /> },
      { path: '/login', element: <Login /> },
      {
        path: '/inbound',
        element: (
          <RequireAccess allow={allowModule('inbound')}>
            <InboundModule />
          </RequireAccess>
        ),
      },
      {
        path: '/storage',
        element: (
          <RequireAccess allow={allowModule('storage')}>
            <StorageModule />
          </RequireAccess>
        ),
      },
      {
        path: '/picking',
        element: (
          <RequireAccess allow={allowModule('picking')}>
            <PickingModule />
          </RequireAccess>
        ),
      },
      {
        path: '/outbound',
        element: (
          <RequireAccess allow={allowModule('outbound')}>
            <OutboundModule />
          </RequireAccess>
        ),
      },
      {
        path: '/inventory',
        element: (
          <RequireAccess allow={allowModule('inventory')}>
            <InventoryModule />
          </RequireAccess>
        ),
      },
      {
        path: '/dashboard',
        element: (
          <RequireAccess allow={allowDashboard}>
            <DashboardModule />
          </RequireAccess>
        ),
      },
      {
        path: '/admin',
        element: (
          <RequireAccess allow={allowAdminSection}>
            <AdminModule />
          </RequireAccess>
        ),
      },
      { path: '*', element: <NotFound /> },
    ],
  },
])
