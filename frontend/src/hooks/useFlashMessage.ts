import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Transient confirmation message ("Guardado ✓" style) that clears itself
 * after `timeoutMs`. Replaces the `setMessage(text); setTimeout(() =>
 * setMessage(''), N)` pair copied across the settings/admin pages — which
 * also let a first timer wipe a second, newer message and fired after
 * unmount. Re-flashing restarts the timer; the timer is cancelled on
 * unmount.
 */
export function useFlashMessage(timeoutMs = 3000): [string, (message: string) => void, () => void] {
  const [message, setMessage] = useState('')
  const timerRef = useRef<number | undefined>(undefined)

  const clear = useCallback(() => {
    window.clearTimeout(timerRef.current)
    setMessage('')
  }, [])

  const flash = useCallback(
    (next: string) => {
      window.clearTimeout(timerRef.current)
      setMessage(next)
      timerRef.current = window.setTimeout(() => setMessage(''), timeoutMs)
    },
    [timeoutMs],
  )

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  return [message, flash, clear]
}
