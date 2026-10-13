import { useTranslation } from '@/i18n'
import type { TripStatus } from '@/utils/tripStatus'

const styles: Record<TripStatus, string> = {
  concluida: 'bg-plum-tint text-plum dark:bg-plum/25',
  em_curso: 'bg-[#FBE9F0] text-primary dark:bg-primary/20',
  planeada: 'bg-amber-tint text-amber-deep dark:bg-amber/15',
}

const labelKeys: Record<TripStatus, string> = {
  concluida: 'trip.status.concluida',
  em_curso: 'trip.status.em_curso',
  planeada: 'trip.status.planeada',
}

export function StatusChip({ status, className = '' }: { status: TripStatus; className?: string }) {
  const { t } = useTranslation()
  return <span className={`status-chip ${styles[status]} ${className}`}>{t(labelKeys[status])}</span>
}
