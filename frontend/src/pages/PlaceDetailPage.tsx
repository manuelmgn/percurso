import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { MapView, type MapMarker, type MapPolygon } from '@/components/MapView'
import type { PlaceDetail } from '@/types'
import { formatHierarchy, formatTripTitle } from '@/utils/format'
import type { Geometry } from 'geojson'

export function PlaceDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()

  const [place, setPlace] = useState<PlaceDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        setPlace(await api.places.get(Number(id)))
      } catch (err: any) {
        setError(err.message || t('places.detailLoadError'))
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id, t])

  // Memoised so unrelated state changes (e.g. user prefs) don't rebuild the
  // map and refit its bounds on every render.
  const { markers, polygons } = useMemo(() => {
    if (!place) return { markers: [] as MapMarker[], polygons: [] as MapPolygon[] }
    if (place.polygon) {
      return {
        markers: [] as MapMarker[],
        polygons: [{
          id: place.id,
          geojson: place.polygon as unknown as Geometry,
          title: place.name,
          subtitle: place.place_type,
          visited: true,
        }] as MapPolygon[],
      }
    }
    return {
      markers: [{ id: place.id, lat: place.lat, lon: place.lon, title: place.name, subtitle: place.place_type }] as MapMarker[],
      polygons: [] as MapPolygon[],
    }
  }, [place])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label={t('loading')}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="sr-only">{t('loadingGeneric')}</span>
      </div>
    )
  }

  if (!place) {
    return (
      <div className="space-y-6">
        <Link to="/lugares" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
          ← {t('places.back')}
        </Link>
        <div className="card">
          <p className="text-red-700 dark:text-red-300">{error || t('places.detailLoadError')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link to="/lugares" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
        ← {t('places.back')}
      </Link>

      <div className="card">
        <h2 className="font-display text-2xl font-bold">{place.name}</h2>
        <p className="mt-1 text-sm text-muted">
          {place.place_type}
          {formatHierarchy(place.hierarchy) && ` · ${formatHierarchy(place.hierarchy)}`}
        </p>
        <p className="mt-1 text-xs text-muted">
          {t('places.coordinates', { lat: place.lat.toFixed(5), lon: place.lon.toFixed(5) })}
        </p>
      </div>

      <div className="card">
        <MapView variant="detailed" height="250px" markers={markers} polygons={polygons} />
      </div>

      <div className="card">
        <h3 className="mb-3 font-display text-lg font-semibold">{t('places.projects')}</h3>
        {place.projects.length === 0 ? (
          <p className="text-sm text-muted">
            {t('places.noProjects')}
          </p>
        ) : (
          <ul className="space-y-2">
            {place.projects.map((project) => (
              <li key={project.id}>
                <Link
                  to={`/projetos/${project.id}`}
                  className="font-medium text-primary-700 hover:underline dark:text-primary-300"
                >
                  {project.name}
                </Link>
                <span className="text-sm text-muted">
                  {' '}· {t('projects.progressText', { visited: project.visited_places, total: project.total_places })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3 className="mb-3 font-display text-lg font-semibold">{t('places.tripHistory')}</h3>
        {place.trips.length === 0 ? (
          <p className="text-sm text-muted">
            {t('places.noTripHistory')}
          </p>
        ) : (
          <ul className="space-y-2">
            {place.trips.map((trip) => (
              <li key={trip.id}>
                <Link
                  to={`/viagens/${trip.id}`}
                  className="font-medium text-primary-700 hover:underline dark:text-primary-300"
                >
                  {formatTripTitle(trip, user)}
                </Link>
                <span className="text-sm text-muted">
                  {' '}· {trip.creator_username}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
