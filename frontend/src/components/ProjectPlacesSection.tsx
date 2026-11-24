import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, LayoutGrid, List, Table2 } from 'lucide-react'
import { PlaceTypeLabel } from '@/components/ui/PlaceTypeLabel'
import { usePersistentFilters } from '@/hooks/useApiResource'
import { useTranslation } from '@/i18n'
import type { ProjectPlace, User } from '@/types'
import { formatDate as formatUserDate, formatHierarchy } from '@/utils/format'

type ViewMode = 'list' | 'cards' | 'table'
type GroupByKey = 'none' | 'comarca' | 'province' | 'region' | 'country'

interface ProjectPlacesPrefs {
  view: ViewMode
  groupBy: GroupByKey
}

const DEFAULT_PREFS: ProjectPlacesPrefs = {
  view: 'list',
  groupBy: 'none',
}

const GROUP_OPTIONS: { value: GroupByKey; labelKey: string }[] = [
  { value: 'none', labelKey: 'projects.groupNone' },
  { value: 'comarca', labelKey: 'projects.groupComarca' },
  { value: 'province', labelKey: 'projects.groupProvince' },
  { value: 'region', labelKey: 'projects.groupRegion' },
  { value: 'country', labelKey: 'projects.groupCountry' },
]

const MISSING_GROUP_LABEL_KEY: Record<Exclude<GroupByKey, 'none'>, string> = {
  comarca: 'projects.groupMissingComarca',
  province: 'projects.groupMissingProvince',
  region: 'projects.groupMissingRegion',
  country: 'projects.groupMissingCountry',
}

interface PlaceGroup {
  key: string
  label: string
  items: ProjectPlace[]
  isFallback: boolean
}

export interface ProjectPlacesSectionProps {
  places: ProjectPlace[]
  user: User | null
  canEdit: boolean
  busyPlaceId: number | null
  removingPlaceId: number | null
  onRequestRemove: (placeId: number | null) => void
  onToggleUnmark: (placeId: number) => void
  onRemovePlace: (placeId: number) => void
}

