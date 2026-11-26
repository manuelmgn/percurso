import { Home, Repeat } from 'lucide-react'
import { useTranslation } from '@/i18n'
import type { PlaceRelation } from '@/types'
import { formatPlaceRelationYears } from '@/utils/format'

interface PlaceRelationBadgeProps {
  relation: PlaceRelation
  size?: 'sm' | 'md'
}

export function PlaceRelationBadge({ relation, size = 'sm' }: PlaceRelationBadgeProps) {
  const { t } = useTranslation()
  const isResidence = relation.kind === 'residence'
  const Icon = isResidence ? Home : Repeat
  const label = t(isResidence ? 'places.relation.residence' : 'places.relation.frequent')
  const years = formatPlaceRelationYears(relation.year_from, relation.year_to)

  const toneClass = isResidence
    ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-200'
    : 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200'
  const sizeClass = size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-1 text-xs'

  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${toneClass} ${sizeClass}`}>
      <Icon size={size === 'md' ? 14 : 12} aria-hidden="true" />
      <span>{years ? `${label} · ${years}` : label}</span>
    </span>
  )
}
