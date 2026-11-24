import { formatPlaceType, placeTypeTitle } from '@/utils/format'

interface PlaceTypeLabelProps {
  type: string
  className?: string
}

/**
 * Renders a place type's display label, attaching the full canonical name as a
 * hover tooltip (`title`) when the label is shortened (e.g. `concelho` →
 * `concelho/município`).
 */
export function PlaceTypeLabel({ type, className }: PlaceTypeLabelProps) {
  const label = formatPlaceType(type)
  const title = placeTypeTitle(type)
  if (!title && !className) return <>{label}</>
  return (
    <span title={title} className={className}>
      {label}
    </span>
  )
}
