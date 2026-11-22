// Add/remove an id in a selection list (the edit forms' checklists).
export function toggleId(list: number[], idToToggle: number): number[] {
  return list.includes(idToToggle) ? list.filter((x) => x !== idToToggle) : [...list, idToToggle]
}
