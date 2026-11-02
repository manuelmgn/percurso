import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, Link } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { Layout } from '@/components/Layout'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useAuth } from '@/context/AuthContext'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import {
  ListPageSkeleton,
  DetailPageSkeleton,
  FormPageSkeleton,
  StatsPageSkeleton,
} from '@/components/ui/Skeleton'

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

// Branded splash for the auth bootstrap on a cold load.
function FullscreenLoading() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4" role="status" aria-label={t('loading')}>
      <img src="/images/percurso-icono.svg" alt="" className="h-12 w-12 animate-pulse" />
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
            <Layout />
          </ProtectedRoute>
        }
      >
        {/* Per-route Suspense: a lazy chunk loading only swaps the page area —
            the sidebar/header chrome stays mounted (a boundary around Layout
            would flash the whole shell on every navigation). */}
        <Route index element={<DashboardPage />} />
        <Route path="viagens" element={<Suspense fallback={<ListPageSkeleton />}><TripsPage /></Suspense>} />
        <Route path="viagens/novo" element={<Suspense fallback={<FormPageSkeleton />}><TripEditPage /></Suspense>} />
        <Route path="viagens/:id" element={<Suspense fallback={<DetailPageSkeleton />}><TripDetailPage /></Suspense>} />
        <Route path="viagens/:id/editar" element={<Suspense fallback={<FormPageSkeleton />}><TripEditPage /></Suspense>} />
        <Route path="projetos" element={<Suspense fallback={<ListPageSkeleton />}><ProjectsPage /></Suspense>} />
        <Route path="projetos/novo" element={<Suspense fallback={<FormPageSkeleton />}><ProjectEditPage /></Suspense>} />
        <Route path="projetos/:id" element={<Suspense fallback={<DetailPageSkeleton />}><ProjectDetailPage /></Suspense>} />
        <Route path="projetos/:id/editar" element={<Suspense fallback={<FormPageSkeleton />}><ProjectEditPage /></Suspense>} />
        <Route path="lugares" element={<Suspense fallback={<ListPageSkeleton />}><PlacesPage /></Suspense>} />
        <Route path="lugares/:id" element={<Suspense fallback={<DetailPageSkeleton />}><PlaceDetailPage /></Suspense>} />
        <Route path="estatisticas" element={<Suspense fallback={<StatsPageSkeleton />}><StatsPage /></Suspense>} />
        <Route path="pesquisa" element={<Suspense fallback={<ListPageSkeleton />}><SearchPage /></Suspense>} />
        <Route path="notificacoes" element={<Suspense fallback={<ListPageSkeleton />}><NotificationsPage /></Suspense>} />
        <Route path="definicoes" element={<Suspense fallback={<DetailPageSkeleton />}><SettingsPage /></Suspense>} />
        <Route path="ajustes" element={<Navigate to="/definicoes" replace />} />
        <Route path="perfil" element={<Navigate to="/definicoes" replace />} />
        <Route path="settings" element={<Navigate to="/definicoes" replace />} />
        <Route path="utilizadores/:username" element={<Suspense fallback={<DetailPageSkeleton />}><UserProfilePage /></Suspense>} />
        <Route path="admin" element={<ProtectedRoute adminOnly><Suspense fallback={<ListPageSkeleton />}><AdminPage /></Suspense></ProtectedRoute>} />
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
