/**
 * Inline error message shared by every page and form. `message` must be
 * pt-PT and user-facing; render nothing when it is empty so callers can
 * spread it as `<ErrorBanner message={error} />` unconditionally.
 */
export function ErrorBanner({ message, className }: { message: string; className?: string }) {
  if (!message) return null
  return (
    <div
      className={`rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300 ${className ?? ''}`}
      role="alert"
      aria-live="polite"
    >
      {message}
    </div>
  )
}