export function ProjectPlacesSection({
  places,
  user,
  canEdit,
  busyPlaceId,
  removingPlaceId,
  onRequestRemove,
  onToggleUnmark,
  onRemovePlace,
}: ProjectPlacesSectionProps) {
  const { t, pluralize } = useTranslation()
  const [prefs, setPrefs] = usePersistentFilters<ProjectPlacesPrefs>(
    'projetos:placesView',
    user?.id,
    DEFAULT_PREFS,
  )

  const availableGroups = useMemo(() => {
    const present: Record<GroupByKey, boolean> = {
      none: true,
      comarca: false,
      province: false,
      region: false,
      country: false,
    }
    for (const place of places) {
      const h = place.place_hierarchy
      if (!h) continue
      if (h.comarca?.trim()) present.comarca = true
      if (h.province?.trim()) present.province = true
      if (h.region?.trim()) present.region = true
      if (h.country?.trim()) present.country = true
    }
    return GROUP_OPTIONS.filter((opt) => present[opt.value])
  }, [places])

  // Fall back cleanly when persisted preferences are stale or unavailable for
  // this project (e.g. a project without comarcas), without overwriting the
  // user's saved preference for projects that do have it.
  const effectiveView: ViewMode =
    prefs.view === 'cards' || prefs.view === 'table' || prefs.view === 'list'
      ? prefs.view
      : 'list'
  const effectiveGroupBy: GroupByKey = availableGroups.some((opt) => opt.value === prefs.groupBy)
    ? prefs.groupBy
    : 'none'

  const groups = useMemo<PlaceGroup[] | null>(() => {
    if (effectiveGroupBy === 'none') return null
    const buckets = new Map<string, ProjectPlace[]>()
    const missing: ProjectPlace[] = []
    for (const place of places) {
      const value = place.place_hierarchy?.[effectiveGroupBy]?.trim()
      if (!value) {
        missing.push(place)
      } else {
        const list = buckets.get(value)
        if (list) list.push(place)
        else buckets.set(value, [place])
      }
    }
    const sorted: PlaceGroup[] = [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'pt'))
      .map(([label, items]) => ({ key: label, label, items, isFallback: false }))
    if (missing.length > 0) {
      sorted.push({
        key: '__missing__',
        label: t(MISSING_GROUP_LABEL_KEY[effectiveGroupBy]),
        items: missing,
        isFallback: true,
      })
    }
    return sorted
  }, [places, effectiveGroupBy, t])

  const renderStatusBadge = (place: ProjectPlace) => {
    if (place.is_unmarked) {
      return (
        <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          {t('projects.unmarked')}
        </span>
      )
    }
    if (place.is_visited) {
      return (
        <span className="inline-flex shrink-0 items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
          {t('projects.visited')}
        </span>
      )
    }
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-line/40 px-2.5 py-0.5 text-xs font-medium text-muted dark:bg-fill">
        {t('projects.pending')}
      </span>
    )
  }

  const renderActions = (place: ProjectPlace) => {
    if (!canEdit) return null
    const isBusy = busyPlaceId === place.place_id
    const isConfirming = removingPlaceId === place.place_id

    return (
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {(place.is_visited || place.is_unmarked) && !isConfirming && (
          <button
            type="button"
            onClick={() => onToggleUnmark(place.place_id)}
            disabled={isBusy}
            className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-line/40 disabled:opacity-50 dark:hover:bg-fill"
          >
            {place.is_unmarked ? t('projects.markVisitedAgain') : t('projects.unmarkVisit')}
          </button>
        )}
        {isConfirming ? (
          <>
            <button
              type="button"
              onClick={() => onRemovePlace(place.place_id)}
              disabled={isBusy}
              className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {isBusy ? t('projects.removing') : t('projects.confirmRemove')}
            </button>
            <button
              type="button"
              onClick={() => onRequestRemove(null)}
              disabled={isBusy}
              className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-line/40 disabled:opacity-50 dark:hover:bg-fill"
            >
              {t('actions.cancel')}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => onRequestRemove(place.place_id)}
            disabled={isBusy}
            className="rounded-lg bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30"
          >
            {t('projects.removePlace')}
          </button>
        )}
      </div>
    )
  }

  const renderListView = (items: ProjectPlace[], omitKey: string | null) => (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
      {items.map((place) => {
        const location = formatHierarchy(place.place_hierarchy, omitKey)
        const visitDate = place.is_visited && place.visited_at ? formatUserDate(place.visited_at, user) : null
        return (
          <li
            key={place.id}
            className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-fill/40 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link
                  to={`/lugares/${place.place_id}`}
                  className="font-medium text-primary-700 hover:underline dark:text-primary-300"
                >
                  {place.place_name}
                </Link>
                <PlaceTypeLabel
                  type={place.place_type}
                  className="rounded-md bg-fill px-1.5 py-0.5 text-xs text-muted"
                />
                {location && (
                  <span className="truncate text-xs text-muted">· {location}</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2.5 sm:justify-end">
              <div className="flex items-center gap-2">
                {visitDate && (
                  <span
                    className="text-xs tabular-nums text-muted"
                    title={t('projects.visitedOn', { date: visitDate })}
                  >
                    {visitDate}
                  </span>
                )}
                {renderStatusBadge(place)}
              </div>
              {renderActions(place)}
            </div>
          </li>
        )
      })}
    </ul>
  )

  const renderCardsView = (items: ProjectPlace[], omitKey: string | null) => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((place) => {
        const location = formatHierarchy(place.place_hierarchy, omitKey)
        const visitDate = place.is_visited && place.visited_at ? formatUserDate(place.visited_at, user) : null
        return (
          <article
            key={place.id}
            className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 transition-colors hover:bg-fill/30"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <Link
                  to={`/lugares/${place.place_id}`}
                  className="font-medium leading-snug text-primary-700 hover:underline dark:text-primary-300"
                >
                  {place.place_name}
                </Link>
                {renderStatusBadge(place)}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <PlaceTypeLabel
                  type={place.place_type}
                  className="rounded-md bg-fill px-1.5 py-0.5"
                />
                {location && <span className="truncate">{location}</span>}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-2.5">
              <span
                className="text-xs tabular-nums text-muted"
                title={visitDate ? t('projects.visitedOn', { date: visitDate }) : undefined}
              >
                {visitDate ?? t('projects.notVisitedYet')}
              </span>
              {renderActions(place)}
            </div>
          </article>
        )
      })}
    </div>
  )

  const renderTableView = (items: ProjectPlace[], omitKey: string | null, groupLabel?: string) => (
    <div
      tabIndex={0}
      role="region"
      aria-label={groupLabel ? `${t('projects.targetPlaces')} — ${groupLabel}` : t('projects.targetPlaces')}
      className="max-h-[70vh] overflow-auto rounded-2xl border border-line focus-visible:ring-2 focus-visible:ring-primary"
    >
      <table className="w-full min-w-[600px] border-separate border-spacing-0 text-left text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-fill text-xs font-semibold text-muted">
            <th scope="col" className="border-b border-line bg-fill px-4 py-2.5">
              {t('projects.tablePlace')}
            </th>
            <th scope="col" className="border-b border-line bg-fill px-3 py-2.5">
              {t('projects.tableType')}
            </th>
            <th scope="col" className="border-b border-line bg-fill px-3 py-2.5">
              {t('projects.tableLocation')}
            </th>
            <th scope="col" className="border-b border-line bg-fill px-3 py-2.5">
              {t('projects.tableStatus')}
            </th>
            <th scope="col" className="border-b border-line bg-fill px-3 py-2.5">
              {t('projects.tableLastVisit')}
            </th>
            {canEdit && (
              <th scope="col" className="border-b border-line bg-fill px-4 py-2.5 text-right">
                {t('projects.tableActions')}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((place, index) => {
            const location = formatHierarchy(place.place_hierarchy, omitKey)
            const visitDate = place.is_visited && place.visited_at ? formatUserDate(place.visited_at, user) : null
            const rowBorder = index < items.length - 1 ? 'border-b border-line/70' : ''
            return (
              <tr key={place.id} className="transition-colors hover:bg-fill/40">
                <th scope="row" className={`${rowBorder} px-4 py-2.5 font-medium`}>
                  <Link
                    to={`/lugares/${place.place_id}`}
                    className="text-primary-700 hover:underline dark:text-primary-300"
                  >
                    {place.place_name}
                  </Link>
                </th>
                <td className={`${rowBorder} whitespace-nowrap px-3 py-2.5 text-xs text-muted`}>
                  <PlaceTypeLabel type={place.place_type} />
                </td>
                <td className={`${rowBorder} px-3 py-2.5 text-xs text-muted`}>
                  {location || '—'}
                </td>
                <td className={`${rowBorder} whitespace-nowrap px-3 py-2.5`}>
                  {renderStatusBadge(place)}
                </td>
                <td className={`${rowBorder} whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-muted`}>
                  {visitDate ?? '—'}
                </td>
                {canEdit && (
                  <td className={`${rowBorder} px-4 py-2.5`}>
                    <div className="flex justify-end">{renderActions(place)}</div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  const renderCollection = (items: ProjectPlace[], omitKey: string | null, groupLabel?: string) => {
    if (effectiveView === 'cards') return renderCardsView(items, omitKey)
    if (effectiveView === 'table') return renderTableView(items, omitKey, groupLabel)
    return renderListView(items, omitKey)
  }

  const viewOptions: { value: ViewMode; label: string; Icon: typeof List }[] = [
    { value: 'list', label: t('projects.viewList'), Icon: List },
    { value: 'cards', label: t('projects.viewCards'), Icon: LayoutGrid },
    { value: 'table', label: t('projects.viewTable'), Icon: Table2 },
  ]

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <h3 className="font-display text-lg font-semibold">{t('projects.targetPlaces')}</h3>
          {places.length > 0 && (
            <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-medium tabular-nums text-muted">
              {places.length} {pluralize(places.length, 'units.place.one', 'units.place.other')}
            </span>
          )}
        </div>

        {places.length > 0 && (
          <div className="flex flex-wrap items-center gap-2.5">
            {availableGroups.length > 1 && (
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="project-places-group"
                  className="text-xs font-medium text-muted"
                >
                  {t('projects.groupByLabel')}:
                </label>
                <select
                  id="project-places-group"
                  value={effectiveGroupBy}
                  onChange={(e) =>
                    setPrefs((prev) => ({ ...prev, groupBy: e.target.value as GroupByKey }))
                  }
                  className="input w-auto py-1.5 pl-3 pr-8 text-xs font-medium"
                >
                  {availableGroups.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div
              role="group"
              aria-label={t('projects.viewModeAria')}
              className="inline-flex items-center rounded-pill border border-line bg-bg p-0.5 text-xs font-medium"
            >
              {viewOptions.map(({ value, label, Icon }) => {
                const active = effectiveView === value
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPrefs((prev) => ({ ...prev, view: value }))}
                    className={
                      active
                        ? 'inline-flex items-center gap-1.5 rounded-pill bg-ink px-3 py-1 text-surface transition-colors'
                        : 'inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-muted transition-colors hover:text-ink'
                    }
                  >
                    <Icon size={14} strokeWidth={2} aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {places.length === 0 ? (
        <p className="text-sm text-muted">{t('projects.noPlaces')}</p>
      ) : !groups ? (
        renderCollection(places, null)
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const visitedCount = group.items.filter((p) => p.is_visited && !p.is_unmarked).length
            const pct = Math.round((visitedCount / group.items.length) * 100)
            return (
              <details key={`${effectiveGroupBy}:${group.key}`} open className="group-disclosure space-y-2.5">
                <summary className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-fill/70 px-3.5 py-2 transition-colors hover:bg-fill">
                  <span className="flex min-w-0 items-center gap-2">
                    <ChevronDown
                      size={16}
                      strokeWidth={2}
                      aria-hidden="true"
                      className="group-disclosure-chevron shrink-0 text-muted"
                    />
                    <span
                      className={
                        group.isFallback
                          ? 'truncate text-sm font-semibold italic text-muted'
                          : 'truncate text-sm font-semibold text-ink'
                      }
                    >
                      {group.label}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2.5 text-xs tabular-nums text-muted">
                    <span>
                      {t('projects.groupProgress', {
                        visited: visitedCount,
                        total: group.items.length,
                      })}
                    </span>
                    <span
                      aria-hidden="true"
                      className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-line sm:inline-block"
                    >
                      <span
                        className="block h-full rounded-full bg-primary-600"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  </span>
                </summary>
                {renderCollection(group.items, effectiveGroupBy, group.label)}
              </details>
            )
          })}
        </div>
      )}
    </>
  )
}
