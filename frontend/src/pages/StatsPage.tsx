import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Briefcase, FolderOpen, Globe, MapPin } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTranslation } from '@/i18n'
import { api } from '@/api'
import { useTheme } from '@/components/ThemeProvider'
import { StatCard } from '@/components/ui/StatCard'
import type { ActivityItem, StatsResponse, TripListItem } from '@/types'

const PIE_COLORS = ['#C1075D', '#E06F56', '#FFD64E', '#6B21A8', '#8A8177']

const monthFormatter = new Intl.DateTimeFormat('pt-PT', { month: 'short' })

export function StatsPage() {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const tickFill = isDark ? '#A09A92' : '#8A8177'
  const gridStroke = isDark ? '#322A23' : '#F0E9DE'

  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [trips, setTrips] = useState<TripListItem[] | null>(null)
  const [activities, setActivities] = useState<ActivityItem[] | null>(null)
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

  // Extra (already existing) endpoints to feed the charts — failures only
  // leave that chart empty, never the whole page.
  useEffect(() => {
    api.trips.list().then(setTrips).catch(() => setTrips([]))
    api.activities.list().then(setActivities).catch(() => setActivities([]))
  }, [])

  // Trips grouped by start year, ascending.
  const tripsPerYear = useMemo(() => {
    if (!trips) return []
    const counts = new Map<string, number>()
    for (const trip of trips) {
      const year = trip.start_date.slice(0, 4)
      counts.set(year, (counts.get(year) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, count]) => ({ year, count }))
  }, [trips])

  // Visited places grouped by administrative place type.
  const placesByType = useMemo(() => {
    if (!stats) return []
    const counts = new Map<string, number>()
    for (const place of stats.most_visited) {
      counts.set(place.place_type, (counts.get(place.place_type) ?? 0) + place.visit_count)
    }
    return [...counts.entries()].map(([type, count]) => ({ type, count }))
  }, [stats])

  // Activities grouped by month of creation, chronological.
  const activitiesPerMonth = useMemo(() => {
    if (!activities) return []
    const counts = new Map<string, number>()
    for (const activity of activities) {
      const key = activity.created_at.slice(0, 7) // "YYYY-MM"
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const years = new Set([...counts.keys()].map((key) => key.slice(0, 4)))
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => {
        const [year, month] = key.split('-')
        const label = `${monthFormatter.format(new Date(Number(year), Number(month) - 1))}${years.size > 1 ? ` ${year}` : ''}`
        return { label, count }
      })
  }, [activities])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label={t('loading')}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="sr-only">{t('loadingGeneric')}</span>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-[28px] font-bold tracking-tight md:text-[40px]">{t('stats.title')}</h1>
        <div className="card">
          <p className="text-red-700 dark:text-red-300">{error || t('stats.loadError')}</p>
        </div>
      </div>
    )
  }

  const maxRegionCount = Math.max(1, ...stats.region_stats.map((r) => r.count))
  const tooltipStyle = {
    backgroundColor: isDark ? '#221D18' : '#FFFFFF',
    border: `1px solid ${gridStroke}`,
    borderRadius: 12,
    fontSize: 12,
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-[28px] font-bold tracking-tight md:text-[40px]">{t('stats.title')}</h1>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard icon={Briefcase} value={String(stats.summary.trip_count)} label={t('stats.trips')} tone="primary" />
        <StatCard icon={MapPin} value={String(stats.summary.place_count)} label={t('stats.places')} tone="coral" />
        <StatCard
          icon={FolderOpen}
          value={String(stats.summary.completed_projects)}
          label={t('stats.completedProjects')}
          tone="plum"
        />
        <StatCard icon={Globe} value={String(stats.region_stats.length)} label={t('stats.regions')} tone="amber" />
      </div>

      {/* Charts row: trips per year + places by type */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="card lg:col-span-7">
          <h2 className="font-display text-lg font-bold">{t('stats.tripsByYear')}</h2>
          {tripsPerYear.length === 0 ? (
            <p className="mt-4 text-sm text-muted">{t('stats.chartNoData')}</p>
          ) : (
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={tripsPerYear} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%" stopColor="#C1075D" />
                      <stop offset="100%" stopColor="#E06F56" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                  <XAxis dataKey="year" tick={{ fill: tickFill, fontSize: 11 }} tickLine={false} axisLine={{ stroke: gridStroke }} />
                  <YAxis allowDecimals={false} tick={{ fill: tickFill, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: gridStroke, fillOpacity: 0.3 }} />
                  <Bar dataKey="count" fill="url(#barGrad)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="card lg:col-span-5">
          <h2 className="font-display text-lg font-bold">{t('stats.placesByType')}</h2>
          {placesByType.length === 0 ? (
            <p className="mt-4 text-sm text-muted">{t('stats.chartNoData')}</p>
          ) : (
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={placesByType}
                    dataKey="count"
                    nameKey="type"
                    innerRadius="68%"
                    paddingAngle={2}
                    stroke="#FFFFFF"
                    strokeWidth={2}
                  >
                    {placesByType.map((entry) => (
                      <Cell key={entry.type} fill={PIE_COLORS[placesByType.indexOf(entry) % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    iconSize={10}
                    wrapperStyle={{ color: tickFill, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Activity by month — full width */}
      <section className="card">
        <h2 className="font-display text-lg font-bold">{t('stats.activityByMonth')}</h2>
        {activitiesPerMonth.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t('stats.chartNoData')}</p>
        ) : (
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={activitiesPerMonth} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C1075D" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#C1075D" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                <XAxis dataKey="label" tick={{ fill: tickFill, fontSize: 11 }} tickLine={false} axisLine={{ stroke: gridStroke }} />
                <YAxis allowDecimals={false} tick={{ fill: tickFill, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#C1075D"
                  strokeWidth={3}
                  fill="url(#areaGrad)"
                  dot={{ r: 3, fill: '#FFFFFF', stroke: '#C1075D', strokeWidth: 2 }}
                  activeDot={{ r: 4, fill: '#FFFFFF', stroke: '#C1075D', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Project progress */}
      <section className="card">
        <h2 className="mb-4 font-display text-lg font-bold">{t('stats.projectProgress')}</h2>
        {stats.project_stats.length === 0 ? (
          <p className="text-sm text-muted">{t('stats.noProjects')}</p>
        ) : (
          <ul className="space-y-4">
            {stats.project_stats.map((project) => (
              <li key={project.project_id}>
                <div className="flex items-baseline justify-between gap-3">
                  <Link to={`/projetos/${project.project_id}`} className="font-medium text-primary hover:underline">
                    {project.project_name}
                  </Link>
                  <span className="text-sm text-muted">
                    {project.total_places > 0
                      ? `${t('projects.progressText', { visited: project.visited_places, total: project.total_places })} · ${Math.round(project.progress_percent)}%`
                      : t('stats.projectNoPlaces')}
                  </span>
                </div>
                {project.total_places > 0 && (
                  <div
                    className="mt-2 h-2.5 w-full overflow-hidden rounded-pill bg-[#F0E8DC] dark:bg-[#322A23]"
                    role="progressbar"
                    aria-valuenow={Math.round(project.progress_percent)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-pill bg-brand transition-[width] duration-500"
                      style={{ width: `${project.progress_percent}%` }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Regions */}
      <section className="card">
        <h2 className="mb-4 font-display text-lg font-bold">{t('stats.byRegion')}</h2>
        {stats.region_stats.length === 0 ? (
          <p className="text-sm text-muted">{t('stats.noPlacesVisited')}</p>
        ) : (
          <ul className="space-y-3">
            {stats.region_stats.map((region) => (
              <li key={region.region}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{region.region}</span>
                  <span className="text-sm text-muted">{region.count}</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-pill bg-[#F0E8DC] dark:bg-[#322A23]">
                  <div
                    className="h-full rounded-pill bg-coral transition-all"
                    style={{ width: `${(region.count / maxRegionCount) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Most visited places */}
      <section className="card">
        <h2 className="mb-4 font-display text-lg font-bold">{t('stats.mostVisited')}</h2>
        {stats.most_visited.length === 0 ? (
          <p className="text-sm text-muted">{t('stats.noPlacesVisited')}</p>
        ) : (
          <ol className="space-y-2">
            {stats.most_visited.map((place, index) => (
              <li key={place.place_id} className="flex items-baseline gap-3">
                <span className="w-6 shrink-0 text-sm font-semibold text-muted">{index + 1}.</span>
                <div className="flex flex-1 flex-wrap items-baseline justify-between gap-2">
                  <p>
                    <Link to={`/lugares/${place.place_id}`} className="font-medium text-primary hover:underline">
                      {place.place_name}
                    </Link>
                    <span className="text-sm text-muted"> [{place.place_type}]</span>
                  </p>
                  <span className="text-sm text-muted">
                    {place.visit_count} {t(place.visit_count === 1 ? 'units.visit.one' : 'units.visit.other')}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
