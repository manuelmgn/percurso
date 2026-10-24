import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useAuth } from '@/context/AuthContext'
import { api, ApiError } from '@/api'
import { MapView, type MapMarker } from '@/components/MapView'
import { RouteOverlay } from '@/components/map/RouteOverlay'
import { TripCard } from '@/components/ui/TripCard'
import { ProgressGoal } from '@/components/ui/ProgressGoal'
import { formatTripDateRange, formatTripTitle } from '@/utils/format'
import { getTripStatus } from '@/utils/tripStatus'
import type { Pin, PinEntityType, Place, ProjectListItem, StatsResponse, TripListItem } from '@/types'

function Stat({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <div>
      <p className={`font-display text-3xl font-bold ${className}`}>{value}</p>
      <p className="mt-1 text-[13px] text-muted">{label}</p>
    </div>
  )
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
      } catch (err: any) {
        setError(err.message || t('dashboard.loadError'))
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  const visitedMarkers = useMemo(
    () =>
      visitedPlaces.map(
        (place): MapMarker => ({
          id: place.id,
          lat: place.lat,
          lon: place.lon,
          title: place.name,
          subtitle: place.place_type,
          href: `/lugares/${place.id}`,
        })
      ),
    [visitedPlaces]
  )

  // Next trip: the visible planned trip with the nearest future start date.
  const nextTrip = useMemo(() => {
    return trips
      .filter((trip) => getTripStatus(trip.start_date, trip.end_date) === 'planeada')
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
  }, [trips])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label={t('loading')}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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

  const pinButton = (entityType: PinEntityType, entityId: number, label: string, positionClass: string) => {
    const isPinned = pinnedKeys.has(`${entityType}:${entityId}`)
    return (
      <button
        type="button"
        onClick={() => togglePin(entityType, entityId)}
        aria-label={isPinned ? t('pinButton.unpinAria', { label }) : t('pinButton.pinAria', { label })}
        title={isPinned ? t('actions.unpin') : t('actions.pin')}
        className={`absolute z-10 rounded-full bg-surface/90 p-1.5 shadow-card transition-all duration-200 ${positionClass} ${
          isPinned
            ? 'text-primary opacity-100'
            : 'text-muted opacity-0 hover:text-primary focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100'
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
  const hasMap = visitedPlaces.length > 0

  // Real figures for the stats panel; local data is the fallback while stats
  // are optional (the panel must still render if the stats call failed).
  const currentYear = String(new Date().getFullYear())
  const tripsThisYear = trips.filter((trip) => trip.start_date.startsWith(currentYear)).length
  const activeProjects = projects.filter((p) => p.progress_percent < 100).length
  const regionCount = stats
    ? stats.region_stats.length
    : new Set(visitedPlaces.map((p) => p.hierarchy?.['concelho'] ?? p.name)).size

  // "Conquistas recentes": completed projects + most recent trips (up to 5 items total)
  const completedProjects = projects.filter((p) => p.progress_percent === 100)
  const newestTrips = [...trips].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 3)
  const recentHighlights: Array<{ type: 'project' | 'trip'; id: number; label: string; sub: string }> = [
    ...completedProjects.slice(0, 3).map((p) => ({
      type: 'project' as const,
      id: p.id,
      label: p.name,
      sub: t('dashboard.highlightCompleted'),
    })),
    ...newestTrips.map((tr) => ({
      type: 'trip' as const,
      id: tr.id,
      label: formatTripTitle(tr, user),
      sub: t('dashboard.highlightNewTrip'),
    })),
  ].slice(0, 5)

  return (
    <div className="space-y-8">
      {/* Summary line lives here; the greeting itself is rendered by Header. */}
      {isEmpty ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/projetos/novo" className="btn-primary">{t('dashboard.createFirstProject')}</Link>
          <Link to="/viagens/novo" className="btn-outline">{t('dashboard.registerFirstTrip')}</Link>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="text-sm text-muted">
            {stats
              ? `${stats.summary.trip_count} ${t(stats.summary.trip_count === 1 ? 'units.trip.one' : 'units.trip.other')} · ${stats.summary.place_count} ${t(stats.summary.place_count === 1 ? 'units.place.one' : 'units.place.other')} · ${stats.summary.active_projects} ${t(stats.summary.active_projects === 1 ? 'units.activeProject.one' : 'units.activeProject.other')}`
              : t('dashboard.summaryNoStats')}
          </p>
          <Link
            to="/estatisticas"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            {t('dashboard.viewStats')} <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      )}

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

      {/* Hero map + yearly stats panel */}
      <section className="grid gap-6 lg:grid-cols-12">
        {hasMap && (
          <div className="relative h-[300px] overflow-hidden rounded-card shadow-card md:h-[390px] lg:col-span-8 dark:border dark:border-[#322A23] dark:shadow-none">
            <MapView
              variant="minimal"
              height="100%"
              markers={visitedMarkers}
            />
            <RouteOverlay className="pointer-events-none absolute inset-x-[8%] top-[18%] z-[500] w-[65%]" />
            <Link
              to="/lugares"
              className="absolute right-4 top-4 z-10 inline-flex items-center gap-1 rounded-pill bg-surface px-4 py-2 text-sm font-semibold text-primary shadow-pop dark:bg-[#221D18]"
            >
              {t('dashboard.viewPlaces')} <ArrowRight size={14} aria-hidden="true" />
            </Link>
            {nextTrip && (
              <Link
                to={`/viagens/${nextTrip.id}`}
                className="absolute bottom-4 left-4 z-10 w-[min(392px,90%)] rounded-2xl bg-surface p-3 shadow-pop transition-shadow hover:shadow-card-hover dark:bg-[#221D18]"
              >
                <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-primary">
                  {t('dashboard.nextTrip')}
                </p>
                <p className="mt-0.5 truncate font-display text-lg font-bold text-ink dark:text-[#FAF7F2]">
                  {formatTripTitle(nextTrip, user)}
                </p>
                <p className="mt-0.5 text-[13px] text-muted">
                  {formatTripDateRange(nextTrip.start_date, nextTrip.end_date, user)} ·{' '}
                  {t('trip.placeCount', { count: nextTrip.place_count })}
                </p>
              </Link>
            )}
          </div>
        )}

        <aside className={`card flex flex-col ${hasMap ? 'lg:col-span-4' : 'lg:col-span-12'}`}>
          <h2 className="font-display text-lg font-bold">{t('stats.yearInNumbers')}</h2>
          <div className={`mt-5 grid grid-cols-2 gap-5 ${hasMap ? '' : 'sm:grid-cols-4'}`}>
            <Stat value={stats?.summary.trip_count ?? trips.length} label={t('stats.trips')} className="text-primary" />
            <Stat value={stats?.summary.place_count ?? visitedPlaces.length} label={t('stats.places')} className="text-coral" />
            <Stat value={stats?.summary.active_projects ?? activeProjects} label={t('stats.activeProjects')} className="text-plum" />
            <Stat value={regionCount} label={t('stats.regions')} className="text-ink dark:text-[#FAF7F2]" />
          </div>
          {user?.yearly_trip_goal != null && (
            <>
              <hr className="my-5 border-line" />
              <ProgressGoal current={tripsThisYear} total={user.yearly_trip_goal} />
            </>
          )}
        </aside>
      </section>

      {/* Viagens recentes */}
      <section>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-[22px] font-bold">{t('trips.recent')}</h2>
          {trips.length > 0 && (
            <Link to="/viagens" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              {t('trips.viewAll')} <ArrowRight size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
        {recentTrips.length === 0 ? (
          <div className="card py-8 text-center">
            <p className="text-sm text-muted">{t('dashboard.noTripsYet')}</p>
            <Link to="/viagens/novo" className="btn-primary mt-4 inline-block">
              {t('dashboard.registerFirstTrip')}
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {recentTrips.map((trip, i) => (
              <div
                key={trip.id}
                className="group relative animate-fade-up"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <TripCard trip={trip} prefs={user} />
                {pinButton('trip', trip.id, t('units.trip.one'), 'left-4 top-4')}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Projetos */}
        <section>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-display text-[22px] font-bold">{t('dashboard.projects')}</h2>
            {projects.length > 0 && (
              <Link to="/projetos" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                {t('dashboard.viewAll')} <ArrowRight size={14} aria-hidden="true" />
              </Link>
            )}
          </div>
          <div className="card">
            {topProjects.length === 0 ? (
              <div className="py-4 text-center">
                <p className="text-sm text-muted">{t('dashboard.noProjectsYet')}</p>
                <Link to="/projetos/novo" className="btn-primary mt-4 inline-block">
                  {t('dashboard.createFirstProject')}
                </Link>
              </div>
            ) : (
              <ul className="space-y-3">
                {topProjects.map((project) => (
                  <li key={project.id} className="group relative">
                    <Link to={`/projetos/${project.id}`} className="block rounded-xl p-2 transition-colors hover:bg-line/40 dark:hover:bg-[#322A23]/40">
                      <p className="pr-8 font-medium text-ink dark:text-[#FAF7F2]">{project.name}</p>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-pill bg-line dark:bg-[#322A23]">
                        <div
                          className="h-full rounded-pill bg-brand transition-all"
                          style={{ width: `${project.progress_percent}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {t('projects.progressText', { visited: project.visited_places, total: project.total_places })}
                      </p>
                    </Link>
                    {pinButton('project', project.id, t('units.project.one'), 'right-2 top-2')}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Conquistas recentes */}
        {recentHighlights.length > 0 && (
          <div className="card">
            <h2 className="font-display text-base font-bold">{t('dashboard.recentHighlights')}</h2>
            <ul className="timeline mt-5 space-y-5">
              {recentHighlights.map((item) => (
                <li key={`${item.type}-${item.id}`} className="relative">
                  <span
                    className={`timeline-node ${item.type === 'project' ? 'bg-plum' : 'bg-primary'}`}
                    aria-hidden="true"
                  />
                  <Link
                    to={item.type === 'project' ? `/projetos/${item.id}` : `/viagens/${item.id}`}
                    className="-mt-0.5 block rounded-xl px-1 py-0.5 transition-colors hover:bg-line/40 dark:hover:bg-[#322A23]/40"
                  >
                    <p className="truncate font-medium text-ink dark:text-[#FAF7F2]">{item.label}</p>
                    <p className="text-xs text-muted">{item.sub}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
