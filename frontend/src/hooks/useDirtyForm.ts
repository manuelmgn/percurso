import { useRef } from 'react'
import { useUnloadGuard } from './useUnloadGuard'

/**
 * JSON fingerprint of the whole form; frozen once the initial load finishes.
 * Any later difference arms the "unsaved changes" dialog. Submitting disarms
 * it so a successful save doesn't prompt while navigating away.
 */
export function useDirtyForm(values: unknown, isLoading: boolean, isSubmitting: boolean): boolean {
  const savedFormRef = useRef<string | null>(null)
  const formFingerprint = JSON.stringify(values)
  if (savedFormRef.current === null && !isLoading) {
    savedFormRef.current = formFingerprint
  }
  const isDirty =
    savedFormRef.current !== null &&
    !isSubmitting &&
    formFingerprint !== savedFormRef.current
  useUnloadGuard(isDirty)
  return isDirty
}
