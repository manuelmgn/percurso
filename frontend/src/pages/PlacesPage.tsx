import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/api'
import { PageShell } from '@/components/PageShell'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { PlaceTypeLabel } from '@/components/ui/PlaceTypeLabel'
import { PlaceRelationBadge } from '@/components/PlaceRelationBadge'
import { PlaceRelationEditor } from '@/components/PlaceRelationEditor'
import { PlacePicker, type PickedPlace } from '@/components/PlacePicker'
import { useApiResource, usePersistentFilters } from '@/hooks/useApiResource'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from '@/i18n'
import { checkAndCelebrate } from '@/utils/milestones'
import { formatHierarchy, formatPlaceType, placeTypeTitle } from '@/utils/format'
import { PLACE_TYPES, type PlaceOverviewItem, type PlaceRelationInput, type PlaceType } from '@/types'
import { MapPin, Plus } from 'lucide-react'

type StatusFilter = 'all' | 'visited' | 'pending' | 'residence' | 'frequent'
type SortOrder = 'alpha' | 'most_visited' | 'recent'

interface PlacesFilters {
  query: string
  placeType: '' | PlaceType
  status: StatusFilter
  sort: SortOrder
}

const DEFAULT_FILTERS: PlacesFilters = { query: '', placeType: '', status: 'all', sort: 'alpha' }


// A place counts as visited when it appears in a visible trip OR carries a
// personal residence/frequent-visit mark. "Pendente" means on a project target
// list with neither trips nor a personal mark.
function isPlaceVisited(place: PlaceOverviewItem): boolean {
  return place.visit_count > 0 || place.relation !== null
}

function placeStatus(place: PlaceOverviewItem): 'visited' | 'pending' {
  return isPlaceVisited(place) ? 'visited' : 'pending'
}

// "Mais recentes": latest of last visit, personal mark update, or place update.
function recencyTimestamp(place: PlaceOverviewItem): number {
  const candidates = [place.last_visited_at, place.relation?.updated_at, place.updated_at].filter(Boolean) as string[]
  return Math.max(...candidates.map((d) => new Date(d).getTime()))
}

