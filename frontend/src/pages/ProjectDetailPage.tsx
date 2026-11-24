import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '@/api'
import { useApiResource, getErrorMessage } from '@/hooks/useApiResource'
import { useUnloadGuard } from '@/hooks/useUnloadGuard'
import { PlacePicker, type PickedPlace } from '@/components/PlacePicker'
import { MapView, type MapMarker, type MapPolygon } from '@/components/MapView'
import { PinButton } from '@/components/PinButton'
import { ProjectPlacesSection } from '@/components/ProjectPlacesSection'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { PlaceTypeLabel } from '@/components/ui/PlaceTypeLabel'
import { PageShell } from '@/components/PageShell'
import type { BulkImportLine, PlaceSearchResult, PlaceType, Project } from '@/types'
import { PLACE_TYPES, isPolygonMode } from '@/types'
import { formatHierarchy, formatPlaceType, formatTripTitle, formatDate as formatUserDate, placeTypeTitle, visibilityLabelKey } from '@/utils/format'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from '@/i18n'
import { checkAndCelebrate } from '@/utils/milestones'
import { canEditEntity } from '@/utils/permissions'
import type { Geometry } from 'geojson'

const VISITED_COLOR = '#f59e0b'
const PENDING_COLOR = '#7a756d'
// Mirrors BulkImportRequest's max_length on the backend.
const MAX_BULK_LINES = 500
// Small sequential batches keep every HTTP request well under reverse-proxy
// timeouts (~12 s worst case per resolve batch on Nominatim's 1 req/s policy)
// and allow automatic per-batch retry without losing prior progress.
const RESOLVE_BATCH_SIZE = 10
const CONFIRM_BATCH_SIZE = 20
const BATCH_PAUSE_MS = 250
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504])

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runBatchWithRetry<T>(
  task: () => Promise<T>,
  isAborted: () => boolean,
  maxAttempts = 3,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await task()
    } catch (err) {
      lastError = err
      const retryable = !(err instanceof ApiError) || RETRYABLE_STATUSES.has(err.status)
      if (!retryable || attempt + 1 >= maxAttempts || isAborted()) {
        throw err
      }
      await sleep(3000 * (attempt + 1))
      if (isAborted()) throw err
    }
  }
  throw lastError
}

