import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '../i18n'

export interface UseApiResource<T, D = T | null> {
  data: D
  isLoading: boolean
  error: string
  /** Overwrite the current data locally (e.g. after a mutation). */
  setData: React.Dispatch<React.SetStateAction<T | null>>
  /** Re-run the fetcher. */
  refetch: () => void
}

/**
 * Fetch-on-mount with a cancellation guard: if the component unmounts or the
 * inputs change before the response arrives, stale responses never touch
 * the state. Every detail/list loader in the app uses this instead of the
 * hand-rolled useEffect + useState triplet (which was copied ~15 times and
 * raced when navigating quickly between two details of the same type).
 *
 * Pass `initialData` (e.g. `[]` or `{}`) to get a non-nullable `data`
 * overload — handy for list pages that render before the first response.
 */
export function useApiResource<T>(fetcher: () => Promise<T>, deps: React.DependencyList | undefined, initialData: T): UseApiResource<T, T>
export function useApiResource<T>(fetcher: () => Promise<T>, deps?: React.DependencyList): UseApiResource<T>
export function useApiResource<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList = [],
  initialData: T | null = null,
): UseApiResource<T, T | null> {
  const [data, setData] = useState<T | null>(initialData)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshTick, setRefreshTick] = useState(0)
  // Latest fetcher identity, so refetch always calls the current closure.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError('')
    fetcherRef.current()
      .then((value) => { if (!cancelled) setData(value) })
      .catch((err) => { if (!cancelled) setError(getErrorMessage(err)) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
    // Caller-provided deps drive refetching; refreshTick only for refetch().
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are spread, not the array identity itself
  }, [refreshTick, ...deps])

  const refetch = useCallback(() => setRefreshTick((t) => t + 1), [])

  return { data, isLoading, error, setData, refetch }
}

/**
 * Message shown for a failed API call. ApiError already carries a pt-PT
 * message from the backend; anything else falls back to a context-specific
 * `fallback` (or the generic text). Replaces `err.message || t(key)` and the
 * untouchable `err: any` typing it required.
 */
export function getErrorMessage(err: unknown, fallback?: string): string {
  if (err instanceof Error) {
    if (err.message && !err.message.startsWith('Request failed')) return err.message
  }
  return fallback ?? t('errors.generic')
}

/**
 * Filters that survive navigation between list pages, namespaced per user.
 * Replaces the loadFilters/useEffect triplet copied across the list pages.
 */
export function usePersistentFilters<T extends object>(
  key: string,
  userId: number | undefined,
  defaults: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [filters, setFilters] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`${key}:${userId ?? 'anon'}`)
      if (raw) return { ...defaults, ...JSON.parse(raw) }
    } catch {
      // Corrupted JSON: fall through to defaults and overwrite on next write.
    }
    return defaults
  })

  useEffect(() => {
    if (userId == null) return
    localStorage.setItem(`${key}:${userId}`, JSON.stringify(filters))
  }, [key, userId, filters])

  return [filters, setFilters]
}
