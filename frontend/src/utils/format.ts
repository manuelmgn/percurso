// Format an administrative hierarchy for display, smallest → largest,
// e.g. "Narón / Ferrol / Galicia / España". Hierarchy dicts are stored
// ordered largest → smallest (country first), so values are reversed.
export function formatHierarchy(hierarchy: Record<string, string> | null): string {
  if (!hierarchy) return ''
  return Object.values(hierarchy).filter(Boolean).reverse().join(' / ')
}

// "12 ago 2026 – 15 ago 2026" (or a single date when both are equal).
export function formatTripDateRange(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })
  const startFmt = fmt(start)
  const endFmt = fmt(end)
  return startFmt === endFmt ? startFmt : `${startFmt} – ${endFmt}`
}

// Display name for a trip: its custom title, or a generated one from the dates.
export function formatTripTitle(trip: { title: string | null; start_date: string; end_date: string }): string {
  return trip.title?.trim() || `Viagem ${formatTripDateRange(trip.start_date, trip.end_date)}`
}
