import { useEffect, useRef } from 'react'

/**
 * Accessibility plumbing shared by every overlay (delete-account modal,
 * photo lightbox): moves focus into the container on open, traps Tab inside
 * it, restores focus to the trigger on close and wires Escape.
 */
export function useModalA11y<T extends HTMLElement>(onClose: () => void) {
  const containerRef = useRef<T | null>(null)
  // Callers pass a fresh arrow each render; keeping the latest one in a ref
  // (instead of depending on it) stops the effect re-running on every parent
  // re-render, which would yank focus back to the container mid-edit.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const container = containerRef.current
    const focusables = () =>
      Array.from(
        container?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !el.hasAttribute('disabled'))

    // Initial focus: first meaningful element inside, else the container.
    container?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !containerRef.current) return
      const items = focusables()
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !containerRef.current.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !containerRef.current.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      // Hand focus back to whatever opened the overlay.
      previouslyFocused?.focus?.()
    }
    // Run once per mount: the onClose ref above keeps the callback fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return containerRef
}
