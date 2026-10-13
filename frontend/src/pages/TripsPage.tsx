import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { formatTripTitle } from '@/utils/format'
import type { TripListItem } from '@/types'

type TripSort = 'recent' | 'alpha' | 'startDate'

interface TripFilters {
  query: string
  sort: TripSort
}

const DEFAULT_FILTERS: TripFilters = { query: '', sort: 'recent' }

function storageKey(userId: number | undefined): string {
  return `viagens:filters:${userId ?? 'anon'}`
}

function loadFilters(userId: number | undefined): TripFilters {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return DEFAULT_FILTERS
    return { ...DEFAULT_FILTERS, ...(JSON.parse(raw) as Partial<TripFilters>) }
  } catch {
    return DEFAULT_FILTERS
  }
}

export function TripsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [trips, setTrips] = useState<TripListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<TripFilters>(() => loadFilters(user?.id))

  useEffect(() => {
    localStorage.setItem(storageKey(user?.id), JSON.stringify(filters))
  }, [filters, user?.id])

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        setTrips(await api.trips.list())
      } catch (err: any) {
        setError(err.message || t('trips.loadError'))
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [t])

  const visibleTrips = useMemo(() => {
    const query = filters.query.trim().toLowerCase()
    const filtered = trips.filter((trip) => {
      if (!query) return true
      const title = formatTripTitle(trip, user).toLowerCase()
      return title.includes(query)
    })
    return [...filtered].sort((a, b) => {
      switch (filters.sort) {
        case 'alpha':
          return formatTripTitle(a, user).localeCompare(formatTripTitle(b, user), 'pt')
        case 'startDate':
          return b.start_date.localeCompare(a.start_date)
        case 'recent':
        default:
          return b.updated_at.localeCompare(a.updated_at)
      }
    })
  }, [trips, filters, user])

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
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold">{t('trips.title')}</h2>
        <Link to="/viagens/novo" className="btn-primary">
          {t('trips.create')}
        </Link>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {trips.length === 0 && !error ? (
        <div className="card flex flex-col items-center py-12 text-center">
          <svg className="h-12 w-12 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="mt-4 font-display text-lg font-semibold">{t('trips.empty.title')}</h3>
          <p className="mt-1 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
            {t('trips.empty.description')}
          </p>
          <Link to="/viagens/novo" className="btn-primary mt-6">
            {t('trips.empty.cta')}
          </Link>
        </div>
      ) : (
        <>
          <div className="card grid gap-3 p-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400" htmlFor="trips-search">
                {t('trips.searchLabel')}
              </label>
              <input
                id="trips-search"
                type="search"
                value={filters.query}
                onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value }))}
                placeholder={t('trips.searchPlaceholder')}
                className="input"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400" htmlFor="trips-sort">
                {t('trips.sortLabel')}
              </label>
              <select
                id="trips-sort"
                value={filters.sort}
                onChange={(e) => setFilters((prev) => ({ ...prev, sort: e.target.value as TripSort }))}
                className="input"
              >
                <option value="recent">{t('places.sortRecent')}</option>
                <option value="startDate">{t('tripEdit.startDateLabel')}</option>
                <option value="alpha">{t('places.sortAlpha')}</option>
              </select>
            </div>
          </div>

          {visibleTrips.length === 0 ? (
            <div className="card py-8 text-center">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('trips.noResults')}</p>
              <button onClick={() => setFilters(DEFAULT_FILTERS)} className="btn-outline mt-4">
                {t('actions.clearFilters')}
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleTrips.map((trip) => (
                <Link
                  key={trip.id}
                  to={`/viagens/${trip.id}`}
                  className="card block"
                >
                  <p className="font-display font-semibold text-neutral-900 dark:text-neutral-50">
                    {formatTripTitle(trip, user)}
                  </p>
                  <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                    {trip.place_count} {t(trip.place_count === 1 ? 'units.place.one' : 'units.place.other')} ·{' '}
                    {trip.project_count} {t(trip.project_count === 1 ? 'units.project.one' : 'units.project.other')}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {t('trips.createdBy', { username: trip.creator_username })}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
