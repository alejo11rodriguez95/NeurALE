import { RouterProvider } from 'react-router-dom'

import { AuthProvider } from '@/shared/auth/AuthContext'

import { router } from './routes'

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}

export default App
