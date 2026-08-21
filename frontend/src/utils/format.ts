// Format an administrative hierarchy for display, smallest → largest,
// e.g. "Narón / Ferrol / Galicia / España". Hierarchy dicts are stored
// ordered largest → smallest (country first), so values are reversed.
export function formatHierarchy(hierarchy: Record<string, string> | null): string {
  if (!hierarchy) return ''
  return Object.values(hierarchy).filter(Boolean).reverse().join(' / ')
}
