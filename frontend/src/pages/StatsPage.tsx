import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { api } from '@/api'
import type { StatsResponse } from '@/types'

export function StatsPage() {
  const { t } = useTranslation()
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        setStats(await api.stats.get())
      } catch (err: any) {
        setError(err.message || t('stats.loadError'))
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [t])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label={t('loading')}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        <span className="sr-only">{t('loadingGeneric')}</span>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="space-y-6">
        <h2 className="font-display text-2xl font-bold">{t('stats.title')}</h2>
        <div className="card">
          <p className="text-red-700 dark:text-red-300">{error || t('stats.loadError')}</p>
        </div>
      </div>
    )
  }

  const maxRegionCount = Math.max(1, ...stats.region_stats.map((r) => r.count))

  const counters = [
    { label: t('stats.trips'), value: stats.summary.trip_count },
    { label: t('stats.places'), value: stats.summary.place_count },
    { label: t('stats.activeProjects'), value: stats.summary.active_projects },
    { label: t('stats.completedProjects'), value: stats.summary.completed_projects },
  ]

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold">{t('stats.title')}</h2>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {counters.map((counter) => (
          <div key={counter.label} className="card p-4">
            <p className="font-display text-3xl font-bold text-primary-700 dark:text-primary-300">
              {counter.value}
            </p>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{counter.label}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 className="mb-4 font-display text-lg font-semibold">{t('stats.projectProgress')}</h3>
        {stats.project_stats.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('stats.noProjects')}</p>
        ) : (
          <ul className="space-y-4">
            {stats.project_stats.map((project) => (
              <li key={project.project_id}>
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    to={`/projetos/${project.project_id}`}
                    className="font-medium text-primary-700 hover:underline dark:text-primary-300"
                  >
                    {project.project_name}
                  </Link>
                  <span className="text-sm text-neutral-500 dark:text-neutral-400">
                    {project.total_places > 0
                      ? `${t('projects.progressText', { visited: project.visited_places, total: project.total_places })} · ${Math.round(project.progress_percent)}%`
                      : t('stats.projectNoPlaces')}
                  </span>
                </div>
                {project.total_places > 0 && (
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                    <div
                      className="h-full rounded-full bg-primary-600 transition-all"
                      style={{ width: `${project.progress_percent}%` }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3 className="mb-4 font-display text-lg font-semibold">{t('stats.byRegion')}</h3>
        {stats.region_stats.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('stats.noPlacesVisited')}</p>
        ) : (
          <ul className="space-y-3">
            {stats.region_stats.map((region) => (
              <li key={region.region}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {region.region}
                  </span>
                  <span className="text-sm text-neutral-500 dark:text-neutral-400">{region.count}</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                  <div
                    className="h-full rounded-full bg-secondary-500 transition-all"
                    style={{ width: `${(region.count / maxRegionCount) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3 className="mb-4 font-display text-lg font-semibold">{t('stats.mostVisited')}</h3>
        {stats.most_visited.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('stats.noPlacesVisited')}</p>
        ) : (
          <ol className="space-y-2">
            {stats.most_visited.map((place, index) => (
              <li key={place.place_id} className="flex items-baseline gap-3">
                <span className="w-6 shrink-0 text-sm font-semibold text-neutral-400 dark:text-neutral-500">
                  {index + 1}.
                </span>
                <div className="flex flex-1 flex-wrap items-baseline justify-between gap-2">
                  <p>
                    <Link
                      to={`/lugares/${place.place_id}`}
                      className="font-medium text-primary-700 hover:underline dark:text-primary-300"
                    >
                      {place.place_name}
                    </Link>
                    <span className="text-sm text-neutral-500 dark:text-neutral-400"> [{place.place_type}]</span>
                  </p>
                  <span className="text-sm text-neutral-500 dark:text-neutral-400">
                    {place.visit_count} {t(place.visit_count === 1 ? 'units.visit.one' : 'units.visit.other')}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
