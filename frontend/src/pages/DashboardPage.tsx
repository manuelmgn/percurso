import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/api'
import { MapView, type MapMarker } from '@/components/MapView'
import { formatTripTitle } from '@/utils/format'
import type { ActivityItem, Place, ProjectListItem, StatsResponse, TripListItem } from '@/types'

const activityActionLabels: Record<ActivityItem['action'], string> = {
  created: 'criou',
  updated: 'editou',
  deleted: 'eliminou',
}

const activityEntityLabels: Record<ActivityItem['entity_type'], string> = {
  trip: 'a viagem',
  project: 'o projeto',
  place: 'o lugar',
  user: 'o utilizador',
}

function activityEntityPath(activity: ActivityItem): string | null {
  if (activity.action === 'deleted') return null
  switch (activity.entity_type) {
    case 'trip':
      return `/viagens/${activity.entity_id}`
    case 'project':
      return `/projetos/${activity.entity_id}`
    case 'place':
      return `/lugares/${activity.entity_id}`
    default:
      return null
  }
}

function formatActivityDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-PT', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function DashboardPage() {
  const { user } = useAuth()
  const [trips, setTrips] = useState<TripListItem[]>([])
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [visitedPlaces, setVisitedPlaces] = useState<Place[]>([])
  const [activities, setActivities] = useState<ActivityItem[]>([])
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
        try {
          setActivities(await api.activities.list())
        } catch {
          // a atividade recente é opcional no dashboard
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
          <>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">
              {stats
                ? `${stats.summary.trip_count} ${stats.summary.trip_count === 1 ? 'viagem' : 'viagens'} · ${stats.summary.place_count} ${stats.summary.place_count === 1 ? 'lugar' : 'lugares'} · ${stats.summary.active_projects} ${stats.summary.active_projects === 1 ? 'projeto ativo' : 'projetos ativos'}`
                : 'Aqui está um resumo dos teus projetos e viagens.'}
            </p>
            <Link
              to="/estatisticas"
              className="mt-2 inline-block text-sm font-medium text-primary-700 hover:underline dark:text-primary-300"
            >
              Ver estatísticas →
            </Link>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {visitedPlaces.length > 0 && (
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold">Os teus lugares no mapa</h3>
            <Link to="/lugares" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
              Ver lugares →
            </Link>
          </div>
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
                      {formatTripTitle(trip)}
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

      {activities.length > 0 && (
        <div className="card">
          <h3 className="mb-3 font-display text-lg font-semibold">Atividade recente</h3>
          <ul className="space-y-3">
            {activities.map((activity) => {
              const path = activityEntityPath(activity)
              return (
                <li key={activity.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <p className="text-neutral-700 dark:text-neutral-300">
                    <span className="font-medium text-neutral-900 dark:text-neutral-50">
                      {activity.user_username}
                    </span>{' '}
                    {activityActionLabels[activity.action]} {activityEntityLabels[activity.entity_type]}{' '}
                    {path ? (
                      <Link
                        to={path}
                        className="font-medium text-primary-700 hover:underline dark:text-primary-300"
                      >
                        {activity.entity_name}
                      </Link>
                    ) : (
                      <span className="font-medium">{activity.entity_name}</span>
                    )}
                  </p>
                  <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
                    {formatActivityDate(activity.created_at)}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
