import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '@/api'
import { formatHierarchy, formatTripDateRange, formatTripTitle } from '@/utils/format'
import type { SearchResult } from '@/types'

export function SearchPage() {
  const [searchParams] = useSearchParams()
  const q = (searchParams.get('q') || '').trim()

  const [results, setResults] = useState<SearchResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (q.length < 2) {
      setResults(null)
      setError('')
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError('')

    api.search
      .query(q)
      .then((data) => {
        if (!cancelled) setResults(data)
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível concluir a pesquisa. Tenta novamente.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [q])

  const isEmpty =
    results !== null &&
    results.trips.length === 0 &&
    results.projects.length === 0 &&
    results.places.length === 0

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold">Pesquisa</h2>

      {q.length < 2 ? (
        <div className="card py-8 text-center">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Escreve pelo menos 2 caracteres na barra de pesquisa para encontrares viagens, projetos e lugares.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Resultados para <span className="font-medium text-neutral-900 dark:text-neutral-50">«{q}»</span>
          </p>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          )}

          {isLoading && (
            <div className="card py-8 text-center">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">A pesquisar...</p>
            </div>
          )}

          {!isLoading && !error && isEmpty && (
            <div className="card py-8 text-center">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Sem resultados para «{q}». Experimenta outro termo.
              </p>
            </div>
          )}

          {!isLoading && !error && results && results.trips.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-display text-lg font-semibold">Viagens</h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {results.trips.map((trip) => (
                  <Link key={trip.id} to={`/viagens/${trip.id}`} className="card block">
                    <p className="font-display font-semibold text-neutral-900 dark:text-neutral-50">
                      {formatTripTitle(trip)}
                    </p>
                    <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                      {formatTripDateRange(trip.start_date, trip.end_date)}
                      {' · '}
                      {trip.place_count} {trip.place_count === 1 ? 'lugar' : 'lugares'}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {!isLoading && !error && results && results.projects.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-display text-lg font-semibold">Projetos</h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {results.projects.map((project) => (
                  <Link key={project.id} to={`/projetos/${project.id}`} className="card block">
                    <p className="font-display font-semibold text-neutral-900 dark:text-neutral-50">
                      {project.name}
                    </p>
                    <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                      {project.visited_places}/{project.total_places} lugares visitados
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
              <h3 className="font-display text-lg font-semibold">Lugares</h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {results.places.map((place) => (
                  <Link key={place.id} to={`/lugares/${place.id}`} className="card block">
                    <p className="font-display font-semibold text-neutral-900 dark:text-neutral-50">
                      {place.name}
                    </p>
                    <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
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
