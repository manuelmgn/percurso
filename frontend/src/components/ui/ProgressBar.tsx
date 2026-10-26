/**
 * Horizontal progress bar shared by the project cards, the project detail
 * page and the stats table (there used to be four near-identical copies,
 * only one of them accessible). Render nothing when there is no progress.
 */
export function ProgressBar({
  percent,
  label,
  heightClass = 'h-2.5',
  roundedClass = 'rounded-pill',
  fillClass = 'bg-brand',
}: {
  /** 0–100 (the backend's progress_percent). */
  percent: number
  /** Accessible label; omit only when the number is announced nearby. */
  label?: string
  heightClass?: string
  roundedClass?: string
  /** Colour of the fill (progress tokens vary per context). */
  fillClass?: string
}) {
  const clamped = Math.min(100, Math.max(0, percent))
  return (
    <div
      className={`${heightClass} w-full overflow-hidden ${roundedClass} bg-line`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full ${roundedClass} ${fillClass} transition-[width] duration-500`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
