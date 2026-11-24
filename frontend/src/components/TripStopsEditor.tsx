import { useState } from 'react'
import { ArrowDownUp, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useAuth } from '@/context/AuthContext'
import { PlacePicker, type PickedPlace } from '@/components/PlacePicker'
import { PlaceTypeLabel } from '@/components/ui/PlaceTypeLabel'
import { formatHierarchy, formatShortDay, tripDays } from '@/utils/format'

// Trips longer than this collapse each stop's day pills behind a toggle so
// the list stays scannable.
const INLINE_DAYS_MAX = 10

interface TripStopsEditorProps {
  stops: PickedPlace[]
  onChange: (stops: PickedPlace[]) => void
  startDate: string
  endDate: string
}

/** Ordered itinerary editor: add places, reorder them freely and optionally
 *  mark the day(s) each one was visited (within the trip's dates). */
export function TripStopsEditor({ stops, onChange, startDate, endDate }: TripStopsEditorProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const days = startDate && (!endDate || endDate >= startDate) ? tripDays(startDate, endDate || startDate) : []
  const daySet = new Set(days)
  const multiDay = days.length > 1
  const collapsible = days.length > INLINE_DAYS_MAX
  // Only days inside the current range count; stale ones are pruned on save.
  const datesOf = (stop: PickedPlace) => (stop.visit_dates ?? []).filter((d) => daySet.has(d))
  const hasAnyDates = stops.some((s) => datesOf(s).length > 0)

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= stops.length) return
    const next = [...stops]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  const remove = (id: number) => onChange(stops.filter((s) => s.id !== id))

  const toggleDay = (id: number, day: string) => {
    onChange(
      stops.map((s) => {
        if (s.id !== id) return s
        const current = s.visit_dates ?? []
        const visit_dates = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()
        return { ...s, visit_dates }
      }),
    )
  }

  // Stable sort by first visit day; stops without a day keep their relative
  // order after the dated ones.
  const sortByDate = () => {
    const keyed = stops.map((s, i) => ({ s, i, first: datesOf(s)[0] ?? '\uffff' }))
    keyed.sort((a, b) => (a.first === b.first ? a.i - b.i : a.first < b.first ? -1 : 1))
    onChange(keyed.map((k) => k.s))
  }

  const toggleExpanded = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const iconButton =
    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-fill hover:text-ink disabled:pointer-events-none disabled:opacity-30'

  return (
    <div className="space-y-3">
      <PlacePicker selected={stops} onChange={onChange} hideSelected />

      {stops.length === 0 ? (
        <p className="text-sm text-muted">{t('tripStops.empty')}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              {!startDate ? t('tripStops.needDates') : multiDay ? t('tripStops.hint') : null}
            </p>
            {hasAnyDates && stops.length > 1 && (
              <button
                type="button"
                onClick={sortByDate}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1 text-xs font-semibold text-ink transition-colors hover:bg-fill"
              >
                <ArrowDownUp size={13} aria-hidden="true" /> {t('tripStops.sortByDate')}
              </button>
            )}
          </div>

          <ol className="space-y-2">
            {stops.map((stop, index) => {
              const selected = datesOf(stop)
              const showPills = multiDay && (!collapsible || expanded.has(stop.id))
              const hierarchy = formatHierarchy(stop.hierarchy)
              return (
                <li key={stop.id} className="rounded-2xl border border-line bg-surface p-3">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-tint text-xs font-bold text-primary dark:bg-primary-900/30"
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{stop.name}</p>
                      <p className="truncate text-xs text-muted">
                        {hierarchy && `${hierarchy} · `}
                        <PlaceTypeLabel type={stop.place_type} />
                      </p>
                    </div>
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        className={iconButton}
                        aria-label={t('tripStops.moveUp', { name: stop.name })}
                        title={t('tripStops.moveUp', { name: stop.name })}
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === stops.length - 1}
                        className={iconButton}
                        aria-label={t('tripStops.moveDown', { name: stop.name })}
                        title={t('tripStops.moveDown', { name: stop.name })}
                      >
                        <ChevronDown size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(stop.id)}
                        className={`${iconButton} hover:text-red-600 dark:hover:text-red-400`}
                        aria-label={t('tripStops.remove', { name: stop.name })}
                        title={t('tripStops.remove', { name: stop.name })}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {multiDay && (
                    <div className="mt-2 pl-10">
                      {collapsible && (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(stop.id)}
                          aria-expanded={expanded.has(stop.id)}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          {expanded.has(stop.id) ? t('tripStops.hideDays') : t('tripStops.chooseDays')}
                          {' · '}
                          {selected.length === 0
                            ? t('tripStops.daysNone')
                            : selected.length === 1
                              ? t('trip.stopDay', { n: days.indexOf(selected[0]) + 1 })
                              : selected.length <= 4
                                ? t('trip.stopDays', {
                                    list: selected.map((d) => days.indexOf(d) + 1).join(', '),
                                  })
                                : t('tripStops.daysSelected.other', { count: selected.length })}
                        </button>
                      )}
                      {showPills && (
                        <div
                          className={`flex flex-wrap gap-1.5 ${collapsible ? 'mt-2' : ''}`}
                          role="group"
                          aria-label={`${t('tripStops.days')}: ${stop.name}`}
                        >
                          {days.map((day, i) => {
                            const active = selected.includes(day)
                            const label = formatShortDay(day, user)
                            return (
                              <button
                                key={day}
                                type="button"
                                onClick={() => toggleDay(stop.id, day)}
                                aria-pressed={active}
                                aria-label={t('tripStops.dayToggleAria', { n: i + 1, date: label, name: stop.name })}
                                className={`rounded-pill border px-2.5 py-1 text-xs transition-colors ${
                                  active
                                    ? 'border-primary bg-primary text-white'
                                    : 'border-line text-muted hover:border-primary/50 hover:text-ink'
                                }`}
                              >
                                <span className="font-semibold">{t('tripStops.dayPill', { n: i + 1 })}</span>
                                <span className={active ? 'text-white/85' : ''}> · {label}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </>
      )}
    </div>
  )
}
