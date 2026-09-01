import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '@/api'
import { MapView, type MapMarker } from '@/components/MapView'
import { formatTripTitle } from '@/utils/format'
import type { Trip, TripDeleteWarning } from '@/types'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatDateRange(start: string, end: string): string {
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`
}

const visibilityLabels: Record<Trip['visibility'], string> = {
  all: 'Todos',
  specific: 'Utilizadores específicos',
  private: 'Privado',
}

export function TripDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [trip, setTrip] = useState<Trip | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteWarning, setDeleteWarning] = useState<TripDeleteWarning | null>(null)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        setTrip(await api.trips.get(Number(id)))
      } catch (err: any) {
        setError(err.message || 'Viagem não encontrada')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id])

  const handleDeleteClick = async () => {
    setError('')
    try {
      const warning = await api.trips.deleteWarning(Number(id))
      setDeleteWarning(warning)
      setIsConfirmingDelete(true)
    } catch (err: any) {
      setError(err.message || 'Erro ao preparar a eliminação')
    }
  }

  const handleDeleteConfirm = async () => {
    setError('')
    setIsDeleting(true)
    try {
      await api.trips.delete(Number(id))
      navigate('/viagens')
    } catch (err: any) {
      setError(err.message || 'Erro ao apagar viagem')
      setIsDeleting(false)
      setIsConfirmingDelete(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label="A carregar">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        <span className="sr-only">A carregar...</span>
      </div>
    )
  }

  if (!trip) {
    return (
      <div className="space-y-6">
        <Link to="/viagens" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
          ← Voltar às viagens
        </Link>
        <div className="card">
          <p className="text-red-700 dark:text-red-300">{error || 'Viagem não encontrada.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/viagens" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
          ← Voltar às viagens
        </Link>
        <div className="flex gap-2">
          <Link to={`/viagens/${trip.id}/editar`} className="btn-primary">
            Editar
          </Link>
          <button
            onClick={handleDeleteClick}
            className="rounded-xl bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:focus-visible:ring-offset-neutral-900"
          >
            Apagar
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {isConfirmingDelete && deleteWarning && (
        <div className="card border-red-300 dark:border-red-800">
          <h3 className="font-display text-lg font-semibold text-red-700 dark:text-red-300">
            Apagar esta viagem?
          </h3>
          {deleteWarning.affected_projects.length > 0 ? (
            <div className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              <p>
                Atenção: os lugares desta viagem podem deixar de contar como visitados nos seguintes projetos:
              </p>
              <ul className="mt-2 list-inside list-disc">
                {deleteWarning.affected_projects.map((p) => (
                  <li key={p.id}>{p.name}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Esta ação não pode ser anulada.
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="rounded-xl bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {isDeleting ? 'A apagar...' : 'Confirmar eliminação'}
            </button>
            <button onClick={() => setIsConfirmingDelete(false)} disabled={isDeleting} className="btn-outline">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="font-display text-2xl font-bold">{formatTripTitle(trip)}</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {formatDateRange(trip.start_date, trip.end_date)} · Criada por {trip.creator_username} ·
          Visibilidade: {visibilityLabels[trip.visibility]} · Atualizada em {formatDate(trip.updated_at)}
        </p>
      </div>

      {trip.places.length > 0 && (
        <div className="card">
          <h3 className="mb-3 font-display text-lg font-semibold">Mapa da viagem</h3>
          <MapView
            variant="detailed"
            markers={trip.places.map(
              (place): MapMarker => ({
                id: place.place_id,
                lat: place.place_lat,
                lon: place.place_lon,
                title: place.place_name,
                subtitle: place.place_type,
                href: `/lugares/${place.place_id}`,
              })
            )}
          />
        </div>
      )}

      <div className="card">
        <h3 className="mb-3 font-display text-lg font-semibold">Lugares visitados</h3>
        {trip.places.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Sem lugares associados.</p>
        ) : (
          <ul className="space-y-2">
            {trip.places.map((place) => (
              <li key={place.id}>
                <Link
                  to={`/lugares/${place.place_id}`}
                  className="font-medium text-primary-700 hover:underline dark:text-primary-300"
                >
                  {place.place_name}
                </Link>
                <span className="text-sm text-neutral-500 dark:text-neutral-400"> [{place.place_type}]</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3 className="mb-3 font-display text-lg font-semibold">Companhia</h3>
        {trip.participants.length === 0 && !trip.companions_text ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Sem companhia registada.</p>
        ) : (
          <div className="space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
            {trip.participants.length > 0 && (
              <p>Utilizadores: {trip.participants.map((u) => u.username).join(', ')}</p>
            )}
            {trip.companions_text && <p>{trip.companions_text}</p>}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="mb-3 font-display text-lg font-semibold">Projetos associados</h3>
        {trip.projects.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Sem projetos associados.</p>
        ) : (
          <ul className="space-y-2">
            {trip.projects.map((project) => (
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

      {trip.notes && (
        <div className="card">
          <h3 className="mb-3 font-display text-lg font-semibold">Notas</h3>
          {/* O HTML das notas é sanitizado no servidor */}
          <div
            className="notes-content text-sm text-neutral-700 dark:text-neutral-300"
            dangerouslySetInnerHTML={{ __html: trip.notes }}
          />
        </div>
      )}
    </div>
  )
}
