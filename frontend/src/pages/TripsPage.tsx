import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Route } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { api } from '@/api'
import { useApiResource, usePersistentFilters } from '@/hooks/useApiResource'
import { useAuth } from '@/context/AuthContext'
import { TripCard } from '@/components/ui/TripCard'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { PageSpinner } from '@/components/ui/PageSpinner'
import { formatTripTitle } from '@/utils/format'
import { getTripStatus, type TripStatus } from '@/utils/tripStatus'
import type { TripListItem } from '@/types'

type TripSort = 'recent' | 'alpha' | 'startDate'
type TripStatusFilter = 'todas' | TripStatus

interface TripFilters {
  query: string
  sort: TripSort
  status: TripStatusFilter
}

const DEFAULT_FILTERS: TripFilters = { query: '', sort: 'recent', status: 'todas' }

const STATUS_FILTERS: TripStatusFilter[] = ['todas', 'planeada', 'em_curso', 'concluida']

export function TripsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { data: trips, isLoading, error } = useApiResource<TripListItem[]>(
    () => api.trips.list(),
    [],
    [],
  )
  // Filters survive navigation, scoped per user (shared hook).
  const [filters, setFilters] = usePersistentFilters<TripFilters>('viagens:filters', user?.id, DEFAULT_FILTERS)

  const visibleTrips = useMemo(() => {
    const query = filters.query.trim().toLowerCase()
    const filtered = trips.filter((trip) => {
      if (filters.status !== 'todas' && getTripStatus(trip.start_date, trip.end_date) !== filters.status) {
        return false
      }
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
    return <PageSpinner />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold">{t('trips.title')}</h2>
        <Link to="/viagens/novo" className="btn-primary">
          {t('trips.create')}
        </Link>
      </div>
      <ErrorBanner message={error} />

      {trips.length === 0 && !error ? (
        <div className="card flex flex-col items-center py-12 text-center">
          <Route size={48} className="text-muted" aria-hidden="true" />
          <h3 className="mt-4 font-display text-lg font-semibold">{t('trips.empty.title')}</h3>
          <p className="mt-1 max-w-sm text-sm text-muted">
            {t('trips.empty.description')}
          </p>
          <Link to="/viagens/novo" className="btn-primary mt-6">
            {t('trips.empty.cta')}
          </Link>
        </div>
      ) : (
        <>
          <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="trips-search">
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
            <div className="sm:w-56">
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="trips-sort">
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

          <nav className="flex flex-wrap gap-2" aria-label={t('trips.filters')}>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className="chip"
                data-active={filters.status === f}
                onClick={() => setFilters((prev) => ({ ...prev, status: f }))}
              >
                {t(`trips.filter.${f}`)}
              </button>
            ))}
          </nav>

          {visibleTrips.length === 0 ? (
            <div className="card py-8 text-center">
              <p className="text-sm text-muted">{t('trips.noResults')}</p>
              <button onClick={() => setFilters(DEFAULT_FILTERS)} className="btn-outline mt-4">
                {t('actions.clearFilters')}
              </button>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {visibleTrips.map((trip, i) => (
                <div
                  key={trip.id}
                  className="animate-fade-up"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <TripCard trip={trip} prefs={user} coverUrl={trip.cover_photo_url ?? undefined} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
