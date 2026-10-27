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
import { PageSpinner } from '@/components/ui/PageSpinner'
import { PillChecklist } from '@/components/ui/PillChecklist'
import { formatTripDateRange } from '@/utils/format'
import type { ProjectListItem, Trip, User, Visibility } from '@/types'
import { TripPhotos } from '@/components/TripPhotos'

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
  const [trip, setTrip] = useState<Trip | null>(null)
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
          setTrip(trip)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    const data = {
      title: title.trim() || undefined,
      start_date: startDate,
      end_date: endDate || startDate,
      notes: notes || undefined,
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
    return <PageSpinner />
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
            <NotesEditor value={notes} onChange={setNotes} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t('tripEdit.galleryLabel')}</label>
            {isEdit && trip ? (
              <TripPhotos trip={trip} embedded />
            ) : (
              <p className="text-sm text-muted">{t('tripEdit.galleryAfterSave')}</p>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <label className="block text-sm font-medium" htmlFor="external-link">{t('tripEdit.externalLinkLabel')}</label>
              <InfoTooltip text={t('tripEdit.externalLinkHint')} />
            </div>
            <input
              id="external-link"
              type="url"
              className="input"
              placeholder="https://"
              disabled
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('tripEdit.participantsLabel')}</label>
              <PillChecklist
                items={users.map((u) => ({ id: u.id, label: u.username }))}
                selectedIds={participantIds}
                onToggle={(uid) => setParticipantIds((prev) => toggleId(prev, uid))}
                emptyMessage={t('tripEdit.noOtherUsers')}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="companions">{t('tripEdit.companionsLabel')}</label>
              <input
                id="companions"
                type="text"
                value={companionsText}
                onChange={(e) => setCompanionsText(e.target.value)}
                placeholder={t('tripEdit.companionsPlaceholder')}
                className="input"
              />
            </div>
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
