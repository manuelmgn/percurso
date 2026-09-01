import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/api'
import { formatTripTitle } from '@/utils/format'
import type { TripListItem } from '@/types'

export function TripsPage() {
  const [trips, setTrips] = useState<TripListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        setTrips(await api.trips.list())
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar viagens')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label="A carregar">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        <span className="sr-only">A carregar...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold">Viagens</h2>
        <Link to="/viagens/novo" className="btn-primary">
          Nova viagem
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
          <h3 className="mt-4 font-display text-lg font-semibold">Ainda não tens viagens</h3>
          <p className="mt-1 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
            Regista a tua primeira viagem para começares a guardar os lugares que visitaste.
          </p>
          <Link to="/viagens/novo" className="btn-primary mt-6">
            Criar a minha primeira viagem
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {trips.map((trip) => (
            <Link
              key={trip.id}
              to={`/viagens/${trip.id}`}
              className="card block"
            >
              <p className="font-display font-semibold text-neutral-900 dark:text-neutral-50">
                {formatTripTitle(trip)}
              </p>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                {trip.place_count} {trip.place_count === 1 ? 'lugar' : 'lugares'} ·{' '}
                {trip.project_count} {trip.project_count === 1 ? 'projeto' : 'projetos'}
              </p>
              <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                Criada por {trip.creator_username}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
