import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, FolderOpen, MapPin, StickyNote, Users } from 'lucide-react'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from '@/i18n'
import { MapView, type MapMarker } from '@/components/MapView'
import { PinButton } from '@/components/PinButton'
import { StatusChip } from '@/components/ui/StatusChip'
import { TripPhotos } from '@/components/TripPhotos'
import { getTripStatus } from '@/utils/tripStatus'
import { formatDate, formatTripDateRange, formatTripTitle } from '@/utils/format'
import type { Trip, TripDeleteWarning } from '@/types'

// Rotating accent colours for the itinerary timeline nodes.
const DAY_COLORS = ['#C1075D', '#E06F56', '#6B21A8', '#FFD64E']

function tripDayCount(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
}

export function TripDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useTranslation()

  const [trip, setTrip] = useState<Trip | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteWarning, setDeleteWarning] = useState<TripDeleteWarning | null>(null)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const detailMapRef = useRef<HTMLDivElement | null>(null)
  const [showDetailMap, setShowDetailMap] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        setTrip(await api.trips.get(Number(id)))
      } catch (err: any) {
        setError(err.message || t('trips.detailLoadError'))
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id, t])

  useEffect(() => {
    if (!trip || trip.places.length === 0) {
      setShowDetailMap(false)
      return
    }
    const el = detailMapRef.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setShowDetailMap(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShowDetailMap(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [trip])

  const tripMarkers = useMemo(
    () =>
      trip?.places.map(
        (place): MapMarker => ({
          id: place.place_id,
          lat: place.place_lat,
          lon: place.place_lon,
          title: place.place_name,
          subtitle: place.place_type,
          href: `/lugares/${place.place_id}`,
        })
      ) ?? [],
    [trip]
  )

  const handleDeleteClick = async () => {
    setError('')
    try {
      const warning = await api.trips.deleteWarning(Number(id))
      setDeleteWarning(warning)
      setIsConfirmingDelete(true)
    } catch (err: any) {
      setError(err.message || t('trips.deletePrepError'))
    }
  }

  const handleDeleteConfirm = async () => {
    setError('')
    setIsDeleting(true)
    try {
      await api.trips.delete(Number(id))
      navigate('/viagens')
    } catch (err: any) {
      setError(err.message || t('trips.deleteError'))
      setIsDeleting(false)
      setIsConfirmingDelete(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label={t('loading')}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="sr-only">{t('loadingGeneric')}</span>
      </div>
    )
  }

  if (!trip) {
    return (
      <div className="space-y-6">
        <Link
          to="/viagens"
          className="inline-flex items-center gap-2 rounded-pill bg-surface px-4 py-2 text-[13px] font-semibold text-ink shadow-card"
        >
          <ArrowLeft size={14} /> {t('trips.back')}
        </Link>
        <div className="card">
          <p className="text-red-700 dark:text-red-300">{error || t('trips.notFound')}</p>
        </div>
      </div>
    )
  }

  const status = getTripStatus(trip.start_date, trip.end_date)
  const dayCount = tripDayCount(trip.start_date, trip.end_date)

  return (
    <div className="space-y-6">
      {/* Hero full-bleed: trip map (or brand gradient) with a legibility veil. */}
      <div className="relative h-56 overflow-hidden rounded-card shadow-card md:h-72">
        {trip.places.length > 0 ? (
          <div className="absolute inset-0 dark:brightness-[0.85]">
            <MapView variant="minimal" markers={tripMarkers} height="100%" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-brand" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink/15 via-transparent to-ink/80" />
        <Link
          to="/viagens"
          className="absolute left-6 top-6 inline-flex items-center gap-2 rounded-pill bg-white/90 px-4 py-2 text-[13px] font-semibold text-ink shadow-pop transition-colors hover:bg-white"
        >
          <ArrowLeft size={14} /> {t('nav.trips')}
        </Link>
        <StatusChip status={status} className="absolute right-6 top-6" />
        <div className="absolute bottom-5 left-6 right-6 text-white">
          <h1 className="font-display text-[34px] font-bold leading-tight">{formatTripTitle(trip, user)}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-5 text-sm text-white/85">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={15} aria-hidden="true" />
              {formatTripDateRange(trip.start_date, trip.end_date, user)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={15} aria-hidden="true" />
              {t('trip.placeCount', { count: trip.places.length })}
            </span>
          </div>
        </div>
      </div>

      {/* Meta line + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          {t('trips.createdBy', { username: trip.creator_username })} · {t('trips.visibility')}:{' '}
          {t(`visibility.option${trip.visibility.charAt(0).toUpperCase() + trip.visibility.slice(1)}`)} ·{' '}
          {t('trips.updatedAt')} {formatDate(trip.updated_at, user)}
        </p>
        <div className="flex flex-wrap gap-2">
          <PinButton entityType="trip" entityId={trip.id} label={t('units.trip.one')} showLabel />
          <Link to={`/viagens/${trip.id}/editar`} className="btn-primary">
            {t('actions.edit')}
          </Link>
          <button
            onClick={handleDeleteClick}
            className="btn-danger"
          >
            {t('actions.delete')}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {isConfirmingDelete && deleteWarning && (
        <div className="card border-2 border-red-300 dark:border-red-800">
          <h3 className="font-display text-lg font-semibold text-red-700 dark:text-red-300">
            {t('trips.deleteTitle')}
          </h3>
          {deleteWarning.affected_projects.length > 0 ? (
            <div className="mt-2 text-sm text-muted">
              <p>{t('trips.deleteWarning')}</p>
              <ul className="mt-2 list-inside list-disc">
                {deleteWarning.affected_projects.map((p) => (
                  <li key={p.id}>{p.name}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">{t('trips.deleteNoProjectsWarning')}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="btn-danger"
            >
              {isDeleting ? t('trips.deleting') : t('trips.deleteConfirm')}
            </button>
            <button onClick={() => setIsConfirmingDelete(false)} disabled={isDeleting} className="btn-outline">
              {t('actions.cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Itinerary — vertical timeline of visited places. */}
        <section className="card lg:col-span-7">
          <h2 className="font-display text-xl font-bold">{t('trip.itinerary')}</h2>
          <p className="mt-1 text-[13px] text-muted">
            {dayCount} {t('trip.days')} · {t('trip.placeCount', { count: trip.places.length })}
          </p>
          {trip.places.length === 0 ? (
            <p className="mt-4 text-sm text-muted">{t('trips.noPlaces')}</p>
          ) : (
            <ol className="timeline mt-8 space-y-9">
              {trip.places.map((place, index) => {
                const color = DAY_COLORS[index % DAY_COLORS.length]
                return (
                  <li key={place.id} className="relative">
                    <span className="timeline-node" style={{ background: color }} aria-hidden="true" />
                    <p
                      className="text-[11px] font-bold uppercase tracking-[1.5px]"
                      style={{ color }}
                    >
                      {t('trip.dayLabel', { day: index + 1 })}
                    </p>
                    <h3 className="mt-1 font-display text-base font-bold">
                      <Link to={`/lugares/${place.place_id}`} className="text-primary hover:underline">
                        {place.place_name}
                      </Link>
                    </h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">{place.place_type}</p>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        {/* Right column: map, mini stats, notes, companions, projects. */}
        <div className="flex flex-col gap-6 lg:col-span-5">
          {trip.places.length > 0 && (
            <div ref={detailMapRef} className="relative h-[232px] overflow-hidden rounded-card shadow-card">
              {showDetailMap ? (
                <MapView variant="detailed" markers={tripMarkers} height="232px" connectMarkers />
              ) : (
                <div className="h-full w-full bg-fill" />
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="card p-4 text-center">
              <p className="font-display text-[21px] font-bold">{dayCount}</p>
              <p className="text-xs text-muted">{t('trip.days')}</p>
            </div>
            <div className="card p-4 text-center">
              <p className="font-display text-[21px] font-bold">{trip.places.length}</p>
              <p className="text-xs text-muted">{t('units.place.other')}</p>
            </div>
            <div className="card p-4 text-center">
              <p className="font-display text-[21px] font-bold">{trip.projects.length}</p>
              <p className="text-xs text-muted">{t('units.project.other')}</p>
            </div>
          </div>

          {trip.notes && (
            <section className="card">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold">
                <StickyNote size={16} className="text-amber-deep" aria-hidden="true" /> {t('trip.notes')}
              </h2>
              {/* Notes HTML is sanitised server-side. */}
              <div
                className="notes-content mt-3 text-[13px] text-muted"
                dangerouslySetInnerHTML={{ __html: trip.notes }}
              />
            </section>
          )}

          <section className="card">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold">
              <Users size={16} className="text-coral" aria-hidden="true" /> {t('trips.companions')}
            </h2>
            {trip.participants.length === 0 && !trip.companions_text ? (
              <p className="mt-3 text-sm text-muted">{t('trips.noCompanions')}</p>
            ) : (
              <div className="mt-3 space-y-1 text-sm text-ink">
                {trip.participants.length > 0 && (
                  <p>
                    {t('trips.participants')}: {trip.participants.map((u) => u.username).join(', ')}
                  </p>
                )}
                {trip.companions_text && <p>{trip.companions_text}</p>}
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold">
              <FolderOpen size={16} className="text-plum" aria-hidden="true" /> {t('trips.associatedProjects')}
            </h2>
            {trip.projects.length === 0 ? (
              <p className="mt-3 text-sm text-muted">{t('trips.noAssociatedProjects')}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {trip.projects.map((project) => (
                  <li key={project.id} className="text-sm">
                    <Link to={`/projetos/${project.id}`} className="font-medium text-primary hover:underline">
                      {project.name}
                    </Link>
                    <span className="text-muted">
                      {' '}
                      · {t('projects.progressText', { visited: project.visited_places, total: project.total_places })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <TripPhotos trip={trip} />
    </div>
  )
}
