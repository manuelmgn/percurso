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
export function formatHierarchy(hierarchy: Record<string, string> | null): string {
  if (!hierarchy) return ''
  return Object.values(hierarchy).filter(Boolean).reverse().join(' / ')
}

// Format a date honouring the user's preferred format (default: dd/mm/aaaa).
export function formatDate(value: DateLike, prefs?: DatePrefs | null): string {
  const { day, month, year } = dateParts(value, prefs)
  switch (prefs?.date_format) {
    case '%m/%d/%Y':
      return `${month}/${day}/${year}`
    case '%Y-%m-%d':
      return `${year}-${month}-${day}`
    default:
      return `${day}/${month}/${year}`
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
export function formatTripDateRange(start: string, end: string, prefs?: DatePrefs | null): string {
  const startFmt = formatDate(start, prefs)
  const endFmt = formatDate(end, prefs)
  return startFmt === endFmt ? startFmt : `${startFmt} – ${endFmt}`
}

// Display name for a trip: its custom title, or a generated one from the dates.
export function formatTripTitle(
  trip: { title: string | null; start_date: string; end_date: string },
  prefs?: DatePrefs | null,
): string {
  return trip.title?.trim() || `${t('trips.fallbackTitle')} ${formatTripDateRange(trip.start_date, trip.end_date, prefs)}`
}
