import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from '@/i18n'
import { PlacePicker, type PickedPlace } from '@/components/PlacePicker'
import { NotesEditor } from '@/components/NotesEditor'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { formatTripDateRange } from '@/utils/format'
import type { ProjectListItem, User, Visibility } from '@/types'

function UserChecklist({
  users,
  selectedIds,
  onToggle,
  emptyMessage,
}: {
  users: User[]
  selectedIds: number[]
  onToggle: (id: number) => void
  emptyMessage: string
}) {
  if (users.length === 0) {
    return <p className="text-sm text-muted">{emptyMessage}</p>
  }
  return (
    <div className="flex flex-wrap gap-2">
      {users.map((u) => {
        const checked = selectedIds.includes(u.id)
        return (
          <label
            key={u.id}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors ${
              checked
                ? 'border-primary bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-200'
                : 'border-line text-ink hover:bg-line/40 dark:border-[#322A23] dark:text-[#FAF7F2] dark:hover:bg-[#322A23]'
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(u.id)}
              className="h-4 w-4 rounded border-line text-primary-600 focus:ring-primary"
            />
            {u.username}
          </label>
        )
      })}
    </div>
  )
}

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
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [projectIds, setProjectIds] = useState<number[]>(presetProjectId ? [presetProjectId] : [])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        const allUsers = await api.users.list()
        setUsers(allUsers.filter((u) => u.id !== user?.id))
        setProjects(await api.projects.list())

        if (isEdit) {
          const trip = await api.trips.get(Number(id))
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
      } catch (err: any) {
        setError(err.message || t('tripEdit.loadError'))
      } finally {
        setIsLoading(false)
      }
    }
    load()
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
      if (isEdit) {
        const trip = await api.trips.update(Number(id), data)
        navigate(`/viagens/${trip.id}`)
      } else {
        const trip = await api.trips.create(data)
        navigate(`/viagens/${trip.id}`)
      }
    } catch (err: any) {
      setError(err.message || t('trips.saveError'))
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    navigate(isEdit ? `/viagens/${id}` : '/viagens')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label={t('loading')}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="sr-only">{t('loadingGeneric')}</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold">{isEdit ? t('tripEdit.editTitle') : t('tripEdit.newTitle')}</h2>

      <div className="card max-w-2xl">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

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

          <div className="grid gap-4 md:grid-cols-2">
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
              <div className="flex flex-wrap gap-2">
                {projects.map((p) => {
                  const checked = projectIds.includes(p.id)
                  return (
                    <label
                      key={p.id}
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors ${
                        checked
                          ? 'border-primary bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-200'
                          : 'border-line text-ink hover:bg-line/40 dark:border-[#322A23] dark:text-[#FAF7F2] dark:hover:bg-[#322A23]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setProjectIds((prev) => toggleId(prev, p.id))}
                        className="h-4 w-4 rounded border-line text-primary-600 focus:ring-primary"
                      />
                      {p.name}
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t('tripEdit.notesLabel')}</label>
            <NotesEditor value={notes} onChange={setNotes} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t('tripEdit.galleryLabel')}</label>
            <div className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted dark:border-[#322A23]">
              {t('tripEdit.galleryComingSoon')}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="external-link">{t('tripEdit.externalLinkLabel')}</label>
            <input
              id="external-link"
              type="url"
              className="input"
              placeholder="https://"
              disabled
            />
            <p className="mt-1 text-xs text-muted">{t('tripEdit.externalLinkHint')}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('tripEdit.participantsLabel')}</label>
              <UserChecklist
                users={users}
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
              <UserChecklist
                users={users}
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
