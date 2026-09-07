import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { useAuth } from '@/context/AuthContext'
import { api, ApiError } from '@/api'
import { MapView, type MapMarker } from '@/components/MapView'
import { formatDateTime, formatTripTitle } from '@/utils/format'
import type { ActivityItem, Pin, PinEntityType, Place, ProjectListItem, StatsResponse, TripListItem } from '@/types'

const activityActionKeys: Record<ActivityItem['action'], string> = {
  created: 'dashboard.activityCreated',
  updated: 'dashboard.activityUpdated',
  deleted: 'dashboard.activityDeleted',
}

const activityEntityKeys: Record<ActivityItem['entity_type'], string> = {
  trip: 'dashboard.activityTrip',
  project: 'dashboard.activityProject',
  place: 'dashboard.activityPlace',
  user: 'dashboard.activityUser',
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

export function DashboardPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [trips, setTrips] = useState<TripListItem[]>([])
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [pins, setPins] = useState<Pin[]>([])
  const [pinError, setPinError] = useState('')
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [visitedPlaces, setVisitedPlaces] = useState<Place[]>([])
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        const [tripsData, projectsData, visitedData, pinsData] = await Promise.all([
          api.trips.list(),
          api.projects.list(),
          api.places.visited(),
          api.pins.list(),
        ])
        setTrips(tripsData)
        setProjects(projectsData)
        setVisitedPlaces(visitedData)
        setPins(pinsData)
        try {
          setStats(await api.stats.get())
        } catch {
          // Stats are optional on the dashboard.
        }
        try {
          setActivities(await api.activities.list())
        } catch {
          // Recent activity is optional on the dashboard.
        }
      } catch (err: any) {
        setError(err.message || t('dashboard.loadError'))
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label={t('loading')}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        <span className="sr-only">{t('loadingGeneric')}</span>
      </div>
    )
  }

  // Pinned items come first (oldest pin first); the rest keep the backend
  // order (updated_at, most recent first).
  const pinDates = new Map(pins.map((p) => [`${p.entity_type}:${p.entity_id}`, p.created_at]))
  const pinnedKeys = new Set(pinDates.keys())
  const withPinsFirst = <T extends { id: number; updated_at: string }>(items: T[], type: PinEntityType): T[] =>
    [...items].sort((a, b) => {
      const pa = pinDates.get(`${type}:${a.id}`)
      const pb = pinDates.get(`${type}:${b.id}`)
      if (pa && pb) return pa.localeCompare(pb)
      if (pa) return -1
      if (pb) return 1
      return b.updated_at.localeCompare(a.updated_at)
    })

  const togglePin = async (entityType: PinEntityType, entityId: number) => {
    setPinError('')
    try {
      if (pinnedKeys.has(`${entityType}:${entityId}`)) {
        await api.pins.unpin(entityType, entityId)
      } else {
        await api.pins.pin(entityType, entityId)
      }
      setPins(await api.pins.list())
    } catch (err) {
      if (err instanceof ApiError) setPinError(err.message)
      else setPinError(t('dashboard.pinError'))
    }
  }

  const pinButton = (entityType: PinEntityType, entityId: number, label: string) => {
    const isPinned = pinnedKeys.has(`${entityType}:${entityId}`)
    return (
      <button
        type="button"
        onClick={() => togglePin(entityType, entityId)}
        aria-label={isPinned ? t('pinButton.unpinAria', { label }) : t('pinButton.pinAria', { label })}
        title={isPinned ? t('actions.unpin') : t('actions.pin')}
        className={`absolute right-2 top-2 rounded-full p-1.5 transition-opacity duration-200 ${
          isPinned
            ? 'text-primary-600 opacity-100 dark:text-primary-400'
            : 'text-neutral-400 opacity-0 hover:text-primary-600 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:text-primary-400'
        }`}
      >
        <svg className="h-4 w-4" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
        </svg>
      </button>
    )
  }

  const recentTrips = withPinsFirst(trips, 'trip').slice(0, 3)
  const topProjects = withPinsFirst(projects, 'project').slice(0, 3)
  const isEmpty = trips.length === 0 && projects.length === 0

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="font-display text-2xl font-bold">{t('dashboard.welcome', { name: user?.username ?? '' })}</h2>
        {isEmpty ? (
          <>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">
              {t('dashboard.welcomeEmpty')}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/projetos/novo" className="btn-primary">{t('dashboard.createFirstProject')}</Link>
              <Link to="/viagens/novo" className="btn-secondary">{t('dashboard.registerFirstTrip')}</Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">
              {stats
                ? `${stats.summary.trip_count} ${t(stats.summary.trip_count === 1 ? 'units.trip.one' : 'units.trip.other')} · ${stats.summary.place_count} ${t(stats.summary.place_count === 1 ? 'units.place.one' : 'units.place.other')} · ${stats.summary.active_projects} ${t(stats.summary.active_projects === 1 ? 'units.activeProject.one' : 'units.activeProject.other')}`
                : t('dashboard.summaryNoStats')}
            </p>
            <Link
              to="/estatisticas"
              className="mt-2 inline-block text-sm font-medium text-primary-700 hover:underline dark:text-primary-300"
            >
              {t('dashboard.viewStats')} →
            </Link>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {pinError && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          {pinError}
        </div>
      )}

      {visitedPlaces.length > 0 && (
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold">{t('dashboard.yourPlacesOnMap')}</h3>
            <Link to="/lugares" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
              {t('dashboard.viewPlaces')} →
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
            <h3 className="font-display text-lg font-semibold">{t('dashboard.projects')}</h3>
            {projects.length > 0 && (
              <Link to="/projetos" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
                {t('dashboard.viewAll')}
              </Link>
            )}
          </div>
          {topProjects.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('dashboard.noProjectsYet')}</p>
              <Link to="/projetos/novo" className="btn-primary mt-4 inline-block">
                {t('dashboard.createFirstProject')}
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {topProjects.map((project) => (
                <li key={project.id} className="group relative">
                  <Link to={`/projetos/${project.id}`} className="block rounded-xl p-2 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800">
                    <p className="pr-8 font-medium text-neutral-900 dark:text-neutral-50">{project.name}</p>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                      <div
                        className="h-full rounded-full bg-primary-600 transition-all"
                        style={{ width: `${project.progress_percent}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      {t('projects.progressText', { visited: project.visited_places, total: project.total_places })}
                    </p>
                  </Link>
                  {pinButton('project', project.id, t('units.project.one'))}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold">{t('dashboard.latestTrips')}</h3>
            {trips.length > 0 && (
              <Link to="/viagens" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
                {t('dashboard.viewAllTrips')}
              </Link>
            )}
          </div>
          {recentTrips.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('dashboard.noTripsYet')}</p>
              <Link to="/viagens/novo" className="btn-primary mt-4 inline-block">
                {t('dashboard.registerFirstTrip')}
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {recentTrips.map((trip) => (
                <li key={trip.id} className="group relative">
                  <Link to={`/viagens/${trip.id}`} className="block rounded-xl p-2 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800">
                    <p className="pr-8 font-medium text-neutral-900 dark:text-neutral-50">
                      {formatTripTitle(trip, user)}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      {trip.place_count} {t(trip.place_count === 1 ? 'units.place.one' : 'units.place.other')} ·{' '}
                      {trip.project_count} {t(trip.project_count === 1 ? 'units.project.one' : 'units.project.other')}
                    </p>
                  </Link>
                  {pinButton('trip', trip.id, t('units.trip.one'))}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {activities.length > 0 && (
        <div className="card">
          <h3 className="mb-3 font-display text-lg font-semibold">{t('dashboard.recentActivity')}</h3>
          <ul className="space-y-3">
            {activities.map((activity) => {
              const path = activityEntityPath(activity)
              return (
                <li key={activity.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <p className="text-neutral-700 dark:text-neutral-300">
                    <span className="font-medium text-neutral-900 dark:text-neutral-50">
                      {activity.user_username}
                    </span>{' '}
                    {t(activityActionKeys[activity.action])} {t(activityEntityKeys[activity.entity_type])}{' '}
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
                    {formatDateTime(activity.created_at, user)}
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
