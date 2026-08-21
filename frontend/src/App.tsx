import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { useAuth } from '@/context/AuthContext'
import { SetupPage } from '@/pages/SetupPage'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { TripsPage } from '@/pages/TripsPage'
import { TripDetailPage } from '@/pages/TripDetailPage'
import { TripEditPage } from '@/pages/TripEditPage'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { ProjectDetailPage } from '@/pages/ProjectDetailPage'
import { ProjectEditPage } from '@/pages/ProjectEditPage'
import { PlacesPage } from '@/pages/PlacesPage'
import { PlaceDetailPage } from '@/pages/PlaceDetailPage'
import { StatsPage } from '@/pages/StatsPage'
import { SearchPage } from '@/pages/SearchPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { AdminPage } from '@/pages/AdminPage'

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, isLoading, isSetupRequired } = useAuth()

  if (isLoading || isSetupRequired === null) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-label="A carregar">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        <span className="sr-only">A carregar...</span>
      </div>
    )
  }

  if (isSetupRequired) {
    return <Navigate to="/setup" replace />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isSetupRequired } = useAuth()

  if (isLoading || isSetupRequired === null) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-label="A carregar">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        <span className="sr-only">A carregar...</span>
      </div>
    )
  }

  if (isSetupRequired) {
    return <Navigate to="/setup" replace />
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="viagens" element={<TripsPage />} />
        <Route path="viagens/novo" element={<TripEditPage />} />
        <Route path="viagens/:id" element={<TripDetailPage />} />
        <Route path="viagens/:id/editar" element={<TripEditPage />} />
        <Route path="projetos" element={<ProjectsPage />} />
        <Route path="projetos/novo" element={<ProjectEditPage />} />
        <Route path="projetos/:id" element={<ProjectDetailPage />} />
        <Route path="projetos/:id/editar" element={<ProjectEditPage />} />
        <Route path="lugares" element={<PlacesPage />} />
        <Route path="lugares/:id" element={<PlaceDetailPage />} />
        <Route path="estatisticas" element={<StatsPage />} />
        <Route path="pesquisa" element={<SearchPage />} />
        <Route path="perfil" element={<ProfilePage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="*" element={<div className="p-8 text-center">Página não encontrada</div>} />
      </Route>
    </Routes>
  )
}
