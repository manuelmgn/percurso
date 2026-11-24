import { Suspense } from 'react'
import { Routes, Route, Navigate, Link } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { Layout } from '@/components/Layout'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { RouteSuspenseFallback } from '@/components/PageShell'
import { useAuth } from '@/context/AuthContext'
import { LoginPage } from '@/pages/LoginPage'
import { APP_ROUTES, ROUTE_REDIRECTS } from '@/routes'

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
          {/* All app routes come from the single registry in routes.tsx, so
              every existing and future page shares the same Suspense fallback,
              skeleton shape, chunk prefetching, and transition depth. */}
          {APP_ROUTES.map((route) => {
            const Component = route.component
            const content = (
              <Suspense fallback={<RouteSuspenseFallback variant={route.skeleton} />}>
                <Component />
              </Suspense>
            )
            const element = route.adminOnly ? (
              <ProtectedRoute adminOnly>{content}</ProtectedRoute>
            ) : (
              content
            )
            return route.index ? (
              <Route key="index" index element={element} />
            ) : (
              <Route key={route.path} path={route.path} element={element} />
            )
          })}

          {ROUTE_REDIRECTS.map(({ from, to }) => (
            <Route key={from} path={from} element={<Navigate to={to} replace />} />
          ))}

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
