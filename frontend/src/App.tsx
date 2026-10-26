import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, Link } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { Layout } from '@/components/Layout'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useAuth } from '@/context/AuthContext'
import { PageSpinner } from '@/components/ui/PageSpinner'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'

// Pages are lazy-loaded per route to keep the initial bundle small.
const TripsPage = lazy(() => import('@/pages/TripsPage').then((m) => ({ default: m.TripsPage })))
const TripDetailPage = lazy(() => import('@/pages/TripDetailPage').then((m) => ({ default: m.TripDetailPage })))
const TripEditPage = lazy(() => import('@/pages/TripEditPage').then((m) => ({ default: m.TripEditPage })))
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })))
const ProjectDetailPage = lazy(() => import('@/pages/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })))
const ProjectEditPage = lazy(() => import('@/pages/ProjectEditPage').then((m) => ({ default: m.ProjectEditPage })))
const PlacesPage = lazy(() => import('@/pages/PlacesPage').then((m) => ({ default: m.PlacesPage })))
const PlaceDetailPage = lazy(() => import('@/pages/PlaceDetailPage').then((m) => ({ default: m.PlaceDetailPage })))
const StatsPage = lazy(() => import('@/pages/StatsPage').then((m) => ({ default: m.StatsPage })))
const SearchPage = lazy(() => import('@/pages/SearchPage').then((m) => ({ default: m.SearchPage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const UserProfilePage = lazy(() => import('@/pages/UserProfilePage').then((m) => ({ default: m.UserProfilePage })))
const AdminPage = lazy(() => import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage })))
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })))

// Cheap suspense placeholder for lazy chunks.
function PageFallback() {
  return <PageSpinner />
}

function FullscreenLoading() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label={t('loading')}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span className="sr-only">{t('loadingGeneric')}</span>
    </div>
  )
}

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <FullscreenLoading />
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
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <FullscreenLoading />
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export default function App() {
  const { t } = useTranslation()

  return (
    <ErrorBoundary
      fallback={(reload) => (
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="card mx-auto max-w-md p-8 text-center">
            <h1 className="font-display text-xl font-bold">{t('errors.loadFailedTitle')}</h1>
            <p className="mt-2 text-sm text-muted">
              {t('errors.loadFailedMessage')}
            </p>
            <button type="button" onClick={reload} className="btn-primary mt-6">
              {t('errors.reload')}
            </button>
          </div>
        </div>
      )}
    >
      <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Suspense fallback={<PageFallback />}>
              <Layout />
            </Suspense>
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
        <Route path="notificacoes" element={<NotificationsPage />} />
        <Route path="definicoes" element={<SettingsPage />} />
        <Route path="ajustes" element={<Navigate to="/definicoes" replace />} />
        <Route path="perfil" element={<Navigate to="/definicoes" replace />} />
        <Route path="settings" element={<Navigate to="/definicoes" replace />} />
        <Route path="utilizadores/:username" element={<UserProfilePage />} />
        <Route path="admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
        <Route
          path="*"
          element={
            <div className="card mx-auto max-w-md p-8 text-center">
              <p className="text-muted">{t('pageNotFound')}</p>
              <Link
                to="/"
                className="mt-4 inline-block text-sm font-medium text-primary-700 hover:underline dark:text-primary-300"
              >
                {t('common.backHome')}
              </Link>
            </div>
          }
        />
      </Route>
      </Routes>
    </ErrorBoundary>
  )
}
