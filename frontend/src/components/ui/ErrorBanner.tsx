/**
 * Inline alert shared by every page and form. `message` must be pt-PT and
 * user-facing; render nothing when it is empty so callers can spread it as
 * `<AlertBanner message={error} />` unconditionally.
 *
 * `small` uses the compact padding/text size for in-card messages (the big
 * size cannot be re-shrunk via className: Tailwind sorts p-3 after p-2.5).
 */
type AlertVariant = 'error' | 'success'

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  error: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
  success: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300',
}

export function AlertBanner({
  message,
  variant = 'error',
  small = false,
  className,
}: {
  message: string
  variant?: AlertVariant
  small?: boolean
  className?: string
}) {
  if (!message) return null
  return (
    <div
      className={`rounded-lg ${small ? 'p-2.5 text-xs' : 'p-3 text-sm'} ${VARIANT_CLASSES[variant]} ${className ?? ''}`}
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {message}
    </div>
  )
}

/** Error variant kept under its original name (the most common case). */
export function ErrorBanner({ message, className }: { message: string; className?: string }) {
  return <AlertBanner message={message} className={className} />
}
