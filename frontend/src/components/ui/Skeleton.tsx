import { t } from '@/i18n'

/**
 * Loading placeholders shaped like the real pages, so first paint already has
 * the final layout and data arrival is a fill-in, not a jump. Full-page
 * variants announce themselves as status; inline ones are aria-hidden and
 * should sit next to a visible status element.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-line/60 ${className}`} />
}

function LoadingStatus() {
  return <span className="sr-only">{t('loadingGeneric')}</span>
}

/** Listings (viagens, projetos, lugares): header, filters, chips, card grid. */
export function ListPageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label={t('loading')}>
      <LoadingStatus />
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-28 rounded-pill" />
      </div>
      <Skeleton className="h-24 rounded-card" />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-20 rounded-pill" />
        <Skeleton className="h-8 w-24 rounded-pill" />
        <Skeleton className="h-8 w-28 rounded-pill" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-64 rounded-card" />
        <Skeleton className="hidden h-64 rounded-card sm:block" />
        <Skeleton className="hidden h-64 rounded-card xl:block" />
      </div>
    </div>
  )
}

/** Detail pages: back link, title, meta, actions, map/hero, content card. */
export function DetailPageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label={t('loading')}>
      <LoadingStatus />
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-9 w-2/3 max-w-md" />
      <Skeleton className="h-4 w-48" />
      <div className="flex gap-3">
        <Skeleton className="h-10 w-28 rounded-pill" />
        <Skeleton className="h-10 w-28 rounded-pill" />
      </div>
      <Skeleton className="h-64 rounded-card" />
      <Skeleton className="h-40 rounded-card" />
    </div>
  )
}

/** Create/edit forms: title + form card with input-shaped blocks. */
export function FormPageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label={t('loading')}>
      <LoadingStatus />
      <Skeleton className="h-8 w-52 max-w-full" />
      <div className="card space-y-4">
        <Skeleton className="h-10 w-full rounded-pill" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-10 w-full rounded-pill" />
          <Skeleton className="h-10 w-full rounded-pill" />
        </div>
        <Skeleton className="h-28 w-full" />
        <div className="flex gap-3 pt-2">
          <Skeleton className="h-10 w-28 rounded-pill" />
          <Skeleton className="h-10 w-28 rounded-pill" />
        </div>
      </div>
    </div>
  )
}

/** Dashboard: summary line, hero map + stats panel, card sections. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label={t('loading')}>
      <LoadingStatus />
      <Skeleton className="h-4 w-72 max-w-full" />
      <section className="grid gap-6 lg:grid-cols-12">
        <Skeleton className="h-[300px] rounded-card md:h-[390px] lg:col-span-8" />
        <Skeleton className="h-[300px] rounded-card lg:col-span-4" />
      </section>
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="hidden h-4 w-20 sm:block" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-64 rounded-card" />
        <Skeleton className="hidden h-64 rounded-card sm:block" />
        <Skeleton className="hidden h-64 rounded-card xl:block" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-56 rounded-card" />
        <Skeleton className="h-56 rounded-card" />
      </div>
    </div>
  )
}

/** Stats: title, KPI row, chart cards. */
export function StatsPageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label={t('loading')}>
      <LoadingStatus />
      <Skeleton className="h-9 w-44" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="hidden h-24 rounded-card md:block" />
        <Skeleton className="hidden h-24 rounded-card md:block" />
        <Skeleton className="hidden h-24 rounded-card lg:block" />
        <Skeleton className="hidden h-24 rounded-card lg:block" />
      </div>
      <div className="grid gap-6 lg:grid-cols-12">
        <Skeleton className="h-80 rounded-card lg:col-span-7" />
        <Skeleton className="h-80 rounded-card lg:col-span-5" />
      </div>
      <Skeleton className="h-72 rounded-card" />
    </div>
  )
}

/** Row-shaped blocks for inline list loading (notifications feed). */
export function RowListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 rounded-card" />
      ))}
    </div>
  )
}
