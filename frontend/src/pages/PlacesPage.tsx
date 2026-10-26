import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/api'
import { PageSpinner } from '@/components/ui/PageSpinner'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { useApiResource, usePersistentFilters } from '@/hooks/useApiResource'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from '@/i18n'
import { formatHierarchy } from '@/utils/format'
import { PLACE_TYPES, type PlaceOverviewItem, type PlaceType } from '@/types'
import { MapPin } from 'lucide-react'

type StatusFilter = 'all' | 'visited' | 'pending'
type SortOrder = 'alpha' | 'most_visited' | 'recent'

interface PlacesFilters {
  query: string
  placeType: '' | PlaceType
  status: StatusFilter
  sort: SortOrder
}

const DEFAULT_FILTERS: PlacesFilters = { query: '', placeType: '', status: 'all', sort: 'alpha' }


function placeStatus(place: PlaceOverviewItem): 'visited' | 'pending' | 'both' {
  if (place.visit_count > 0) return place.is_project_target ? 'both' : 'visited'
  return 'pending'
}

// "Mais recentes": last visit when there is one, otherwise last edit.
function recencyTimestamp(place: PlaceOverviewItem): number {
  return new Date(place.last_visited_at || place.updated_at).getTime()
}

export function PlacesPage() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const { data: places, isLoading, error } = useApiResource<PlaceOverviewItem[]>(
    () => api.places.overview(),
    [],
    [],
  )
  // Filters are remembered per user, so they survive sessions without leaking
  // to other users of the same device (shared hook).
  const [filters, setFilters] = usePersistentFilters<PlacesFilters>('lugares:filters', user?.id, DEFAULT_FILTERS)

  const visiblePlaces = useMemo(() => {
    const query = filters.query.trim().toLowerCase()
    const filtered = places.filter((place) => {
      if (query && !place.name.toLowerCase().includes(query)) return false
      if (filters.placeType && place.place_type !== filters.placeType) return false
      if (filters.status === 'visited' && place.visit_count === 0) return false
      if (filters.status === 'pending' && place.visit_count > 0) return false
      return true
    })
    switch (filters.sort) {
      case 'most_visited':
        return filtered.sort((a, b) => b.visit_count - a.visit_count || a.name.localeCompare(b.name, 'pt'))
      case 'recent':
        return filtered.sort((a, b) => recencyTimestamp(b) - recencyTimestamp(a) || a.name.localeCompare(b.name, 'pt'))
      default:
        return filtered.sort((a, b) => a.name.localeCompare(b.name, 'pt'))
    }
  }, [places, filters])

  const updateFilters = (patch: Partial<PlacesFilters>) => setFilters((prev) => ({ ...prev, ...patch }))

  if (isLoading) {
    return <PageSpinner />
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold">{t('places.title')}</h2>
      <ErrorBanner message={error} />

      {places.length === 0 && !error ? (
        <div className="card flex flex-col items-center py-12 text-center">
          <MapPin size={48} strokeWidth={1.5} className="text-muted" aria-hidden="true" />

          <h3 className="mt-4 font-display text-lg font-semibold">{t('places.empty.title')}</h3>
          <p className="mt-1 max-w-sm text-sm text-muted">
            {t('places.empty.description')}
          </p>
          <Link to="/viagens/novo" className="btn-primary mt-6">
            {t('places.empty.cta')}
          </Link>
        </div>
      ) : (
        <>
          <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="places-search">
                {t('places.searchLabel')}
              </label>
              <input
                id="places-search"
                type="search"
                value={filters.query}
                onChange={(e) => updateFilters({ query: e.target.value })}
                placeholder={t('places.searchPlaceholder')}
                className="input"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="places-type">
                {t('places.typeLabel')}
              </label>
              <select
                id="places-type"
                value={filters.placeType}
                onChange={(e) => updateFilters({ placeType: e.target.value as '' | PlaceType })}
                className="input"
              >
                <option value="">{t('places.typeAll')}</option>
                {PLACE_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="places-status">
                {t('places.statusLabel')}
              </label>
              <select
                id="places-status"
                value={filters.status}
                onChange={(e) => updateFilters({ status: e.target.value as StatusFilter })}
                className="input"
              >
                <option value="all">{t('places.statusAll')}</option>
                <option value="visited">{t('places.statusVisited')}</option>
                <option value="pending">{t('places.statusPending')}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="places-sort">
                {t('places.sortLabel')}
              </label>
              <select
                id="places-sort"
                value={filters.sort}
                onChange={(e) => updateFilters({ sort: e.target.value as SortOrder })}
                className="input"
              >
                <option value="alpha">{t('places.sortAlpha')}</option>
                <option value="most_visited">{t('places.sortMostVisited')}</option>
                <option value="recent">{t('places.sortRecent')}</option>
              </select>
            </div>
          </div>

          {visiblePlaces.length === 0 ? (
            <div className="card py-8 text-center">
              <p className="text-sm text-muted">
                {t('places.noResults')}
              </p>
              <button onClick={() => setFilters(DEFAULT_FILTERS)} className="btn-outline mt-4">
                {t('actions.clearFilters')}
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visiblePlaces.map((place) => {
                const status = placeStatus(place)
                return (
                  <Link key={place.id} to={`/lugares/${place.id}`} className="card block">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display font-semibold text-ink">
                        {place.name}
                      </p>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        {place.visit_count > 0 && (
                          <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/20 dark:text-green-300">
                            {place.visit_count === 1 ? t('places.visitedOnce') : t('places.visitedTimes', { count: place.visit_count })}
                          </span>
                        )}
                        {(status === 'pending' || status === 'both') && (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                            {t('places.pendingBadge')}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-muted">
                      {place.place_type}
                      {formatHierarchy(place.hierarchy) && ` · ${formatHierarchy(place.hierarchy)}`}
                    </p>
                  </Link>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
