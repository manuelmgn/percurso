import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/api'
import { getErrorMessage } from '@/hooks/useApiResource'
import { useUnloadGuard } from '@/hooks/useUnloadGuard'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from '@/i18n'
import { PillChecklist } from '@/components/ui/PillChecklist'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { PageSpinner } from '@/components/ui/PageSpinner'
import type { MapMode, PlaceType, User, Visibility } from '@/types'
import { isPolygonMode } from '@/types'
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

  // JSON fingerprint of the whole form; frozen once the initial load
  // finishes. Any later difference arms the "unsaved changes" dialog.
  const savedFormRef = useRef<string | null>(null)
  const formFingerprint = JSON.stringify({
    name, description, visibility, mapMode, participantIds, visibleUserIds,
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
    // Cancellation guard: a slow response for project A must never
    // repopulate the form after a fast navigation to project B.
    let cancelled = false
    const load = async () => {
      try {
        const allUsers = await api.users.list()
        if (cancelled) return
        setUsers(allUsers.filter((u) => u.id !== user?.id))

        if (isEdit) {
          const project = await api.projects.get(Number(id))
          if (cancelled) return
          setName(project.name)
          setDescription(project.description || '')
          setVisibility(project.visibility)
          const types = project.places.map((p) => p.place_type)
          setPlaceTypes(types)
          // Resolve 'auto' to a concrete mode for the toggle; mixed types
          // stay points (toggle hidden — spec §6.1).
          setMapMode(isPolygonMode(project.map_mode, types) ? 'polygons' : 'points')
          setParticipantIds(project.participants.map((u) => u.id))
          setVisibleUserIds(project.visible_users.map((u) => u.id))
        }
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, t('projectEdit.loadError')))
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
      const project = isEdit
        ? await api.projects.update(Number(id), data)
        : await api.projects.create(data)
      navigate(`/projetos/${project.id}`)
    } catch (err) {
      setError(getErrorMessage(err, t('projects.saveError')))
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    navigate(isEdit ? `/projetos/${id}` : '/projetos')
  }

  if (isLoading) {
    return <PageSpinner />
  }

  return (
    <div className="space-y-6 pb-6">
      <h2 className="font-display text-2xl font-bold">{isEdit ? t('projectEdit.editTitle') : t('projectEdit.newTitle')}</h2>

      <div className="card max-w-2xl w-full">
        <ErrorBanner className="mb-4" message={error} />

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
              <PillChecklist
                items={users.map((u) => ({ id: u.id, label: u.username }))}
                selectedIds={visibleUserIds}
                onToggle={(uid) => setVisibleUserIds((prev) => toggleId(prev, uid))}
                emptyMessage={t('projectEdit.noOtherUsers')}
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">{t('projectEdit.participantsLabel')}</label>
            <PillChecklist
              items={users.map((u) => ({ id: u.id, label: u.username }))}
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
