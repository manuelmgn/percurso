import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '@/api'
import { PlacePicker, type PickedPlace } from '@/components/PlacePicker'
import { MapView, type MapMarker, type MapPolygon } from '@/components/MapView'
import type { BulkImportLine, PlaceSearchResult, PlaceType, Project } from '@/types'
import { BIG_PLACE_TYPES, PLACE_TYPES } from '@/types'
import { formatHierarchy, formatTripTitle } from '@/utils/format'
import { checkAndCelebrate } from '@/utils/milestones'
import type { Geometry } from 'geojson'

const VISITED_COLOR = '#f59e0b'
const PENDING_COLOR = '#7a756d'

const visibilityLabels: Record<Project['visibility'], string> = {
  all: 'Todos',
  specific: 'Utilizadores específicos',
  private: 'Privado',
}

const mapModeLabels: Record<Project['map_mode'], string> = {
  points: 'Pontos',
  polygons: 'Polígonos',
  auto: 'Automático',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatCandidate(result: PlaceSearchResult): string {
  const hierarchy = formatHierarchy(result.hierarchy)
  return `${result.name}${hierarchy ? ` — ${hierarchy}` : ''} [${result.place_type}]`
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const projectId = Number(id)

  const [project, setProject] = useState<Project | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const [addSelection, setAddSelection] = useState<PickedPlace[]>([])
  const [isAddingPlace, setIsAddingPlace] = useState(false)
  const [removingPlaceId, setRemovingPlaceId] = useState<number | null>(null)
  const [busyPlaceId, setBusyPlaceId] = useState<number | null>(null)

  const [showBulk, setShowBulk] = useState(false)
  const [bulkText, setBulkText] = useState('')
  // '' = mixed types; otherwise every line is assumed to be of this type
  const [bulkType, setBulkType] = useState<PlaceType | ''>('')
  const [bulkLines, setBulkLines] = useState<BulkImportLine[] | null>(null)
  // Indices of ambiguous lines where a bulk "select all of type" action found
  // several candidates of that type — highlighted for manual choice.
  const [bulkConflicts, setBulkConflicts] = useState<Set<number>>(new Set())
  const [isResolving, setIsResolving] = useState(false)
  const [isImportingBulk, setIsImportingBulk] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        setProject(await api.projects.get(projectId))
      } catch (err: any) {
        setError(err.message || 'Projeto não encontrado')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [projectId])

  const handleDelete = async () => {
    setError('')
    setIsDeleting(true)
    try {
      await api.projects.delete(projectId)
      navigate('/projetos')
    } catch (err: any) {
      setError(err.message || 'Erro ao apagar projeto')
      setIsDeleting(false)
      setIsConfirmingDelete(false)
    }
  }

  const handlePlacePicked = async (places: PickedPlace[]) => {
    // Single-select usage: picking a suggestion adds it to the project
    // immediately — no extra confirmation button.
    if (places.length === 0) {
      setAddSelection([])
      return
    }
    setError('')
    setIsAddingPlace(true)
    try {
      setProject(await api.projects.addPlace(projectId, places[0].id))
      checkAndCelebrate()
    } catch (err: any) {
      setError(err.message || 'Erro ao adicionar lugar')
    } finally {
      setAddSelection([])
      setIsAddingPlace(false)
    }
  }

  const handleToggleUnmark = async (placeId: number) => {
    setError('')
    setBusyPlaceId(placeId)
    try {
      setProject(await api.projects.toggleUnmark(projectId, placeId))
      checkAndCelebrate()
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar lugar')
    } finally {
      setBusyPlaceId(null)
    }
  }

  const handleRemovePlace = async (placeId: number) => {
    setError('')
    setBusyPlaceId(placeId)
    try {
      setProject(await api.projects.removePlace(projectId, placeId))
      setRemovingPlaceId(null)
      checkAndCelebrate()
    } catch (err: any) {
      setError(err.message || 'Erro ao remover lugar')
    } finally {
      setBusyPlaceId(null)
    }
  }

  const handleResolve = async () => {
    const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return
    setError('')
    setIsResolving(true)
    try {
      const response = await api.projects.bulkImport(projectId, lines, bulkType || null)
      setBulkLines(response.lines)
      setBulkConflicts(new Set())
    } catch (err: any) {
      setError(err.message || 'Erro ao resolver lugares')
    } finally {
      setIsResolving(false)
    }
  }

  const handleSelectCandidate = (lineIndex: number, candidate: PlaceSearchResult) => {
    setBulkLines((prev) =>
      prev ? prev.map((l, i) => (i === lineIndex ? { ...l, selected: candidate } : l)) : prev
    )
    setBulkConflicts((prev) => {
      if (!prev.has(lineIndex)) return prev
      const next = new Set(prev)
      next.delete(lineIndex)
      return next
    })
  }

  // Bulk-select: for every ambiguous line still without a selection, pick the
  // candidate of the given type when there is exactly one. Lines with several
  // candidates of that type are left untouched and highlighted as conflicts.
  const handleSelectAllOfType = (type: PlaceType) => {
    if (!bulkLines) return
    const conflicts = new Set(bulkConflicts)
    setBulkLines(
      bulkLines.map((line, i) => {
        if (line.status !== 'ambiguous' || line.selected) return line
        const ofType = line.candidates.filter((c) => c.place_type === type)
        if (ofType.length === 1) {
          conflicts.delete(i)
          return { ...line, selected: ofType[0] }
        }
        if (ofType.length > 1) conflicts.add(i)
        return line
      })
    )
    setBulkConflicts(conflicts)
  }

  const hasUnresolvedAmbiguous =
    bulkLines?.some((l) => l.status === 'ambiguous' && !l.selected) ?? false

  // Types present among candidates of ambiguous lines still pending a choice,
  // with the number of lines each type could auto-resolve (exactly 1 candidate).
  const bulkSelectableTypes: { type: PlaceType; count: number }[] = []
  if (bulkLines) {
    const counts = new Map<PlaceType, number>()
    for (const line of bulkLines) {
      if (line.status !== 'ambiguous' || line.selected) continue
      const byType = new Map<PlaceType, number>()
      for (const c of line.candidates) byType.set(c.place_type, (byType.get(c.place_type) ?? 0) + 1)
      for (const [type, n] of byType) {
        if (n === 1) counts.set(type, (counts.get(type) ?? 0) + 1)
        else if (!counts.has(type)) counts.set(type, counts.get(type) ?? 0)
      }
    }
    for (const [type, count] of counts) bulkSelectableTypes.push({ type, count })
  }

  // Lines with no candidate at all, summarised above the confirm button
  const bulkNotFound = bulkLines?.filter((l) => l.status === 'not_found').map((l) => l.line) ?? []

  const handleConfirmBulk = async () => {
    if (!bulkLines) return
    setError('')
    setIsImportingBulk(true)
    try {
      setProject(await api.projects.bulkImportConfirm(projectId, bulkLines))
      setBulkLines(null)
      setBulkText('')
      setShowBulk(false)
    } catch (err: any) {
      setError(err.message || 'Erro ao importar lugares')
    } finally {
      setIsImportingBulk(false)
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

  if (!project) {
    return (
      <div className="space-y-6">
        <Link to="/projetos" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
          ← Voltar aos projetos
        </Link>
        <div className="card">
          <p className="text-red-700 dark:text-red-300">{error || 'Projeto não encontrado.'}</p>
        </div>
      </div>
    )
  }

  const types = new Set(project.places.map((p) => p.place_type))
  const homogeneous = types.size <= 1
  let effectiveMode: 'points' | 'polygons' = 'points'
  if (homogeneous) {
    if (project.map_mode === 'polygons') {
      effectiveMode = 'polygons'
    } else if (project.map_mode === 'auto') {
      const onlyType = project.places[0]?.place_type
      effectiveMode = onlyType && BIG_PLACE_TYPES.includes(onlyType) ? 'polygons' : 'points'
    }
  }

  const mapMarkers: MapMarker[] = []
  const mapPolygons: MapPolygon[] = []
  for (const place of project.places) {
    const visited = place.is_visited && !place.is_unmarked
    const stateLabel = visited ? 'Visitado' : 'Pendente'
    const href = `/lugares/${place.place_id}`
    if (effectiveMode === 'polygons' && place.place_polygon) {
      mapPolygons.push({
        id: place.place_id,
        geojson: place.place_polygon as unknown as Geometry,
        title: place.place_name,
        subtitle: stateLabel,
        href,
        visited,
      })
    } else {
      mapMarkers.push({
        id: place.place_id,
        lat: place.place_lat,
        lon: place.place_lon,
        title: place.place_name,
        subtitle: stateLabel,
        href,
        color: visited ? VISITED_COLOR : PENDING_COLOR,
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/projetos" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
          ← Voltar aos projetos
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link to={`/viagens/novo?projeto=${project.id}`} className="btn-secondary">
            Nova viagem com este projeto
          </Link>
          <Link to={`/projetos/${project.id}/editar`} className="btn-primary">
            Editar
          </Link>
          <button
            onClick={() => setIsConfirmingDelete(true)}
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

      {isConfirmingDelete && (
        <div className="card border-red-300 dark:border-red-800">
          <h3 className="font-display text-lg font-semibold text-red-700 dark:text-red-300">
            Apagar este projeto?
          </h3>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            O projeto será eliminado, mas os lugares e as viagens associadas mantêm-se. Esta ação não pode ser anulada.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleDelete}
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
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display text-2xl font-bold">{project.name}</h2>
          {project.is_completed && (
            <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700 dark:bg-green-900/20 dark:text-green-300">
              Completado
            </span>
          )}
        </div>
        {project.description && (
          <p className="mt-2 whitespace-pre-line text-neutral-700 dark:text-neutral-300">{project.description}</p>
        )}
        <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
          Visibilidade: {visibilityLabels[project.visibility]} · Mapa: {mapModeLabels[project.map_mode]} · Criado por{' '}
          {project.creator_username} · Atualizado em {formatDate(project.updated_at)}
        </p>
        {project.participants.length > 0 && (
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Participantes: {project.participants.map((u) => u.username).join(', ')}
          </p>
        )}

        <div className="mt-4">
          {project.total_places > 0 ? (
            <>
              <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                <div
                  className="h-full rounded-full bg-primary-600 transition-all"
                  style={{ width: `${project.progress_percent}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                {project.visited_places} de {project.total_places} visitados · {Math.round(project.progress_percent)}%
              </p>
            </>
          ) : (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Projeto aberto (sem lista de objetivos).
            </p>
          )}
        </div>
      </div>

      {project.places.length > 0 && (
        <div className="card">
          <h3 className="mb-3 font-display text-lg font-semibold">Mapa do projeto</h3>
          <MapView variant="detailed" markers={mapMarkers} polygons={mapPolygons} />
        </div>
      )}

      <div className="card">
        <h3 className="mb-4 font-display text-lg font-semibold">Lugares objetivo</h3>

        {project.places.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Ainda não há lugares objetivo neste projeto.
          </p>
        ) : (
          <ul className="space-y-3">
            {project.places.map((place) => (
              <li
                key={place.id}
                className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/lugares/${place.place_id}`}
                    className="font-medium text-primary-700 hover:underline dark:text-primary-300"
                  >
                    {place.place_name}
                  </Link>
                  <span className="text-sm text-neutral-500 dark:text-neutral-400">[{place.place_type}]</span>
                  {place.is_unmarked ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                      Desmarcado
                    </span>
                  ) : place.is_visited ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/20 dark:text-green-300">
                      Visitado
                    </span>
                  ) : (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                      Pendente
                    </span>
                  )}
                </div>
                {formatHierarchy(place.place_hierarchy) && (
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {formatHierarchy(place.place_hierarchy)}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {(place.is_visited || place.is_unmarked) && (
                    <button
                      onClick={() => handleToggleUnmark(place.place_id)}
                      disabled={busyPlaceId === place.place_id}
                      className="rounded-lg bg-neutral-100 px-3 py-1 text-xs font-medium transition-colors hover:bg-neutral-200 disabled:opacity-50 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                    >
                      {place.is_unmarked ? 'Voltar a marcar' : 'Desmarcar visita'}
                    </button>
                  )}
                  {removingPlaceId === place.place_id ? (
                    <>
                      <button
                        onClick={() => handleRemovePlace(place.place_id)}
                        disabled={busyPlaceId === place.place_id}
                        className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                      >
                        {busyPlaceId === place.place_id ? 'A remover...' : 'Confirmar remoção'}
                      </button>
                      <button
                        onClick={() => setRemovingPlaceId(null)}
                        disabled={busyPlaceId === place.place_id}
                        className="rounded-lg bg-neutral-100 px-3 py-1 text-xs font-medium transition-colors hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setRemovingPlaceId(place.place_id)}
                      disabled={busyPlaceId === place.place_id}
                      className="rounded-lg bg-red-100 px-3 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30"
                    >
                      Remover
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <h4 className="mb-2 text-sm font-medium">Adicionar lugar</h4>
          <PlacePicker selected={addSelection} onChange={handlePlacePicked} />
          {isAddingPlace && (
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">A adicionar...</p>
          )}
        </div>

        <div className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <button onClick={() => setShowBulk((v) => !v)} className="btn-outline">
            {showBulk ? 'Fechar importação em massa' : 'Importar lista em massa'}
          </button>

          {showBulk && (
            <div className="mt-4 space-y-3">
              <textarea
                rows={6}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={'Um lugar por linha, ex.:\nLugo\nSantiago de Compostela\nOviedo'}
                className="input font-mono text-sm"
                disabled={isResolving || isImportingBulk}
                aria-label="Lista de lugares para importar"
              />
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="bulk-type"
                  className="text-xs font-medium text-neutral-500 dark:text-neutral-400"
                >
                  Tipo dos lugares:
                </label>
                <select
                  id="bulk-type"
                  value={bulkType}
                  onChange={(e) => {
                    setBulkType(e.target.value as PlaceType | '')
                    // Changing the hint invalidates any previous resolution
                    setBulkLines(null)
                    setBulkConflicts(new Set())
                  }}
                  disabled={isResolving || isImportingBulk}
                  className="input w-auto py-1 text-sm"
                >
                  <option value="">Tipos variados</option>
                  {PLACE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      Todos: {type}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleResolve}
                disabled={isResolving || isImportingBulk || !bulkText.trim()}
                className="btn-primary"
              >
                {isResolving ? 'A resolver lugares...' : 'Resolver'}
              </button>

              {bulkLines && (
                <div className="space-y-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
                  {bulkSelectableTypes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                        Selecionar em massa:
                      </span>
                      {bulkSelectableTypes.map(({ type, count }) => (
                        <button
                          key={type}
                          onClick={() => handleSelectAllOfType(type)}
                          disabled={isImportingBulk}
                          className="btn-outline px-2 py-1 text-xs"
                          title="Seleciona o candidato deste tipo nas linhas em que só há um"
                        >
                          {type} ({count})
                        </button>
                      ))}
                    </div>
                  )}
                  <ul className="space-y-3">
                    {bulkLines.map((line, index) => (
                      <li
                        key={index}
                        className={
                          bulkConflicts.has(index)
                            ? 'rounded-lg p-2 ring-2 ring-amber-400 dark:ring-amber-500'
                            : undefined
                        }
                      >
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{line.line}</p>
                        {line.status === 'resolved' && line.selected && (
                          <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                            ✓ {formatCandidate(line.selected)}
                          </p>
                        )}
                        {line.status === 'ambiguous' && (
                          <div className="mt-1 space-y-1">
                            {line.candidates.map((candidate) => (
                              <label
                                key={`${candidate.osm_type}-${candidate.osm_id}`}
                                className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"
                              >
                                <input
                                  type="radio"
                                  name={`bulk-line-${index}`}
                                  checked={
                                    line.selected?.osm_type === candidate.osm_type &&
                                    line.selected?.osm_id === candidate.osm_id
                                  }
                                  onChange={() => handleSelectCandidate(index, candidate)}
                                  className="h-4 w-4 border-neutral-300 text-primary-600 focus:ring-primary-500"
                                />
                                {formatCandidate(candidate)}
                              </label>
                            ))}
                            {!line.selected && (
                              <p className="text-xs text-amber-600 dark:text-amber-400">
                                {bulkConflicts.has(index)
                                  ? 'Há vários candidatos deste tipo — escolhe manualmente.'
                                  : 'Escolhe uma opção para importar esta linha.'}
                              </p>
                            )}
                          </div>
                        )}
                        {line.status === 'not_found' && (
                          <p className="mt-1 text-sm text-neutral-400 dark:text-neutral-500">
                            Não encontrado — não será importado
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                  {bulkNotFound.length > 0 && (
                    <div className="rounded-lg bg-neutral-100 px-3 py-2 dark:bg-neutral-800/60">
                      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                        {bulkNotFound.length === 1
                          ? 'Não encontrado — não será importado:'
                          : `Não encontrados (${bulkNotFound.length}) — não serão importados:`}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {bulkNotFound.map((line, i) => (
                          <li key={i} className="text-sm text-neutral-500 dark:text-neutral-400">
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handleConfirmBulk}
                      disabled={isImportingBulk || hasUnresolvedAmbiguous}
                      className="btn-primary"
                    >
                      {isImportingBulk ? 'A importar...' : 'Confirmar importação'}
                    </button>
                    <button
                      onClick={() => setBulkLines(null)}
                      disabled={isImportingBulk}
                      className="btn-outline"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="mb-3 font-display text-lg font-semibold">Viagens associadas</h3>
        {project.trips.length === 0 ? (
          <div className="py-2 text-center">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Ainda não há viagens associadas.</p>
            <Link to={`/viagens/novo?projeto=${project.id}`} className="btn-primary mt-4 inline-block">
              Nova viagem com este projeto
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {project.trips.map((trip) => (
              <li key={trip.id}>
                <Link
                  to={`/viagens/${trip.id}`}
                  className="font-medium text-primary-700 hover:underline dark:text-primary-300"
                >
                  {formatTripTitle(trip)}
                </Link>
                <span className="text-sm text-neutral-500 dark:text-neutral-400">
                  {' '}· {trip.creator_username} · {trip.place_count} {trip.place_count === 1 ? 'lugar' : 'lugares'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
