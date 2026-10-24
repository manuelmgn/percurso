import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from '@/i18n'
import type { MapMode, PlaceType, User, Visibility } from '@/types'
import { BIG_PLACE_TYPES } from '@/types'

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
                : 'border-line text-ink hover:bg-line/40 dark:hover:bg-fill'
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

export function ProjectEditPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useTranslation()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('all')
  const [mapMode, setMapMode] = useState<MapMode>('auto')
  const [placeTypes, setPlaceTypes] = useState<PlaceType[]>([])
  const [participantIds, setParticipantIds] = useState<number[]>([])
  const [visibleUserIds, setVisibleUserIds] = useState<number[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        const allUsers = await api.users.list()
        setUsers(allUsers.filter((u) => u.id !== user?.id))

        if (isEdit) {
          const project = await api.projects.get(Number(id))
          setName(project.name)
          setDescription(project.description || '')
          setVisibility(project.visibility)
          const types = project.places.map((p) => p.place_type)
          setPlaceTypes(types)
          // Resolve 'auto' to a concrete mode for the toggle: polygons when
          // all places share a single "big" type, points otherwise.
          const distinct = new Set(types)
          const onlyType = distinct.size === 1 ? types[0] : undefined
          setMapMode(
            project.map_mode === 'auto'
              ? onlyType && BIG_PLACE_TYPES.includes(onlyType)
                ? 'polygons'
                : 'points'
              : project.map_mode
          )
          setParticipantIds(project.participants.map((u) => u.id))
          setVisibleUserIds(project.visible_users.map((u) => u.id))
        }
      } catch (err: any) {
        setError(err.message || t('projectEdit.loadError'))
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id, isEdit, user?.id, t])

  const toggleId = (list: number[], idToToggle: number) =>
    list.includes(idToToggle) ? list.filter((x) => x !== idToToggle) : [...list, idToToggle]

  // Mixed place types force points mode and hide the toggle (spec §6.1)
  const mixedTypes = new Set(placeTypes).size > 1

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    const data = {
      name,
      description: description || undefined,
      visibility,
      map_mode: (mixedTypes ? 'points' : mapMode) as MapMode,
      participant_ids: participantIds,
      visible_user_ids: visibility === 'specific' ? visibleUserIds : [],
    }

    try {
      if (isEdit) {
        const project = await api.projects.update(Number(id), data)
        navigate(`/projetos/${project.id}`)
      } else {
        const project = await api.projects.create(data)
        navigate(`/projetos/${project.id}`)
      }
    } catch (err: any) {
      setError(err.message || t('projects.saveError'))
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    navigate(isEdit ? `/projetos/${id}` : '/projetos')
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
      <h2 className="font-display text-2xl font-bold">{isEdit ? t('projectEdit.editTitle') : t('projectEdit.newTitle')}</h2>

      <div className="card max-w-2xl">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="name">{t('projectEdit.nameLabel')}</label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="description">{t('projectEdit.descriptionLabel')}</label>
            <textarea
              id="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="visibility">{t('projectEdit.visibilityLabel')}</label>
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
            {mixedTypes ? (
              <div>
                <label className="mb-1 block text-sm font-medium">{t('projectEdit.mapModeLabel')}</label>
                <p className="rounded-lg border border-line bg-line/40 px-4 py-2 text-sm text-muted">
                  {t('projectEdit.mapModeMixedTypes')}
                </p>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="map_mode">{t('projectEdit.mapModeLabel')}</label>
                <select
                  id="map_mode"
                  value={mapMode}
                  onChange={(e) => setMapMode(e.target.value as MapMode)}
                  className="input"
                >
                  <option value="points">{t('projectEdit.mapModePoints')}</option>
                  <option value="polygons">{t('projectEdit.mapModePolygons')}</option>
                  {!isEdit && <option value="auto">{t('projectEdit.mapModeAuto')}</option>}
                </select>
              </div>
            )}
          </div>

          {visibility === 'specific' && (
            <div>
              <label className="mb-1 block text-sm font-medium">{t('projectEdit.visibleToLabel')}</label>
              <UserChecklist
                users={users}
                selectedIds={visibleUserIds}
                onToggle={(uid) => setVisibleUserIds((prev) => toggleId(prev, uid))}
                emptyMessage={t('projectEdit.noOtherUsers')}
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">{t('projectEdit.participantsLabel')}</label>
            <UserChecklist
              users={users}
              selectedIds={participantIds}
              onToggle={(uid) => setParticipantIds((prev) => toggleId(prev, uid))}
              emptyMessage={t('projectEdit.noOtherUsers')}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? t('projectEdit.saving') : t('actions.save')}
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