function CandidateLabel({ result }: { result: PlaceSearchResult }) {
  const hierarchy = formatHierarchy(result.hierarchy)
  return (
    <>
      {result.name}
      {hierarchy ? ` — ${hierarchy}` : ''} [<PlaceTypeLabel type={result.place_type} />]
    </>
  )
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
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  const mountedRef = useRef(true)
  // Remembers lines resolved in the current session so retrying after a mid-way
  // network drop resumes instantaneously without re-querying OpenStreetMap.
  const resolvedCacheRef = useRef<{ type: PlaceType | ''; byKey: Map<string, BulkImportLine> }>({
    type: '',
    byKey: new Map(),
  })

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useUnloadGuard(isResolving || isImportingBulk)

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
    if (lines.length > MAX_BULK_LINES) {
      setActionError(t('bulkImport.tooManyLines', { max: MAX_BULK_LINES }))
      return
    }
    setActionError('')
    setIsResolving(true)
    setBulkLines(null)
    setBulkConflicts(new Set())

    if (resolvedCacheRef.current.type !== bulkType) {
      resolvedCacheRef.current = { type: bulkType, byKey: new Map() }
    }
    const cache = resolvedCacheRef.current.byKey
    const collected: BulkImportLine[] = new Array(lines.length)
    const pendingIndices: number[] = []

    for (let i = 0; i < lines.length; i++) {
      const cached = cache.get(lines[i].toLowerCase())
      if (cached) {
        collected[i] = {
          ...cached,
          line: lines[i],
          candidates: [...cached.candidates],
          selected: cached.selected ? { ...cached.selected } : null,
        }
      } else {
        pendingIndices.push(i)
      }
    }

    let doneCount = lines.length - pendingIndices.length
    setBulkProgress({ done: doneCount, total: lines.length })

    try {
      for (let start = 0; start < pendingIndices.length; start += RESOLVE_BATCH_SIZE) {
        if (!mountedRef.current) return
        const batchIndices = pendingIndices.slice(start, start + RESOLVE_BATCH_SIZE)
        const batchStrings = batchIndices.map((idx) => lines[idx])
        const response = await runBatchWithRetry(
          () => api.projects.bulkImport(projectId, batchStrings, bulkType || null),
          () => !mountedRef.current,
        )
        if (!mountedRef.current) return

        for (let j = 0; j < batchIndices.length; j++) {
          const resolvedLine = response.lines[j]
          if (resolvedLine) {
            collected[batchIndices[j]] = resolvedLine
            if (resolvedLine.status !== 'not_found') {
              cache.set(batchStrings[j].toLowerCase(), resolvedLine)
            }
          }
        }
        doneCount += batchIndices.length
        setBulkProgress({ done: doneCount, total: lines.length })

        if (start + RESOLVE_BATCH_SIZE < pendingIndices.length) {
          await sleep(BATCH_PAUSE_MS)
        }
      }
      if (!mountedRef.current) return
      setBulkLines(collected)
      setBulkConflicts(new Set())
    } catch (err) {
      if (mountedRef.current) {
        setActionError(getErrorMessage(err, t('projects.bulkResolveError')))
      }
    } finally {
      if (mountedRef.current) {
        setIsResolving(false)
        setBulkProgress(null)
      }
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

    const selectedLines = bulkLines.filter((l) => l.selected)
    if (selectedLines.length === 0) {
      setBulkLines(null)
      setBulkText('')
      setShowBulk(false)
      setIsImportingBulk(false)
      return
    }

    setBulkProgress({ done: 0, total: selectedLines.length })
    let importedCount = 0

    try {
      let latestProject: Project | null = null
      for (let start = 0; start < selectedLines.length; start += CONFIRM_BATCH_SIZE) {
        if (!mountedRef.current) return
        const batch = selectedLines.slice(start, start + CONFIRM_BATCH_SIZE)
        const isLastBatch = start + CONFIRM_BATCH_SIZE >= selectedLines.length
        latestProject = await runBatchWithRetry(
          () => api.projects.bulkImportConfirm(projectId, batch, isLastBatch),
          () => !mountedRef.current,
        )
        if (!mountedRef.current) return
        importedCount += batch.length
        setBulkProgress({ done: importedCount, total: selectedLines.length })

        if (!isLastBatch) {
          await sleep(BATCH_PAUSE_MS)
        }
      }
      if (!mountedRef.current) return
      if (latestProject) setProject(latestProject)
      resolvedCacheRef.current = { type: bulkType, byKey: new Map() }
      setBulkLines(null)
      setBulkText('')
      setShowBulk(false)
      checkAndCelebrate()
    } catch (err) {
      if (!mountedRef.current) return
      // Drop already-imported lines so manual disambiguations on the remaining
      // lines stay intact and clicking Confirm again resumes cleanly.
      if (importedCount > 0) {
        let remainingToDrop = importedCount
        setBulkLines((prev) =>
          prev
            ? prev.filter((l) => {
                if (l.selected && remainingToDrop > 0) {
                  remainingToDrop--
                  return false
                }
                return true
              })
            : prev,
        )
        api.projects
          .get(projectId)
          .then((p) => {
            if (mountedRef.current) setProject(p)
          })
          .catch(() => {})
      }
      setActionError(getErrorMessage(err, t('projects.bulkImportError')))
    } finally {
      if (mountedRef.current) {
        setIsImportingBulk(false)
        setBulkProgress(null)
      }
    }
  }


  const mapModeLabelKey: Record<Project['map_mode'], string> = {
    points: 'projects.mapPoints',
    polygons: 'projects.mapPolygons',
    auto: 'projects.mapAuto',
  }
  // Users who can only *see* the project get no mutation UI — every action
  // would 404.
  const canEdit = project ? canEditEntity(user, project) : false

  return (
    <PageShell skeleton="detail" isLoading={isLoading}>
      {!project ? (
        <>
          <Link to="/projetos" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
            ← {t('projects.back')}
          </Link>
          <div className="card">
            <p className="text-red-700 dark:text-red-300">{error || t('projects.notFound')}</p>
          </div>
        </>
      ) : (
        <>
      <div className="flex items-center justify-between">
        <Link to="/projetos" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
          ← {t('projects.back')}
        </Link>
        <div className="flex flex-wrap gap-2">
          <PinButton entityType="project" entityId={project.id} label={t('units.project.one')} showLabel />
          <Link to={`/viagens/novo?projeto=${project.id}`} className="btn-secondary">
            {t('projects.newTripWithProject')}
          </Link>
          {canEdit && (
            <>
              <Link to={`/projetos/${project.id}/editar`} className="btn-primary">
                {t('actions.edit')}
              </Link>
              <button
                onClick={() => setIsConfirmingDelete(true)}
                className="btn-danger-quiet"
              >
                {t('actions.delete')}
              </button>
            </>
          )}
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
          <MapView markers={mapMarkers} polygons={mapPolygons} />
        </div>
      )}

      <div className="card">
        <ProjectPlacesSection
          places={project.places}
          user={user}
          canEdit={canEdit}
          busyPlaceId={busyPlaceId}
          removingPlaceId={removingPlaceId}
          onRequestRemove={setRemovingPlaceId}
          onToggleUnmark={handleToggleUnmark}
          onRemovePlace={handleRemovePlace}
        />

        {canEdit && (
          <div className="mt-6 border-t border-line pt-4">
            <h4 className="mb-2 text-sm font-medium">{t('projects.addPlace')}</h4>
            <PlacePicker selected={addSelection} onChange={handlePlacePicked} />
            {isAddingPlace && (
              <p className="mt-2 text-sm text-muted">{t('projects.addingPlace')}</p>
            )}
          </div>
        )}

        {canEdit && (
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
                    <option key={type} value={type} title={placeTypeTitle(type)}>
                      {t('bulkImport.typeAll', { type: formatPlaceType(type) })}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted">
                {t('bulkImport.slowHint', { max: MAX_BULK_LINES })}
              </p>
              <button
                onClick={handleResolve}
                disabled={isResolving || isImportingBulk || !bulkText.trim()}
                className="btn-primary"
              >
                {isResolving
                  ? bulkProgress
                    ? t('bulkImport.resolvingProgress', { done: bulkProgress.done, total: bulkProgress.total })
                    : t('bulkImport.resolving')
                  : t('bulkImport.resolve')}
              </button>
              {isResolving && bulkProgress && (
                <ProgressBar
                  percent={(bulkProgress.done / Math.max(1, bulkProgress.total)) * 100}
                  label={t('bulkImport.resolving')}
                />
              )}

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
                          <PlaceTypeLabel type={type} /> ({count})
                        </button>
                      ))}
                    </div>
                  )}
                  <ul className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
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
                            ✓ <CandidateLabel result={line.selected} />
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
                                <span><CandidateLabel result={candidate} /></span>
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
                  {isImportingBulk && bulkProgress && (
                    <ProgressBar
                      percent={(bulkProgress.done / Math.max(1, bulkProgress.total)) * 100}
                      label={t('bulkImport.importing')}
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handleConfirmBulk}
                      disabled={isImportingBulk || hasUnresolvedAmbiguous}
                      className="btn-primary"
                    >
                      {isImportingBulk
                        ? bulkProgress
                          ? t('bulkImport.importingProgress', { done: bulkProgress.done, total: bulkProgress.total })
                          : t('bulkImport.importing')
                        : t('bulkImport.confirm')}
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
        )}
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
        </>
      )}
    </PageShell>
  )
}
