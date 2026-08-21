import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import type { MapMode, PlaceType, User, Visibility } from '@/types'
import { BIG_PLACE_TYPES } from '@/types'

function UserChecklist({
  users,
  selectedIds,
  onToggle,
}: {
  users: User[]
  selectedIds: number[]
  onToggle: (id: number) => void
}) {
  if (users.length === 0) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">Não há outros utilizadores.</p>
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
                ? 'border-primary-500 bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-200'
                : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(u.id)}
              className="h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
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
        setError(err.message || 'Erro ao carregar dados')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id, isEdit, user?.id])

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
      setError(err.message || 'Erro ao guardar projeto')
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    navigate(isEdit ? `/projetos/${id}` : '/projetos')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label="A carregar">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        <span className="sr-only">A carregar...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold">{isEdit ? 'Editar projeto' : 'Novo projeto'}</h2>

      <div className="card max-w-2xl">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="name">Nome</label>
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
            <label className="mb-1 block text-sm font-medium" htmlFor="description">Descrição</label>
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
              <label className="mb-1 block text-sm font-medium" htmlFor="visibility">Visibilidade</label>
              <select
                id="visibility"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as Visibility)}
                className="input"
              >
                <option value="all">Todos</option>
                <option value="specific">Utilizadores específicos</option>
                <option value="private">Privado</option>
              </select>
            </div>
            {mixedTypes ? (
              <div>
                <label className="mb-1 block text-sm font-medium">Modo de mapa</label>
                <p className="rounded-lg border border-neutral-200 bg-neutral-100 px-4 py-2 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
                  Os lugares do projeto são de tipos diferentes: o mapa mostra-se sempre como pontos.
                </p>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="map_mode">Modo de mapa</label>
                <select
                  id="map_mode"
                  value={mapMode}
                  onChange={(e) => setMapMode(e.target.value as MapMode)}
                  className="input"
                >
                  <option value="points">Ver como pontos</option>
                  <option value="polygons">Ver como áreas</option>
                  {!isEdit && <option value="auto">Automático</option>}
                </select>
              </div>
            )}
          </div>

          {visibility === 'specific' && (
            <div>
              <label className="mb-1 block text-sm font-medium">Visível para</label>
              <UserChecklist
                users={users}
                selectedIds={visibleUserIds}
                onToggle={(uid) => setVisibleUserIds((prev) => toggleId(prev, uid))}
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">Participantes</label>
            <UserChecklist
              users={users}
              selectedIds={participantIds}
              onToggle={(uid) => setParticipantIds((prev) => toggleId(prev, uid))}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'A guardar...' : 'Guardar'}
            </button>
            <button type="button" onClick={handleCancel} className="btn-outline">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
