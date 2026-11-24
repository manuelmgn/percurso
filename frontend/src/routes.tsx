import { lazy, type ComponentType } from 'react'
import { matchPath } from 'react-router-dom'
import { DashboardPage } from '@/pages/DashboardPage'
import type { SkeletonVariant } from '@/components/ui/Skeleton'

export interface AppRouteConfig {
  /** Route path relative to `/` (omit when `index` is true). */
  path?: string
  index?: boolean
  /** Page component (lazy or eager). */
  component: ComponentType
  /** Optional chunk preloader triggered on nav hover/focus/touch. */
  prefetch?: () => Promise<unknown>
  /** Skeleton shape used for chunk <Suspense> so it matches <PageShell>. */
  skeleton: SkeletonVariant
  /** Navigation hierarchy depth: 0 = top-level section, 1 = detail/new, 2 = edit. */
  depth: number
  /** Restrict route to admin users. */
  adminOnly?: boolean
}

type LazyLoader = () => Promise<{ default: ComponentType }>

/**
 * Helper to register a lazy-loaded page once and get both its React.lazy
 * component and an idempotent prefetch function. Any new page added to
 * APP_ROUTES via defineLazyRoute automatically gets:
 * - code splitting
 * - matching <Suspense> skeleton + progress bar
 * - nav chunk prefetching
 * - directional page transition depth
 */
function defineLazyRoute(
  config: Omit<AppRouteConfig, 'component' | 'prefetch'> & { loader: LazyLoader },
): AppRouteConfig {
  let preloaded = false
  const prefetch = () => {
    if (preloaded) return Promise.resolve()
    preloaded = true
    return config.loader().catch(() => {
      // Allow a retry if the network hiccuped during prefetch.
      preloaded = false
    })
  }
  return {
    path: config.path,
    index: config.index,
    component: lazy(config.loader),
    prefetch,
    skeleton: config.skeleton,
    depth: config.depth,
    adminOnly: config.adminOnly,
  }
}

export const APP_ROUTES: AppRouteConfig[] = [
  {
    index: true,
    component: DashboardPage,
    skeleton: 'dashboard',
    depth: 0,
  },
  defineLazyRoute({
    path: 'viagens',
    loader: () => import('@/pages/TripsPage').then((m) => ({ default: m.TripsPage })),
    skeleton: 'list',
    depth: 0,
  }),
  defineLazyRoute({
    path: 'viagens/novo',
    loader: () => import('@/pages/TripEditPage').then((m) => ({ default: m.TripEditPage })),
    skeleton: 'form',
    depth: 1,
  }),
  defineLazyRoute({
    path: 'viagens/:id',
    loader: () => import('@/pages/TripDetailPage').then((m) => ({ default: m.TripDetailPage })),
    skeleton: 'detail',
    depth: 1,
  }),
  defineLazyRoute({
    path: 'viagens/:id/editar',
    loader: () => import('@/pages/TripEditPage').then((m) => ({ default: m.TripEditPage })),
    skeleton: 'form',
    depth: 2,
  }),
  defineLazyRoute({
    path: 'projetos',
    loader: () => import('@/pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })),
    skeleton: 'list',
    depth: 0,
  }),
  defineLazyRoute({
    path: 'projetos/novo',
    loader: () => import('@/pages/ProjectEditPage').then((m) => ({ default: m.ProjectEditPage })),
    skeleton: 'form',
    depth: 1,
  }),
  defineLazyRoute({
    path: 'projetos/:id',
    loader: () => import('@/pages/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })),
    skeleton: 'detail',
    depth: 1,
  }),
  defineLazyRoute({
    path: 'projetos/:id/editar',
    loader: () => import('@/pages/ProjectEditPage').then((m) => ({ default: m.ProjectEditPage })),
    skeleton: 'form',
    depth: 2,
  }),
  defineLazyRoute({
    path: 'lugares',
    loader: () => import('@/pages/PlacesPage').then((m) => ({ default: m.PlacesPage })),
    skeleton: 'list',
    depth: 0,
  }),
  defineLazyRoute({
    path: 'lugares/:id',
    loader: () => import('@/pages/PlaceDetailPage').then((m) => ({ default: m.PlaceDetailPage })),
    skeleton: 'detail',
    depth: 1,
  }),
  defineLazyRoute({
    path: 'estatisticas',
    loader: () => import('@/pages/StatsPage').then((m) => ({ default: m.StatsPage })),
    skeleton: 'stats',
    depth: 0,
  }),
  defineLazyRoute({
    path: 'pesquisa',
    loader: () => import('@/pages/SearchPage').then((m) => ({ default: m.SearchPage })),
    skeleton: 'search',
    depth: 0,
  }),
  defineLazyRoute({
    path: 'notificacoes',
    loader: () => import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
    skeleton: 'rows',
    depth: 0,
  }),
  defineLazyRoute({
    path: 'definicoes',
    loader: () => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
    skeleton: 'settings',
    depth: 0,
  }),
  defineLazyRoute({
    path: 'utilizadores/:username',
    loader: () => import('@/pages/UserProfilePage').then((m) => ({ default: m.UserProfilePage })),
    skeleton: 'detail',
    depth: 1,
  }),
  defineLazyRoute({
    path: 'admin',
    loader: () => import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage })),
    skeleton: 'rows',
    depth: 0,
    adminOnly: true,
  }),
]

export const ROUTE_REDIRECTS: Array<{ from: string; to: string }> = [
  { from: 'ajustes', to: '/definicoes' },
  { from: 'perfil', to: '/definicoes' },
  { from: 'settings', to: '/definicoes' },
]

function findRoute(pathname: string): AppRouteConfig | undefined {
  const cleanPath = pathname.split('?')[0].split('#')[0] || '/'
  if (cleanPath === '/') {
    return APP_ROUTES.find((r) => r.index)
  }
  return APP_ROUTES.find((r) => r.path && matchPath(`/${r.path}`, cleanPath))
}

/** Preload the JS chunk for a target pathname (safe to call repeatedly). */
export function prefetchRoute(pathname: string): void {
  findRoute(pathname)?.prefetch?.()
}

/** Hierarchy depth of a pathname for directional transitions. */
export function getRouteDepth(pathname: string): number {
  return findRoute(pathname)?.depth ?? 0
}
