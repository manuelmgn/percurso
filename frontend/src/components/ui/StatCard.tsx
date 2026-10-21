import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  icon: LucideIcon
  value: string
  label: string
  delta?: string
  tone?: 'primary' | 'coral' | 'plum' | 'amber'
}

const tones = {
  primary: 'bg-primary-tint text-primary dark:bg-primary/20',
  coral: 'bg-coral-tint text-coral dark:bg-coral/20',
  plum: 'bg-plum-tint text-plum dark:bg-plum/25',
  amber: 'bg-amber-tint text-amber-deep dark:bg-amber/15',
}

export function StatCard({ icon: Icon, value, label, delta, tone = 'primary' }: StatCardProps) {
  return (
    <div className="card flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between">
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${tones[tone]}`}>
          <Icon size={18} aria-hidden="true" />
        </span>
        {delta && (
          <span className="rounded-pill bg-primary-tint px-2.5 py-1 text-xs font-bold text-primary dark:bg-primary/20">
            {delta}
          </span>
        )}
      </div>
      <div>
        <p className="font-display text-[27px] font-bold leading-none">{value}</p>
        <p className="mt-1.5 text-xs text-muted">{label}</p>
      </div>
    </div>
  )
}
