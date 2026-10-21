import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../api'

interface UnreadCountContextValue {
  unreadCount: number
  /** Re-fetch the unread count (e.g. after marking notifications as read). */
  refresh: () => void
}

const UnreadCountContext = createContext<UnreadCountContextValue>({
  unreadCount: 0,
  refresh: () => {},
})

const POLL_INTERVAL_MS = 60_000

export function UnreadCountProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0)
  const timerRef = useRef<number | null>(null)

  const refresh = useCallback(() => {
    api.notifications
      .unreadCount()
      .then((res) => setUnreadCount(res.unread_count))
      .catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    // Skip polls while the tab is hidden — the focus listener catches up on return.
    const onInterval = () => {
      if (document.hidden) return
      refresh()
    }
    timerRef.current = window.setInterval(onInterval, POLL_INTERVAL_MS)

    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  return (
    <UnreadCountContext.Provider value={{ unreadCount, refresh }}>
      {children}
    </UnreadCountContext.Provider>
  )
}

export function useUnreadCount() {
  return useContext(UnreadCountContext)
}
