import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { PageShell } from '@/components/PageShell'
import { api } from '@/api'
import { useApiResource } from '@/hooks/useApiResource'
import { useAuth } from '@/context/AuthContext'
import { MapView, type MapMarker, type MapPolygon } from '@/components/MapView'
import { PlaceTypeLabel } from '@/components/ui/PlaceTypeLabel'
import { PlaceRelationBadge } from '@/components/PlaceRelationBadge'
import { PlaceRelationEditor } from '@/components/PlaceRelationEditor'
import { checkAndCelebrate } from '@/utils/milestones'
import type { PlaceDetail, PlaceRelationInput } from '@/types'
import { formatHierarchy, formatPlaceType, formatTripDateRange, formatTripTitle, placeTypeTitle } from '@/utils/format'
import type { Geometry } from 'geojson'

export function PlaceDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [isEditingRelation, setIsEditingRelation] = useState(false)

  const { data: place, setData: setPlace, isLoading, error } = useApiResource<PlaceDetail>(
    () => api.places.get(Number(id)),
    [id],
  )

  const handleSaveRelation = async (payload: PlaceRelationInput) => {
    if (!place) return
    const saved = await api.places.setRelation(place.id, payload)
    setPlace({ ...place, relation: saved })
    setIsEditingRelation(false)
    checkAndCelebrate()
  }

  const handleRemoveRelation = async () => {
    if (!place) return
    await api.places.deleteRelation(place.id)
    setPlace({ ...place, relation: null })
    setIsEditingRelation(false)
  }

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
          subtitle: formatPlaceType(place.place_type),
          subtitleTitle: placeTypeTitle(place.place_type),
          visited: true,
        }] as MapPolygon[],
      }
    }
    return {
      markers: [{
        id: place.id,
        lat: place.lat,
        lon: place.lon,
        title: place.name,
        subtitle: formatPlaceType(place.place_type),
        subtitleTitle: placeTypeTitle(place.place_type),
      }] as MapMarker[],
      polygons: [] as MapPolygon[],
    }
  }, [place])

  return (
    <PageShell skeleton="detail" isLoading={isLoading}>
      {!place ? (
        <>
          <Link to="/lugares" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
            ← {t('places.back')}
          </Link>
          <div className="card">
            <p className="text-red-700 dark:text-red-300">{error || t('places.detailLoadError')}</p>
          </div>
        </>
      ) : (
        <>
      <Link to="/lugares" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
        ← {t('places.back')}
      </Link>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="font-display text-2xl font-bold">{place.name}</h2>
          {place.relation && <PlaceRelationBadge relation={place.relation} size="md" />}
        </div>
        <p className="mt-1 text-sm text-muted">
          <PlaceTypeLabel type={place.place_type} />
          {formatHierarchy(place.hierarchy) && ` · ${formatHierarchy(place.hierarchy)}`}
        </p>
        <p className="mt-1 text-xs text-muted">
          {t('places.coordinates', { lat: place.lat.toFixed(5), lon: place.lon.toFixed(5) })}
        </p>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg font-semibold">{t('places.relation.sectionTitle')}</h3>
          {!isEditingRelation && (
            <button
              type="button"
              onClick={() => setIsEditingRelation(true)}
              className="btn-outline px-3 py-1 text-xs"
            >
              {place.relation ? t('places.relation.edit') : t('places.relation.mark')}
            </button>
          )}
        </div>
        {isEditingRelation ? (
          <div className="mt-4">
            <PlaceRelationEditor
              initial={place.relation}
              onSave={handleSaveRelation}
              onRemove={place.relation ? handleRemoveRelation : undefined}
              onCancel={() => setIsEditingRelation(false)}
              idPrefix={`place-${place.id}-rel`}
            />
          </div>
        ) : place.relation ? (
          <div className="mt-3">
            <PlaceRelationBadge relation={place.relation} size="md" />
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">{t('places.relation.empty')}</p>
        )}
      </div>

      <div className="card">
        <MapView height="250px" markers={markers} polygons={polygons} />
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
                  {' '}· {formatTripDateRange(trip.start_date, trip.end_date, user)} · {trip.creator_username}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
        </>
      )}
    </PageShell>
  )
}
