import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/i18n'
import { api } from '@/api'
import { getErrorMessage } from '@/hooks/useApiResource'
import type { PlaceSearchResult, PlaceType } from '@/types'
import { formatHierarchy } from '@/utils/format'

export interface PickedPlace {
  id: number
  name: string
  place_type: PlaceType
  hierarchy: Record<string, string> | null
}

interface PlacePickerProps {
  selected: PickedPlace[]
  onChange: (places: PickedPlace[]) => void
}

export function PlacePicker({ selected, onChange }: PlacePickerProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceSearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  // Index of the listbox option reachable with ↑/↓ (activedescendant).
  const [highlighted, setHighlighted] = useState(-1)
  const [isSearching, setIsSearching] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }

    setIsSearching(true)
    const timer = setTimeout(async () => {
      try {
        const data = await api.places.search(trimmed)
        setResults(data)
        // Reset the selection to the first candidate on every search.
        setHighlighted(data.length > 0 ? 0 : -1)
        setIsOpen(true)
        setError('')
      } catch (err) {
        setError(getErrorMessage(err, t('placePicker.searchError')))
        setResults([])
      } finally {
        setIsSearching(false)
      }
    }, 450)

    return () => {
      clearTimeout(timer)
      setIsSearching(false)
    }
  }, [query, t])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const pick = async (result: PlaceSearchResult) => {
    setError('')
    setIsImporting(true)
    try {
      // import is get-or-create: always returns the real database id
      const place = await api.places.import(result)
      if (!selected.some((p) => p.id === place.id)) {
        onChange([...selected, { id: place.id, name: place.name, place_type: place.place_type, hierarchy: place.hierarchy }])
      }
      setQuery('')
      setResults([])
      setIsOpen(false)
    } catch (err) {
      setError(getErrorMessage(err, t('placePicker.importError')))
    } finally {
      setIsImporting(false)
    }
  }

  const remove = (id: number) => {
    onChange(selected.filter((p) => p.id !== id))
  }

  // Combobox keyboard model: ↑/↓ move through the results (with the
  // highlight role-announced via aria-activedescendant), Enter picks the
  // highlighted candidate and Escape just closes the list.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isOpen && results.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlighted((h) => (h + 1) % results.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlighted((h) => (h <= 0 ? results.length - 1 : h - 1))
        return
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (isOpen && results.length > 0 && !isImporting) {
        pick(results[highlighted >= 0 ? highlighted : 0])
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  // Keep the highlighted option visible while navigating.
  useEffect(() => {
    if (!isOpen || highlighted < 0) return
    listRef.current?.querySelectorAll('li')[highlighted]?.scrollIntoView({ block: 'nearest' })
  }, [highlighted, isOpen])

  return (
    <div ref={containerRef}>
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {selected.map((place) => (
            <span
              key={place.id}
              className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-3 py-1 text-sm text-primary-800 dark:bg-primary-900/30 dark:text-primary-200"
            >
              {place.name}
              <button
                type="button"
                onClick={() => remove(place.id)}
                className="ml-1 rounded-full text-primary-600 hover:text-primary-900 dark:text-primary-300 dark:hover:text-primary-100"
                aria-label={t('placePicker.removeAria', { name: place.name })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder={t('placePicker.placeholder')}
          className="input"
          aria-label={t('placePicker.aria')}
          role="combobox"
          aria-expanded={isOpen && results.length > 0}
          aria-controls="place-picker-list"
          aria-autocomplete="list"
          aria-activedescendant={
            isOpen && highlighted >= 0 ? `place-picker-option-${highlighted}` : undefined
          }
        />
        {(isSearching || isImporting) && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">
            {isImporting ? t('placePicker.adding') : t('placePicker.searching')}
          </span>
        )}

        {isOpen && results.length > 0 && (
          <ul
            id="place-picker-list"
            ref={listRef}
            className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-surface shadow-lg"
            role="listbox"
          >
            {results.map((result, i) => (
              <li
                key={`${result.osm_type}-${result.osm_id}`}
                id={`place-picker-option-${i}`}
                role="option"
                aria-selected={i === highlighted}
              >
                <button
                  type="button"
                  onClick={() => pick(result)}
                  disabled={isImporting}
                  className={`w-full px-4 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
                    i === highlighted
                      ? 'bg-primary-100 dark:bg-primary-900/30'
                      : 'hover:bg-line/40 dark:hover:bg-fill'
                  }`}
                >
                  <span className="font-medium text-ink">{result.name}</span>
                  {formatHierarchy(result.hierarchy) && (
                    <span className="text-muted"> — {formatHierarchy(result.hierarchy)}</span>
                  )}
                  <span className="text-muted"> [{result.place_type}]</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  )
}
