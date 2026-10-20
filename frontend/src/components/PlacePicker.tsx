import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/i18n'
import { api } from '@/api'
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
  const [isSearching, setIsSearching] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

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
        setIsOpen(true)
        setError('')
      } catch (err: any) {
        setError(err.message || t('placePicker.searchError'))
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
    } catch (err: any) {
      setError(err.message || t('placePicker.importError'))
    } finally {
      setIsImporting(false)
    }
  }

  const remove = (id: number) => {
    onChange(selected.filter((p) => p.id !== id))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (isOpen && results.length > 0 && !isImporting) {
        pick(results[0])
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

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
        />
        {(isSearching || isImporting) && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">
            {isImporting ? t('placePicker.adding') : t('placePicker.searching')}
          </span>
        )}

        {isOpen && results.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-white shadow-lg dark:border-[#322A23] dark:bg-[#221D18]" role="listbox">
            {results.map((result) => (
              <li key={`${result.osm_type}-${result.osm_id}`}>
                <button
                  type="button"
                  onClick={() => pick(result)}
                  disabled={isImporting}
                  className="w-full px-4 py-2 text-left text-sm transition-colors hover:bg-line/40 disabled:opacity-50 dark:hover:bg-[#322A23]"
                  role="option"
                >
                  <span className="font-medium text-ink dark:text-[#FAF7F2]">{result.name}</span>
                  {formatHierarchy(result.hierarchy) && (
                    <span className="text-muted dark:text-[#A09A92]"> — {formatHierarchy(result.hierarchy)}</span>
                  )}
                  <span className="text-muted dark:text-[#A09A92]"> [{result.place_type}]</span>
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
