import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from '@/i18n'
import { formatHierarchy, formatTripDateRange, formatTripTitle } from '@/utils/format'
import type { SearchResult } from '@/types'

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const { t, pluralize } = useTranslation()
  const q = (searchParams.get('q') || '').trim()

  const [results, setResults] = useState<SearchResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (q.length < 2) {
      setResults(null)
      setError('')
      setIsLoading(false)
      return
    }

    let cancelled = false
    // Debounce the API call so each keystroke doesn't hit /api/search/.
    const timer = window.setTimeout(() => {
      setIsLoading(true)
      setError('')
      api.search
        .query(q)
        .then((data) => {
          if (!cancelled) setResults(data)
        })
        .catch(() => {
          if (!cancelled) setError(t('errors.generic'))
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false)
        })
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [q, t])

  const isEmpty =
    results !== null &&
    results.trips.length === 0 &&
    results.projects.length === 0 &&
    results.places.length === 0

  return (
    <div className="space-y-6">
      <div className="search-pill w-full">
        <Search size={18} className="shrink-0 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(e) =>
            setSearchParams(e.target.value ? { q: e.target.value } : {}, { replace: true })
          }
          placeholder={t('search.placeholder')}
          aria-label={t('search.title')}
          autoFocus
          inputMode="search"
          enterKeyHint="search"
          className="w-full bg-transparent text-base text-ink outline-none placeholder:text-muted dark:text-[#FAF7F2] dark:placeholder:text-[#A09A92]"
        />
      </div>

      <h2 className="font-display text-2xl font-bold">{t('search.title')}</h2>

      {q.length < 2 ? (
        <div className="card py-8 text-center">
          <p className="text-sm text-muted">
            {t('search.queryTooShort')}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">
            {t('search.resultsFor')} <span className="font-medium text-ink dark:text-[#FAF7F2]">«{q}»</span>
          </p>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          )}

          {isLoading && (
            <div className="card py-8 text-center">
              <p className="text-sm text-muted">{t('search.searching')}</p>
            </div>
          )}

          {!isLoading && !error && isEmpty && (
            <div className="card py-8 text-center">
              <p className="text-sm text-muted">
                {t('search.noResults', { q })}
              </p>
            </div>
          )}

          {!isLoading && !error && results && results.trips.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-display text-lg font-semibold">{t('nav.trips')}</h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {results.trips.map((trip) => (
                  <Link key={trip.id} to={`/viagens/${trip.id}`} className="card block">
                    <p className="font-display font-semibold text-ink dark:text-[#FAF7F2]">
                      {formatTripTitle(trip, user)}
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      {formatTripDateRange(trip.start_date, trip.end_date, user)}
                      {' · '}
                      {trip.place_count} {pluralize(trip.place_count, 'units.place.one', 'units.place.other')}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {!isLoading && !error && results && results.projects.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-display text-lg font-semibold">{t('nav.projects')}</h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {results.projects.map((project) => (
                  <Link key={project.id} to={`/projetos/${project.id}`} className="card block">
                    <p className="font-display font-semibold text-ink dark:text-[#FAF7F2]">
                      {project.name}
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      {t('search.projectProgress', { visited: project.visited_places, total: project.total_places })}
                      {' · '}
                      {project.progress_percent}%
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {!isLoading && !error && results && results.places.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-display text-lg font-semibold">{t('nav.places')}</h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {results.places.map((place) => (
                  <Link key={place.id} to={`/lugares/${place.id}`} className="card block">
                    <p className="font-display font-semibold text-ink dark:text-[#FAF7F2]">
                      {place.name}
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      {place.place_type}
                      {formatHierarchy(place.hierarchy) && ` · ${formatHierarchy(place.hierarchy)}`}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
