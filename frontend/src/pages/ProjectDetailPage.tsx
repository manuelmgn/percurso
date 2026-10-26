import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '@/api'
import { useApiResource, getErrorMessage } from '@/hooks/useApiResource'
import { PlacePicker, type PickedPlace } from '@/components/PlacePicker'
import { MapView, type MapMarker, type MapPolygon } from '@/components/MapView'
import { PinButton } from '@/components/PinButton'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { PageSpinner } from '@/components/ui/PageSpinner'
import type { BulkImportLine, PlaceSearchResult, PlaceType, Project } from '@/types'
import { PLACE_TYPES, isPolygonMode } from '@/types'
import { formatHierarchy, formatTripTitle, formatDate as formatUserDate, visibilityLabelKey } from '@/utils/format'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from '@/i18n'
import { checkAndCelebrate } from '@/utils/milestones'
import type { Geometry } from 'geojson'

const VISITED_COLOR = '#f59e0b'
const PENDING_COLOR = '#7a756d'

function formatCandidate(result: PlaceSearchResult): string {
  const hierarchy = formatHierarchy(result.hierarchy)
  return `${result.name}${hierarchy ? ` — ${hierarchy}` : ''} [${result.place_type}]`
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const projectId = Number(id)
  const { user } = useAuth()
  const { t, pluralize } = useTranslation()

  // Page data via the shared hook (race-guarded across project switches);
  // mutation errors get their own channel so load errors don't mask them.
  const { data: project, setData: setProject, isLoading, error } = useApiResource<Project>(
    () => api.projects.get(projectId),
    [projectId],
  )
  const [actionError, setActionError] = useState('')
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

  // Map data is derived from the project — memoise it so typing in the bulk
  // import textarea or toggling a place doesn't rebuild the map (and refit
  // its bounds) on every render.
  const { mapMarkers, mapPolygons } = useMemo(() => {
    const markers: MapMarker[] = []
    const polygons: MapPolygon[] = []
    if (!project) return { mapMarkers: markers, mapPolygons: polygons }

    const types = project.places.map((p) => p.place_type)
    // Polygon rendering only when the mode asks for it and the types are
    // homogeneous — resolved by the shared helper (mirrors the editor).
    const effectiveMode = isPolygonMode(project.map_mode, types)

    for (const place of project.places) {
      const visited = place.is_visited && !place.is_unmarked
      const stateLabel = visited ? t('projects.visited') : t('projects.pending')
      const href = `/lugares/${place.place_id}`
      if (effectiveMode && place.place_polygon) {
        polygons.push({
          id: place.place_id,
          geojson: place.place_polygon as unknown as Geometry,
          title: place.place_name,
          subtitle: stateLabel,
          href,
          visited,
        })
      } else {
        markers.push({
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
    return { mapMarkers: markers, mapPolygons: polygons }
  }, [project, t])

  const handleDelete = async () => {
    setActionError('')
    setIsDeleting(true)
    try {
      await api.projects.delete(projectId)
      navigate('/projetos')
    } catch (err) {
      setActionError(getErrorMessage(err, t('projects.deleteError')))
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
    setActionError('')
    setIsAddingPlace(true)
    try {
      setProject(await api.projects.addPlace(projectId, places[0].id))
      checkAndCelebrate()
    } catch (err) {
      setActionError(getErrorMessage(err, t('projects.addPlaceError')))
    } finally {
      setAddSelection([])
      setIsAddingPlace(false)
    }
  }

  const handleToggleUnmark = async (placeId: number) => {
    setActionError('')
    setBusyPlaceId(placeId)
    try {
      setProject(await api.projects.toggleUnmark(projectId, placeId))
      checkAndCelebrate()
    } catch (err) {
      setActionError(getErrorMessage(err, t('projects.togglePlaceError')))
    } finally {
      setBusyPlaceId(null)
    }
  }

  const handleRemovePlace = async (placeId: number) => {
    setActionError('')
    setBusyPlaceId(placeId)
    try {
      setProject(await api.projects.removePlace(projectId, placeId))
      setRemovingPlaceId(null)
      checkAndCelebrate()
    } catch (err) {
      setActionError(getErrorMessage(err, t('projects.removePlaceError')))
    } finally {
      setBusyPlaceId(null)
    }
  }

  const handleResolve = async () => {
    const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return
    setActionError('')
    setIsResolving(true)
    try {
      const response = await api.projects.bulkImport(projectId, lines, bulkType || null)
      setBulkLines(response.lines)
      setBulkConflicts(new Set())
    } catch (err) {
      setActionError(getErrorMessage(err, t('projects.bulkResolveError')))
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
  const bulkSelectableTypes = useMemo<{ type: PlaceType; count: number }[]>(() => {
    if (!bulkLines) return []
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
    return [...counts].map(([type, count]) => ({ type, count }))
  }, [bulkLines])

  // Lines with no candidate at all, summarised above the confirm button
  const bulkNotFound = useMemo(
    () => bulkLines?.filter((l) => l.status === 'not_found').map((l) => l.line) ?? [],
    [bulkLines],
  )

  const handleConfirmBulk = async () => {
    if (!bulkLines) return
    setActionError('')
    setIsImportingBulk(true)
    try {
      setProject(await api.projects.bulkImportConfirm(projectId, bulkLines))
      setBulkLines(null)
      setBulkText('')
      setShowBulk(false)
    } catch (err) {
      setActionError(getErrorMessage(err, t('projects.bulkImportError')))
    } finally {
      setIsImportingBulk(false)
    }
  }


  if (isLoading) {
    return <PageSpinner />
  }

  if (!project) {
    return (
      <div className="space-y-6">
        <Link to="/projetos" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
          ← {t('projects.back')}
        </Link>
        <div className="card">
          <p className="text-red-700 dark:text-red-300">{error || t('projects.notFound')}</p>
        </div>
      </div>
    )
  }

  const mapModeLabelKey: Record<Project['map_mode'], string> = {
    points: 'projects.mapPoints',
    polygons: 'projects.mapPolygons',
    auto: 'projects.mapAuto',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/projetos" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
          ← {t('projects.back')}
        </Link>
        <div className="flex flex-wrap gap-2">
          <PinButton entityType="project" entityId={project.id} label={t('units.project.one')} showLabel />
          <Link to={`/viagens/novo?projeto=${project.id}`} className="btn-secondary">
            {t('projects.newTripWithProject')}
          </Link>
          <Link to={`/projetos/${project.id}/editar`} className="btn-primary">
            {t('actions.edit')}
          </Link>
          <button
            onClick={() => setIsConfirmingDelete(true)}
            className="btn-danger"
          >
            {t('actions.delete')}
          </button>
        </div>
      </div>
      <ErrorBanner message={error || actionError} />

      {isConfirmingDelete && (
        <div className="card border-red-300 dark:border-red-800">
          <h3 className="font-display text-lg font-semibold text-red-700 dark:text-red-300">
            {t('projects.deleteTitle')}
          </h3>
          <p className="mt-2 text-sm text-muted">
            {t('projects.deleteWarning')}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="btn-danger"
            >
              {isDeleting ? t('projects.deleting') : t('projects.deleteConfirm')}
            </button>
            <button onClick={() => setIsConfirmingDelete(false)} disabled={isDeleting} className="btn-outline">
              {t('actions.cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display text-2xl font-bold">{project.name}</h2>
          {project.is_completed && (
            <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700 dark:bg-green-900/20 dark:text-green-300">
              {t('projects.completedBadge')}
            </span>
          )}
        </div>
        {project.description && (
          <p className="mt-2 whitespace-pre-line text-ink">{project.description}</p>
        )}
        <p className="mt-3 text-sm text-muted">
          {t('projects.visibility')}: {t(visibilityLabelKey(project.visibility))} · {t('projects.map')}: {t(mapModeLabelKey[project.map_mode])} · {t('projects.createdBy', { username: project.creator_username })} · {t('projects.updatedAt')} {formatUserDate(project.updated_at, user)}
        </p>
        {project.participants.length > 0 && (
          <p className="mt-1 text-sm text-muted">
            {t('projects.participants')}: {project.participants.map((u) => u.username).join(', ')}
          </p>
        )}

        <div className="mt-4">
          {project.total_places > 0 ? (
            <>
              <ProgressBar percent={project.progress_percent} label={t('projects.progress')} heightClass="h-3" roundedClass="rounded-full" fillClass="bg-primary-600" />
              <p className="mt-2 text-sm text-muted">
                {t('projects.progressText', { visited: project.visited_places, total: project.total_places })} · {Math.round(project.progress_percent)}%
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">
              {t('projects.openProject')}
            </p>
          )}
        </div>
      </div>

      {project.places.length > 0 && (
        <div className="card">
          <h3 className="mb-3 font-display text-lg font-semibold">{t('projects.mapTitle')}</h3>
          <MapView variant="detailed" markers={mapMarkers} polygons={mapPolygons} />
        </div>
      )}

      <div className="card">
        <h3 className="mb-4 font-display text-lg font-semibold">{t('projects.targetPlaces')}</h3>

        {project.places.length === 0 ? (
          <p className="text-sm text-muted">
            {t('projects.noPlaces')}
          </p>
        ) : (
          <ul className="space-y-3">
            {project.places.map((place) => (
              <li
                key={place.id}
                className="rounded-xl border border-line p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/lugares/${place.place_id}`}
                    className="font-medium text-primary-700 hover:underline dark:text-primary-300"
                  >
                    {place.place_name}
                  </Link>
                  <span className="text-sm text-muted">[{place.place_type}]</span>
                  {place.is_unmarked ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                      {t('projects.unmarked')}
                    </span>
                  ) : place.is_visited ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/20 dark:text-green-300">
                      {t('projects.visited')}
                    </span>
                  ) : (
                    <span className="rounded-full bg-line/40 px-2 py-0.5 text-xs font-medium text-muted dark:bg-fill dark:text-muted">
                      {t('projects.pending')}
                    </span>
                  )}
                </div>
                {formatHierarchy(place.place_hierarchy) && (
                  <p className="mt-1 text-xs text-muted">
                    {formatHierarchy(place.place_hierarchy)}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {(place.is_visited || place.is_unmarked) && (
                    <button
                      onClick={() => handleToggleUnmark(place.place_id)}
                      disabled={busyPlaceId === place.place_id}
                      className="rounded-lg bg-line/40 px-3 py-1 text-xs font-medium transition-colors hover:bg-line disabled:opacity-50 dark:bg-fill dark:hover:bg-fill"
                    >
                      {place.is_unmarked ? t('projects.markVisitedAgain') : t('projects.unmarkVisit')}
                    </button>
                  )}
                  {removingPlaceId === place.place_id ? (
                    <>
                      <button
                        onClick={() => handleRemovePlace(place.place_id)}
                        disabled={busyPlaceId === place.place_id}
                        className="btn-danger"
                      >
                        {busyPlaceId === place.place_id ? t('projects.removing') : t('projects.confirmRemove')}
                      </button>
                      <button
                        onClick={() => setRemovingPlaceId(null)}
                        disabled={busyPlaceId === place.place_id}
                        className="rounded-lg bg-line/40 px-3 py-1 text-xs font-medium transition-colors hover:bg-line dark:hover:bg-fill"
                      >
                        {t('actions.cancel')}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setRemovingPlaceId(place.place_id)}
                      disabled={busyPlaceId === place.place_id}
                      className="rounded-lg bg-red-100 px-3 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30"
                    >
                      {t('projects.removePlace')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 border-t border-line pt-4">
          <h4 className="mb-2 text-sm font-medium">{t('projects.addPlace')}</h4>
          <PlacePicker selected={addSelection} onChange={handlePlacePicked} />
          {isAddingPlace && (
            <p className="mt-2 text-sm text-muted">{t('projects.addingPlace')}</p>
          )}
        </div>

        <div className="mt-6 border-t border-line pt-4">
          <button onClick={() => setShowBulk((v) => !v)} className="btn-outline">
            {showBulk ? t('bulkImport.close') : t('bulkImport.title')}
          </button>

          {showBulk && (
            <div className="mt-4 space-y-3">
              <textarea
                rows={6}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={t('bulkImport.placeholder')}
                className="input font-mono text-sm"
                disabled={isResolving || isImportingBulk}
                aria-label={t('bulkImport.title')}
              />
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="bulk-type"
                  className="text-xs font-medium text-muted"
                >
                  {t('bulkImport.typeLabel')}
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
                  <option value="">{t('bulkImport.typeMixed')}</option>
                  {PLACE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t('bulkImport.typeAll', { type })}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleResolve}
                disabled={isResolving || isImportingBulk || !bulkText.trim()}
                className="btn-primary"
              >
                {isResolving ? t('bulkImport.resolving') : t('bulkImport.resolve')}
              </button>

              {bulkLines && (
                <div className="space-y-3 rounded-xl border border-line p-4">
                  {bulkSelectableTypes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-muted">
                        {t('bulkImport.selectAll')}
                      </span>
                      {bulkSelectableTypes.map(({ type, count }) => (
                        <button
                          key={type}
                          onClick={() => handleSelectAllOfType(type)}
                          disabled={isImportingBulk}
                          className="btn-outline px-2 py-1 text-xs"
                          title={t('bulkImport.selectAllTitle')}
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
                        <p className="text-sm font-medium text-ink">{line.line}</p>
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
                                className="flex items-center gap-2 text-sm text-ink"
                              >
                                <input
                                  type="radio"
                                  name={`bulk-line-${index}`}
                                  checked={
                                    line.selected?.osm_type === candidate.osm_type &&
                                    line.selected?.osm_id === candidate.osm_id
                                  }
                                  onChange={() => handleSelectCandidate(index, candidate)}
                                  className="h-4 w-4 border-line text-primary-600 focus:ring-primary"
                                />
                                {formatCandidate(candidate)}
                              </label>
                            ))}
                            {!line.selected && (
                              <p className="text-xs text-amber-600 dark:text-amber-400">
                                {bulkConflicts.has(index)
                                  ? t('bulkImport.conflict')
                                  : t('bulkImport.chooseOption')}
                              </p>
                            )}
                          </div>
                        )}
                        {line.status === 'not_found' && (
                          <p className="mt-1 text-sm text-muted">
                            {t('bulkImport.notFound')}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                  {bulkNotFound.length > 0 && (
                    <div className="rounded-lg bg-line/40 px-3 py-2 dark:bg-fill/60">
                      <p className="text-xs font-medium text-muted">
                        {bulkNotFound.length === 1
                          ? t('bulkImport.notFoundOne')
                          : t('bulkImport.notFoundMany', { count: bulkNotFound.length })}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {bulkNotFound.map((line, i) => (
                          <li key={i} className="text-sm text-muted">
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
                      {isImportingBulk ? t('bulkImport.importing') : t('bulkImport.confirm')}
                    </button>
                    <button
                      onClick={() => setBulkLines(null)}
                      disabled={isImportingBulk}
                      className="btn-outline"
                    >
                      {t('actions.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="mb-3 font-display text-lg font-semibold">{t('projects.associatedTrips')}</h3>
        {project.trips.length === 0 ? (
          <div className="py-2 text-center">
            <p className="text-sm text-muted">{t('projects.noAssociatedTrips')}</p>
            <Link to={`/viagens/novo?projeto=${project.id}`} className="btn-primary mt-4 inline-block">
              {t('projects.newTripWithProject')}
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
                  {formatTripTitle(trip, user)}
                </Link>
                <span className="text-sm text-muted">
                  {' '}· {trip.creator_username} · {trip.place_count} {pluralize(trip.place_count, 'units.place.one', 'units.place.other')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
