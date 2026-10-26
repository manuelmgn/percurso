/**
 * Pill-style multi-select (participants/viewers in the trip and project
 * editors, place links in the trip editor). Previously each editor carried
 * an identical copy of this markup.
 */
export function PillChecklist({
  items,
  selectedIds,
  onToggle,
  emptyMessage,
}: {
  items: { id: number; label: string }[]
  selectedIds: number[]
  onToggle: (id: number) => void
  emptyMessage: string
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">{emptyMessage}</p>
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const checked = selectedIds.includes(item.id)
        return (
          <label
            key={item.id}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors ${
              checked
                ? 'border-primary bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-200'
                : 'border-line text-ink hover:bg-line/40 dark:hover:bg-fill'
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(item.id)}
              className="h-4 w-4 rounded border-line text-primary-600 focus:ring-primary"
            />
            {item.label}
          </label>
        )
      })}
    </div>
  )
}
