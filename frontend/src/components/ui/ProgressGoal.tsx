import { useTranslation } from '@/i18n'

interface ProgressGoalProps {
  current: number
  total: number
  year?: number
}

export function ProgressGoal({ current, total, year }: ProgressGoalProps) {
  const { t } = useTranslation()
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0
  const goalYear = year ?? new Date().getFullYear()
  const remaining = Math.max(0, total - current)

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-muted">{t('goal.label', { year: goalYear })}</span>
        <span className="text-[13px] font-bold">{current} / {total}</span>
      </div>
      <div
        className="mt-2 h-2.5 overflow-hidden rounded-pill bg-[#F0E8DC] dark:bg-[#322A23]"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div className="h-full rounded-pill bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">{t('goal.remaining', { count: remaining })}</p>
    </div>
  )
}
