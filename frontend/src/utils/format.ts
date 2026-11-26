import { t } from '@/i18n'

// User date/time preferences (subset of User; kept structural to avoid imports).
export interface DatePrefs {
  date_format?: string
  timezone?: string
}

type DateLike = string | Date

// Intl.DateTimeFormat instances are expensive to construct; cache one per
// options shape (timezone included) so date-heavy lists don't keep rebuilding
// formatters.
const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>()

function getDateTimeFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options)
  let formatter = dateTimeFormatCache.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('pt-PT', options)
    dateTimeFormatCache.set(key, formatter)
  }
  return formatter
}

// Split a date/datetime into day/month/year parts. Date-only strings
// ("2026-07-01") are calendar dates and must not be shifted by timezones.
function dateParts(value: DateLike, prefs?: DatePrefs | null): { day: string; month: string; year: string } {
  if (typeof value === 'string') {
    const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (dateOnly) return { year: dateOnly[1], month: dateOnly[2], day: dateOnly[3] }
  }
  const parts = getDateTimeFormat({
    timeZone: prefs?.timezone || undefined,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date(value))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return { day: get('day'), month: get('month'), year: get('year') }
}

// Format an administrative hierarchy for display, smallest → largest,
// e.g. "Narón / Ferrol / Galicia / Spain". Hierarchy dicts are stored
// ordered largest → smallest (country first), so values are reversed.
// Pass `omitKey` when items are already grouped by that administrative level.
export function formatHierarchy(hierarchy: Record<string, string> | null, omitKey?: string | null): string {
  if (!hierarchy) return ''
  return Object.entries(hierarchy)
    .filter(([key, value]) => Boolean(value) && key !== omitKey)
    .map(([, value]) => value)
    .reverse()
    .join(' / ')
}

// Format a date honouring the user's preferred format (default: dd/mm/aaaa).
// `shortYear` uses a two-digit year (dd/mm/aa) for compact layouts such as
// trip cards; ISO dates always keep the full year.
export function formatDate(value: DateLike, prefs?: DatePrefs | null, shortYear = false): string {
  const { day, month, year } = dateParts(value, prefs)
  const yy = shortYear ? year.slice(-2) : year
  switch (prefs?.date_format) {
    case '%m/%d/%Y':
      return `${month}/${day}/${yy}`
    case '%Y-%m-%d':
      return `${year}-${month}-${day}`
    default:
      return `${day}/${month}/${yy}`
  }
}

// Format a datetime (date + time) in the user's timezone and date format.
export function formatDateTime(value: DateLike, prefs?: DatePrefs | null): string {
  const time = getDateTimeFormat({
    timeZone: prefs?.timezone || undefined,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
  return `${formatDate(value, prefs)}, ${time}`
}

// "12/08/2026 – 15/08/2026" (or a single date when both are equal).
export function formatTripDateRange(start: string, end: string, prefs?: DatePrefs | null, shortYear = false): string {
  const startFmt = formatDate(start, prefs, shortYear)
  const endFmt = formatDate(end, prefs, shortYear)
  return startFmt === endFmt ? startFmt : `${startFmt} – ${endFmt}`
}

// Display name for a trip: its custom title, or a generated one from the dates.
export function formatTripTitle(
  trip: { title: string | null; start_date: string; end_date: string },
  prefs?: DatePrefs | null,
): string {
  return trip.title?.trim() || `${t('trips.fallbackTitle')} ${formatTripDateRange(trip.start_date, trip.end_date, prefs)}`
}

// Number of days a trip spans, inclusive of both ends ("Sáb 3 → Seg 5" = 3).
export function tripDayCount(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
}

// Every calendar day of a trip as ISO dates, inclusive of both ends. Done in
// UTC so DST changes never skip or repeat a day. Capped as a safety net
// against absurd ranges.
export function tripDays(startDate: string, endDate: string, max = 366): string[] {
  const days: string[] = []
  const start = Date.parse(`${startDate}T00:00:00Z`)
  const end = Date.parse(`${endDate}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end)) return days
  for (let ms = start; ms <= end && days.length < max; ms += 86_400_000) {
    days.push(new Date(ms).toISOString().slice(0, 10))
  }
  return days
}

// Compact day label for a calendar date: "sáb. 12/10" (month/day order
// follows the user's date format).
export function formatShortDay(isoDate: string, prefs?: DatePrefs | null): string {
  const { day, month } = dateParts(isoDate, prefs)
  const weekday = getDateTimeFormat({ weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`),
  )
  const dm = prefs?.date_format === '%m/%d/%Y' ? `${month}/${day}` : `${day}/${month}`
  return `${weekday} ${dm}`
}

// Detail-page route for an entity type/id pair (`trip` | `project` | `place`)
// → `/viagens/1` etc., null for anything else. Callers add their own
// fallback: notifications navigate to '/', activity items render plain text.
export function entityDetailPath(entityType: string, entityId: number): string | null {
  switch (entityType) {
    case 'trip':
      return `/viagens/${entityId}`
    case 'project':
      return `/projetos/${entityId}`
    case 'place':
      return `/lugares/${entityId}`
    default:
      return null
  }
}

// i18n key for a visibility value (`all` | `specific` | `private`) →
// `visibility.optionAll` etc. Built by hand in three pages before.
export function visibilityLabelKey(visibility: string): string {
  return `visibility.option${visibility.charAt(0).toUpperCase()}${visibility.slice(1)}`
}

// Short display label for a PlaceType: the canonical taxonomy keeps
// 'concelho/município' (stored in the DB/API), but the UI shows 'concelho'
// with the full label exposed via hover tooltip (placeTypeTitle).
export function formatPlaceType(type: string): string {
  return type === 'concelho/município' ? 'concelho' : type
}

export function placeTypeTitle(type: string): string | undefined {
  return type === 'concelho/município' ? 'concelho/município' : undefined
}

// Format a personal place relation's approximate year/range:
//   2018 & 2018 -> "2018"
//   2015 & 2020 -> "2015–2020"
//   2020 & null -> "desde 2020"
//   null & 2015 -> "até 2015"
//   null & null -> ""
export function formatPlaceRelationYears(yearFrom: number | null, yearTo: number | null): string {
  if (yearFrom != null && yearTo != null) {
    return yearFrom === yearTo ? String(yearFrom) : `${yearFrom}–${yearTo}`
  }
  if (yearFrom != null) return t('places.relation.sinceYear', { year: yearFrom })
  if (yearTo != null) return t('places.relation.untilYear', { year: yearTo })
  return ''
}