export function PlacesPage() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const { data: places, setData: setPlaces, isLoading, error } = useApiResource<PlaceOverviewItem[]>(
    () => api.places.overview(),
    [],
    [],
  )
  const [showAddMark, setShowAddMark] = useState(false)
  const [pickedPlace, setPickedPlace] = useState<PickedPlace | null>(null)
  // Filters are remembered per user, so they survive sessions without leaking
  // to other users of the same device (shared hook).
  const [filters, setFilters] = usePersistentFilters<PlacesFilters>('lugares:filters', user?.id, DEFAULT_FILTERS)

  const existingRelation = useMemo(
    () => (pickedPlace ? places.find((p) => p.id === pickedPlace.id)?.relation ?? null : null),
    [pickedPlace, places],
  )

  const handleSaveMark = async (payload: PlaceRelationInput) => {
    if (!pickedPlace) return
    await api.places.setRelation(pickedPlace.id, payload)
    setPlaces(await api.places.overview())
    setPickedPlace(null)
    setShowAddMark(false)
    checkAndCelebrate()
  }

  const handleRemoveMark = async () => {
    if (!pickedPlace) return
    await api.places.deleteRelation(pickedPlace.id)
    setPlaces(await api.places.overview())
    setPickedPlace(null)
    setShowAddMark(false)
  }

  const visiblePlaces = useMemo(() => {
    const query = filters.query.trim().toLowerCase()
    const filtered = places.filter((place) => {
      if (query && !place.name.toLowerCase().includes(query)) return false
      if (filters.placeType && place.place_type !== filters.placeType) return false
      if (filters.status === 'visited' && !isPlaceVisited(place)) return false
      if (filters.status === 'pending' && isPlaceVisited(place)) return false
      if (filters.status === 'residence' && place.relation?.kind !== 'residence') return false
      if (filters.status === 'frequent' && place.relation?.kind !== 'frequent') return false
      return true
    })
    switch (filters.sort) {
      case 'most_visited':
        return filtered.sort((a, b) => b.visit_count - a.visit_count || a.name.localeCompare(b.name, 'pt'))
      case 'recent':
        return filtered.sort((a, b) => recencyTimestamp(b) - recencyTimestamp(a) || a.name.localeCompare(b.name, 'pt'))
      default:
        return filtered.sort((a, b) => a.name.localeCompare(b.name, 'pt'))
    }
  }, [places, filters])

  const updateFilters = (patch: Partial<PlacesFilters>) => setFilters((prev) => ({ ...prev, ...patch }))

  return (
    <PageShell skeleton="list" isLoading={isLoading}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold">{t('places.title')}</h2>
        <button
          type="button"
          onClick={() => {
            setShowAddMark((v) => !v)
            setPickedPlace(null)
          }}
          className="btn-primary inline-flex items-center gap-1.5"
        >
          <Plus size={16} aria-hidden="true" />
          {t('places.addMark')}
        </button>
      </div>
      <ErrorBanner message={error} />

      {showAddMark && (
        <div className="card space-y-4">
          <div>
            <h3 className="font-display text-lg font-semibold">{t('places.addMarkTitle')}</h3>
            <p className="mt-1 text-sm text-muted">{t('places.addMarkHint')}</p>
          </div>
          {!pickedPlace ? (
            <div className="space-y-3">
              <PlacePicker
                selected={[]}
                hideSelected
                onChange={(picked) => {
                  if (picked.length > 0) setPickedPlace(picked[0])
                }}
              />
              <button
                type="button"
                onClick={() => setShowAddMark(false)}
                className="btn-outline"
              >
                {t('actions.cancel')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-bg/60 px-3.5 py-2.5">
                <div>
                  <p className="text-xs text-muted">{t('places.addMarkSelected')}</p>
                  <p className="font-medium text-ink">
                    {pickedPlace.name}
                    {formatHierarchy(pickedPlace.hierarchy) && (
                      <span className="font-normal text-muted"> · {formatHierarchy(pickedPlace.hierarchy)}</span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPickedPlace(null)}
                  className="btn-outline px-3 py-1 text-xs"
                >
                  {t('places.addMarkChange')}
                </button>
              </div>
              <PlaceRelationEditor
                key={pickedPlace.id}
                initial={existingRelation}
                onSave={handleSaveMark}
                onRemove={existingRelation ? handleRemoveMark : undefined}
                onCancel={() => {
                  setPickedPlace(null)
                  setShowAddMark(false)
                }}
                idPrefix="places-add-rel"
              />
            </div>
          )}
        </div>
      )}

      {places.length === 0 && !error ? (
        <div className="card flex flex-col items-center py-12 text-center">
          <MapPin size={48} strokeWidth={1.5} className="text-muted" aria-hidden="true" />

          <h3 className="mt-4 font-display text-lg font-semibold">{t('places.empty.title')}</h3>
          <p className="mt-1 max-w-sm text-sm text-muted">
            {t('places.empty.description')}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/viagens/novo" className="btn-primary">
              {t('places.empty.cta')}
            </Link>
            <button
              type="button"
              onClick={() => setShowAddMark(true)}
              className="btn-outline"
            >
              {t('places.addMark')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="places-search">
                {t('places.searchLabel')}
              </label>
              <input
                id="places-search"
                type="search"
                value={filters.query}
                onChange={(e) => updateFilters({ query: e.target.value })}
                placeholder={t('places.searchPlaceholder')}
                className="input"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="places-type">
                {t('places.typeLabel')}
              </label>
              <select
                id="places-type"
                value={filters.placeType}
                onChange={(e) => updateFilters({ placeType: e.target.value as '' | PlaceType })}
                className="input"
              >
                <option value="">{t('places.typeAll')}</option>
                {PLACE_TYPES.map((type) => (
                  <option key={type} value={type} title={placeTypeTitle(type)}>
                    {formatPlaceType(type)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="places-status">
                {t('places.statusLabel')}
              </label>
              <select
                id="places-status"
                value={filters.status}
                onChange={(e) => updateFilters({ status: e.target.value as StatusFilter })}
                className="input"
              >
                <option value="all">{t('places.statusAll')}</option>
                <option value="visited">{t('places.statusVisited')}</option>
                <option value="pending">{t('places.statusPending')}</option>
                <option value="residence">{t('places.statusResidence')}</option>
                <option value="frequent">{t('places.statusFrequent')}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="places-sort">
                {t('places.sortLabel')}
              </label>
              <select
                id="places-sort"
                value={filters.sort}
                onChange={(e) => updateFilters({ sort: e.target.value as SortOrder })}
                className="input"
              >
                <option value="alpha">{t('places.sortAlpha')}</option>
                <option value="most_visited">{t('places.sortMostVisited')}</option>
                <option value="recent">{t('places.sortRecent')}</option>
              </select>
            </div>
          </div>

          {visiblePlaces.length === 0 ? (
            <div className="card py-8 text-center">
              <p className="text-sm text-muted">
                {t('places.noResults')}
              </p>
              <button onClick={() => setFilters(DEFAULT_FILTERS)} className="btn-outline mt-4">
                {t('actions.clearFilters')}
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visiblePlaces.map((place) => {
                const status = placeStatus(place)
                return (
                  <Link key={place.id} to={`/lugares/${place.id}`} className="card block">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display font-semibold text-ink">
                        {place.name}
                      </p>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        {place.relation && <PlaceRelationBadge relation={place.relation} />}
                        {place.visit_count > 0 && (
                          <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/20 dark:text-green-300">
                            {place.visit_count === 1 ? t('places.visitedOnce') : t('places.visitedTimes', { count: place.visit_count })}
                          </span>
                        )}
                        {status === 'pending' && (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                            {t('places.pendingBadge')}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-muted">
                      <PlaceTypeLabel type={place.place_type} />
                      {formatHierarchy(place.hierarchy) && ` · ${formatHierarchy(place.hierarchy)}`}
                    </p>
                  </Link>
                )
              })}
            </div>
          )}
        </>
      )}
    </PageShell>
  )
}
