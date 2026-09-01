import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '@/api'
import { MapView, type MapMarker, type MapPolygon } from '@/components/MapView'
import type { PlaceDetail } from '@/types'
import { formatHierarchy, formatTripTitle } from '@/utils/format'
import type { Geometry } from 'geojson'

export function PlaceDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [place, setPlace] = useState<PlaceDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        setPlace(await api.places.get(Number(id)))
      } catch (err: any) {
        setError(err.message || 'Lugar não encontrado')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label="A carregar">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        <span className="sr-only">A carregar...</span>
      </div>
    )
  }

  if (!place) {
    return (
      <div className="space-y-6">
        <Link to="/lugares" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
          ← Voltar aos lugares
        </Link>
        <div className="card">
          <p className="text-red-700 dark:text-red-300">{error || 'Lugar não encontrado.'}</p>
        </div>
      </div>
    )
  }

  const markers: MapMarker[] = place.polygon
    ? []
    : [{ id: place.id, lat: place.lat, lon: place.lon, title: place.name, subtitle: place.place_type }]
  const polygons: MapPolygon[] = place.polygon
    ? [{ id: place.id, geojson: place.polygon as unknown as Geometry, title: place.name, subtitle: place.place_type, visited: true }]
    : []

  return (
    <div className="space-y-6">
      <Link to="/lugares" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
        ← Voltar aos lugares
      </Link>

      <div className="card">
        <h2 className="font-display text-2xl font-bold">{place.name}</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {place.place_type}
          {formatHierarchy(place.hierarchy) && ` · ${formatHierarchy(place.hierarchy)}`}
        </p>
        <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
          Coordenadas: {place.lat.toFixed(5)}, {place.lon.toFixed(5)}
        </p>
      </div>

      <div className="card">
        <MapView variant="detailed" height="250px" markers={markers} polygons={polygons} />
      </div>

      <div className="card">
        <h3 className="mb-3 font-display text-lg font-semibold">Projetos</h3>
        {place.projects.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Este lugar não é objetivo de nenhum projeto.
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
                <span className="text-sm text-neutral-500 dark:text-neutral-400">
                  {' '}· {project.visited_places} de {project.total_places} visitados
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3 className="mb-3 font-display text-lg font-semibold">Histórico de viagens</h3>
        {place.trips.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Ainda não visitaste este lugar em nenhuma viagem.
          </p>
        ) : (
          <ul className="space-y-2">
            {place.trips.map((trip) => (
              <li key={trip.id}>
                <Link
                  to={`/viagens/${trip.id}`}
                  className="font-medium text-primary-700 hover:underline dark:text-primary-300"
                >
                  {formatTripTitle(trip)}
                </Link>
                <span className="text-sm text-neutral-500 dark:text-neutral-400">
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
