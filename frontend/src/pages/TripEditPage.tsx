import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '@/api'
import { getErrorMessage } from '@/hooks/useApiResource'
import { useUnloadGuard } from '@/hooks/useUnloadGuard'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from '@/i18n'
import { PlacePicker, type PickedPlace } from '@/components/PlacePicker'
import { NotesEditor } from '@/components/NotesEditor'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { FormPageSkeleton } from '@/components/ui/Skeleton'
import { PillChecklist } from '@/components/ui/PillChecklist'
import { formatTripDateRange } from '@/utils/format'
import type { ProjectListItem, User, Visibility } from '@/types'

export function TripEditPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const presetProjectId = Number(searchParams.get('projeto')) || null

  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [companionsText, setCompanionsText] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('all')
  const [places, setPlaces] = useState<PickedPlace[]>([])
  const [participantIds, setParticipantIds] = useState<number[]>([])
  const [visibleUserIds, setVisibleUserIds] = useState<number[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [companionHighlight, setCompanionHighlight] = useState(0)
  const [companionsOpen, setCompanionsOpen] = useState(false)
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [projectIds, setProjectIds] = useState<number[]>(presetProjectId ? [presetProjectId] : [])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  // JSON fingerprint of the whole form; frozen once the initial load
  // finishes. Any later difference arms the "unsaved changes" dialog.
  const savedFormRef = useRef<string | null>(null)
  const formFingerprint = JSON.stringify({
    title, startDate, endDate, notes, companionsText, visibility,
    places, participantIds, visibleUserIds, projectIds,
  })
  if (savedFormRef.current === null && !isLoading) {
    savedFormRef.current = formFingerprint
  }
  const isDirty =
    savedFormRef.current !== null &&
    !isSubmitting &&
    formFingerprint !== savedFormRef.current
  useUnloadGuard(isDirty)

  useEffect(() => {
    // Cancellation guard: a slow response for trip A must never repopulate
    // the form after a fast navigation to trip B.
    let cancelled = false
    const load = async () => {
      try {
        const allUsers = await api.users.list()
        const projectList = await api.projects.list()
        if (cancelled) return
        setUsers(allUsers.filter((u) => u.id !== user?.id))
        setProjects(projectList)

        if (isEdit) {
          const trip = await api.trips.get(Number(id))
          if (cancelled) return
          setTitle(trip.title || '')
          setStartDate(trip.start_date)
          setEndDate(trip.end_date)
          setNotes(trip.notes || '')
          setCompanionsText(trip.companions_text || '')
          setVisibility(trip.visibility)
          setPlaces(
            trip.places.map((p) => ({
              id: p.place_id,
              name: p.place_name,
              place_type: p.place_type,
              hierarchy: p.place_hierarchy,
            }))
          )
          setParticipantIds(trip.participants.map((u) => u.id))
          setVisibleUserIds(trip.visible_users.map((u) => u.id))
          setProjectIds(trip.projects.map((p) => p.id))
        }
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, t('tripEdit.loadError')))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    setIsLoading(true)
    load()
    return () => { cancelled = true }
  }, [id, isEdit, user?.id, t])

  const toggleId = (list: number[], idToToggle: number) =>
    list.includes(idToToggle) ? list.filter((x) => x !== idToToggle) : [...list, idToToggle]

  // Unified "Companhia" field: while the user types, matching users are
  // suggested. Picking one turns them into a user companion (chip); text
  // left unpicked stays in the input as free-text company.
  const companions = users.filter((u) => participantIds.includes(u.id))
  const companionQuery = companionsText.trim().toLowerCase()
  const suggestions = companionQuery
    ? users
        .filter(
          (u) =>
            !participantIds.includes(u.id) &&
            u.username.toLowerCase().includes(companionQuery)
        )
        .slice(0, 6)
    : []

  const addCompanion = (u: User | undefined) => {
    if (!u) return
    setParticipantIds((prev) => (prev.includes(u.id) ? prev : [...prev, u.id]))
    setCompanionsText('')
    setCompanionHighlight(0)
    setCompanionsOpen(false)
  }

  // Free-text notes (create mode) become simple HTML so the trip page renders
  // them like editor content; kept minimal so sanitisation is trivial.
  const notesToHtml = (text: string): string | undefined => {
    const trimmed = text.trim()
    if (!trimmed) return undefined
    const escaped = trimmed.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return escaped.split('\n').join('<br>')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    const data = {
      title: title.trim() || undefined,
      start_date: startDate,
      end_date: endDate || startDate,
      notes: isEdit ? notes || undefined : notesToHtml(notes),
      companions_text: companionsText || undefined,
      visibility,
      place_ids: places.map((p) => p.id),
      project_ids: projectIds,
      participant_ids: participantIds,
      visible_user_ids: visibility === 'specific' ? visibleUserIds : [],
    }

    try {
      const trip = isEdit
        ? await api.trips.update(Number(id), data)
        : await api.trips.create(data)
      navigate(`/viagens/${trip.id}`)
    } catch (err) {
      setError(getErrorMessage(err, t('trips.saveError')))
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    navigate(isEdit ? `/viagens/${id}` : '/viagens')
  }

  if (isLoading) {
    return <FormPageSkeleton />
  }

  return (
    <div className="space-y-6 pb-6">
      <h2 className="font-display text-2xl font-bold">{isEdit ? t('tripEdit.editTitle') : t('tripEdit.newTitle')}</h2>

      <div className="card max-w-2xl w-full">
        <ErrorBanner className="mb-4" message={error} />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <label className="block text-sm font-medium" htmlFor="title">{t('tripEdit.titleLabel')}</label>
              <InfoTooltip text={t('tripEdit.titleHint')} />
            </div>
            <input
              id="title"
              type="text"
              maxLength={255}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                startDate
                  ? `${t('trips.fallbackTitle')} ${formatTripDateRange(startDate, endDate || startDate, user)}`
                  : t('tripEdit.titlePlaceholder')
              }
              className="input"
            />
          </div>

          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="start_date">{t('tripEdit.startDateLabel')}</label>
              <input
                id="start_date"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center gap-2">
                <label className="block text-sm font-medium" htmlFor="end_date">{t('tripEdit.endDateLabel')}</label>
                <InfoTooltip text={t('tripEdit.endDateHint')} />
              </div>
              <input
                id="end_date"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t('tripEdit.placesLabel')}</label>
            <PlacePicker selected={places} onChange={setPlaces} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t('tripEdit.projectsLabel')}</label>
            {projects.length === 0 ? (
              <p className="text-sm text-muted">{t('tripEdit.noProjectsAvailable')}</p>
            ) : (
              <PillChecklist
                items={projects.map((p) => ({ id: p.id, label: p.name }))}
                selectedIds={projectIds}
                onToggle={(pid) => setProjectIds((prev) => toggleId(prev, pid))}
                emptyMessage={t('tripEdit.noProjectsAvailable')}
              />
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t('tripEdit.notesLabel')}</label>
            {isEdit ? (
              <NotesEditor value={notes} onChange={setNotes} />
            ) : (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('notesEditor.placeholder')}
                rows={5}
                className="w-full min-h-[120px] resize-y rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted transition-colors focus:border-primary/50 focus:ring-4 focus:ring-primary/10 focus:outline-none"
              />
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t('tripEdit.companionsLabel')}</label>
            <div className="relative">
              <div
                className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 dark:focus-within:ring-offset-bg"
                onBlur={suggestions.length > 0 ? (e) => {
                  // Close the dropdown unless focus moved to one of its
                  // options (option mousedown keeps focus inside).
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setCompanionHighlight(0)
                    setCompanionsOpen(false)
                  }
                } : undefined}
              >
                {companions.map((u) => (
                  <span
                    key={u.id}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary-100 py-1 pl-3 pr-1.5 text-sm text-primary-800 dark:border-primary/40 dark:bg-primary-900/30 dark:text-primary-200"
                  >
                    {u.username}
                    <button
                      type="button"
                      onClick={() => setParticipantIds((prev) => prev.filter((x) => x !== u.id))}
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-primary-700/70 transition-colors hover:bg-primary-100 hover:text-primary-900 dark:text-primary-300/70 dark:hover:bg-primary-900/50 dark:hover:text-primary-100"
                      aria-label={t('tripEdit.removeCompanion', { name: u.username })}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  id="companions"
                  type="text"
                  className="min-w-[10rem] flex-1 bg-transparent py-1 text-sm text-ink outline-none placeholder:text-muted"
                  value={companionsText}
                  onChange={(e) => {
                    setCompanionsText(e.target.value)
                    setCompanionHighlight(0)
                    setCompanionsOpen(true)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' && suggestions.length > 0) {
                      e.preventDefault()
                      setCompanionsOpen(true)
                      setCompanionHighlight((i) => Math.min(i + 1, suggestions.length - 1))
                    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
                      e.preventDefault()
                      setCompanionHighlight((i) => Math.max(i - 1, 0))
                    } else if (e.key === 'Enter' && companionsOpen && suggestions.length > 0) {
                      // Choosing the highlighted user beats submitting.
                      e.preventDefault()
                      addCompanion(suggestions[Math.min(companionHighlight, suggestions.length - 1)])
                    } else if (e.key === 'Escape') {
                      setCompanionsOpen(false)
                    } else if (e.key === 'Backspace' && companionsText === '' && companions.length > 0) {
                      setParticipantIds((prev) => prev.slice(0, -1))
                    }
                  }}
                  placeholder={t('tripEdit.companionsPlaceholder')}
                  autoComplete="off"
                />
              </div>
              {companionsOpen && suggestions.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
                  {suggestions.map((u, i) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        // Keep focus in the input while picking a suggestion.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addCompanion(u)}
                        className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors ${
                          i === Math.min(companionHighlight, suggestions.length - 1)
                            ? 'bg-primary-tint text-ink dark:bg-primary-900/30'
                            : 'text-ink hover:bg-line/50 dark:hover:bg-fill'
                        }`}
                      >
                        {u.username}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="mt-1 text-xs text-muted">{t('tripEdit.companionsHint')}</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="visibility">{t('tripEdit.visibilityLabel')}</label>
            <select
              id="visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
              className="input"
            >
              <option value="all">{t('visibility.optionAll')}</option>
              <option value="specific">{t('visibility.optionSpecific')}</option>
              <option value="private">{t('visibility.optionPrivate')}</option>
            </select>
          </div>

          {visibility === 'specific' && (
            <div>
              <label className="mb-1 block text-sm font-medium">{t('tripEdit.visibleToLabel')}</label>
              <PillChecklist
                items={users.map((u) => ({ id: u.id, label: u.username }))}
                selectedIds={visibleUserIds}
                onToggle={(uid) => setVisibleUserIds((prev) => toggleId(prev, uid))}
                emptyMessage={t('tripEdit.noOtherUsers')}
              />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? t('tripEdit.saving') : t('actions.save')}
            </button>
            <button type="button" onClick={handleCancel} className="btn-outline">
              {t('actions.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
