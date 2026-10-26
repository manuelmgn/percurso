import { useEffect } from 'react'

/**
 * Warn (browser-native dialog) when the user closes or reloads the tab with
 * unsaved form data. The hook is auto-armed when `dirty` flips to true and
 * released on unmount or submit. Nothing is hooked while the form is clean.
 */
export function useUnloadGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Legacy browsers require returnValue to trigger the prompt.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])
}
