import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/api'
import { MapView, type MapMarker } from '@/components/MapView'
import type { Place, ProjectListItem, StatsResponse, TripListItem } from '@/types'

function formatDateRange(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })
  const startFmt = fmt(start)
  const endFmt = fmt(end)
  return startFmt === endFmt ? startFmt : `${startFmt} – ${endFmt}`
}

export function DashboardPage() {
  const { user } = useAuth()
  const [trips, setTrips] = useState<TripListItem[]>([])
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [visitedPlaces, setVisitedPlaces] = useState<Place[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        const [tripsData, projectsData, visitedData] = await Promise.all([
          api.trips.list(),
          api.projects.list(),
          api.places.visited(),
        ])
        setTrips(tripsData)
        setProjects(projectsData)
        setVisitedPlaces(visitedData)
        try {
          setStats(await api.stats.get())
        } catch {
          // stats são opcionais no dashboard
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar o dashboard')
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

  const recentTrips = trips.slice(0, 3)
  const topProjects = projects.slice(0, 3)
  const isEmpty = trips.length === 0 && projects.length === 0

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="font-display text-2xl font-bold">Olá, {user?.username}!</h2>
        {isEmpty ? (
          <>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">
              Bem-vindo ao Percursos. Começa por criar o teu primeiro projeto ou regista a tua primeira viagem.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/projetos/novo" className="btn-primary">Criar o meu primeiro projeto</Link>
              <Link to="/viagens/novo" className="btn-secondary">Registar a minha primeira viagem</Link>
            </div>
          </>
        ) : (
          <p className="mt-1 text-neutral-600 dark:text-neutral-400">
            {stats
              ? `${stats.summary.trip_count} ${stats.summary.trip_count === 1 ? 'viagem' : 'viagens'} · ${stats.summary.place_count} ${stats.summary.place_count === 1 ? 'lugar' : 'lugares'} · ${stats.summary.active_projects} ${stats.summary.active_projects === 1 ? 'projeto ativo' : 'projetos ativos'}`
              : 'Aqui está um resumo dos teus projetos e viagens.'}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {visitedPlaces.length > 0 && (
        <div className="card">
          <h3 className="mb-3 font-display text-lg font-semibold">Os teus lugares no mapa</h3>
          <MapView
            variant="minimal"
            height="300px"
            markers={visitedPlaces.map(
              (place): MapMarker => ({
                id: place.id,
                lat: place.lat,
                lon: place.lon,
                title: place.name,
                subtitle: place.place_type,
                href: `/lugares/${place.id}`,
              })
            )}
          />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold">Projetos</h3>
            {projects.length > 0 && (
              <Link to="/projetos" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
                Ver todos
              </Link>
            )}
          </div>
          {topProjects.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Ainda não criaste nenhum projeto.</p>
              <Link to="/projetos/novo" className="btn-primary mt-4 inline-block">
                Criar o meu primeiro projeto
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {topProjects.map((project) => (
                <li key={project.id}>
                  <Link to={`/projetos/${project.id}`} className="block rounded-xl p-2 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800">
                    <p className="font-medium text-neutral-900 dark:text-neutral-50">{project.name}</p>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                      <div
                        className="h-full rounded-full bg-primary-600 transition-all"
                        style={{ width: `${project.progress_percent}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      {project.visited_places} de {project.total_places} visitados
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold">Últimas viagens</h3>
            {trips.length > 0 && (
              <Link to="/viagens" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
                Ver todas
              </Link>
            )}
          </div>
          {recentTrips.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Ainda não registaste nenhuma viagem.</p>
              <Link to="/viagens/novo" className="btn-primary mt-4 inline-block">
                Registar a minha primeira viagem
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {recentTrips.map((trip) => (
                <li key={trip.id}>
                  <Link to={`/viagens/${trip.id}`} className="block rounded-xl p-2 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800">
                    <p className="font-medium text-neutral-900 dark:text-neutral-50">
                      {formatDateRange(trip.start_date, trip.end_date)}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      {trip.place_count} {trip.place_count === 1 ? 'lugar' : 'lugares'} ·{' '}
                      {trip.project_count} {trip.project_count === 1 ? 'projeto' : 'projetos'}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
