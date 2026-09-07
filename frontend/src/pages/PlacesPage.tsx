import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from '@/i18n'
import { formatHierarchy } from '@/utils/format'
import { PLACE_TYPES, type PlaceOverviewItem, type PlaceType } from '@/types'

type StatusFilter = 'all' | 'visited' | 'pending'
type SortOrder = 'alpha' | 'most_visited' | 'recent'

interface PlacesFilters {
  query: string
  placeType: '' | PlaceType
  status: StatusFilter
  sort: SortOrder
}

const DEFAULT_FILTERS: PlacesFilters = { query: '', placeType: '', status: 'all', sort: 'alpha' }

// Filters are remembered per user, so they survive sessions without leaking
// to other users of the same device.
function storageKey(userId: number | undefined): string {
  return `lugares:filters:${userId ?? 'anon'}`
}

function loadFilters(userId: number | undefined): PlacesFilters {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return DEFAULT_FILTERS
    return { ...DEFAULT_FILTERS, ...(JSON.parse(raw) as Partial<PlacesFilters>) }
  } catch {
    return DEFAULT_FILTERS
  }
}

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
  const [places, setPlaces] = useState<PlaceOverviewItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<PlacesFilters>(() => loadFilters(user?.id))

  // The app remembers the chosen filters and sort order between sessions.
  useEffect(() => {
    localStorage.setItem(storageKey(user?.id), JSON.stringify(filters))
  }, [filters, user?.id])

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        setPlaces(await api.places.overview())
      } catch (err: any) {
        setError(err.message || t('places.loadError'))
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [t])

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
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label={t('loading')}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        <span className="sr-only">{t('loadingGeneric')}</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold">{t('places.title')}</h2>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {places.length === 0 && !error ? (
        <div className="card flex flex-col items-center py-12 text-center">
          <svg className="h-12 w-12 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h3 className="mt-4 font-display text-lg font-semibold">{t('places.empty.title')}</h3>
          <p className="mt-1 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
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
              <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400" htmlFor="places-search">
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
              <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400" htmlFor="places-type">
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
              <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400" htmlFor="places-status">
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
              <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400" htmlFor="places-sort">
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
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
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
                      <p className="font-display font-semibold text-neutral-900 dark:text-neutral-50">
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
                    <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
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
