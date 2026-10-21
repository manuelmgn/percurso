import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/api'
import type { ProjectListItem } from '@/types'

type ProjectSort = 'recent' | 'alpha' | 'progress'

interface ProjectFilters {
  query: string
  sort: ProjectSort
}

const DEFAULT_FILTERS: ProjectFilters = { query: '', sort: 'recent' }

function storageKey(userId: number | undefined): string {
  return `projetos:filters:${userId ?? 'anon'}`
}

function loadFilters(userId: number | undefined): ProjectFilters {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return DEFAULT_FILTERS
    return { ...DEFAULT_FILTERS, ...(JSON.parse(raw) as Partial<ProjectFilters>) }
  } catch {
    return DEFAULT_FILTERS
  }
}

export function ProjectsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<ProjectFilters>(() => loadFilters(user?.id))

  useEffect(() => {
    localStorage.setItem(storageKey(user?.id), JSON.stringify(filters))
  }, [filters, user?.id])

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        setProjects(await api.projects.list())
      } catch (err: any) {
        setError(err.message || t('projects.loadError'))
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [t])

  const visibleProjects = useMemo(() => {
    const query = filters.query.trim().toLowerCase()
    const filtered = projects.filter((project) => {
      if (!query) return true
      return project.name.toLowerCase().includes(query) || (project.description ?? '').toLowerCase().includes(query)
    })
    return [...filtered].sort((a, b) => {
      switch (filters.sort) {
        case 'alpha':
          return a.name.localeCompare(b.name, 'pt')
        case 'progress':
          return b.progress_percent - a.progress_percent || a.name.localeCompare(b.name, 'pt')
        case 'recent':
        default:
          return b.updated_at.localeCompare(a.updated_at)
      }
    })
  }, [projects, filters])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label={t('loading')}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="sr-only">{t('loadingGeneric')}</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold">{t('projects.title')}</h2>
        <Link to="/projetos/novo" className="btn-primary">
          {t('projects.create')}
        </Link>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {projects.length === 0 && !error ? (
        <div className="card flex flex-col items-center py-12 text-center">
          <svg className="h-12 w-12 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="mt-4 font-display text-lg font-semibold">{t('projects.empty.title')}</h3>
          <p className="mt-1 max-w-sm text-sm text-muted">
            {t('projects.empty.description')}
          </p>
          <Link to="/projetos/novo" className="btn-primary mt-6">
            {t('projects.empty.cta')}
          </Link>
        </div>
      ) : (
        <>
          <div className="card grid gap-3 p-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="projects-search">
                {t('projects.searchLabel')}
              </label>
              <input
                id="projects-search"
                type="search"
                value={filters.query}
                onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value }))}
                placeholder={t('projects.searchPlaceholder')}
                className="input"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="projects-sort">
                {t('projects.sortLabel')}
              </label>
              <select
                id="projects-sort"
                value={filters.sort}
                onChange={(e) => setFilters((prev) => ({ ...prev, sort: e.target.value as ProjectSort }))}
                className="input"
              >
                <option value="recent">{t('places.sortRecent')}</option>
                <option value="alpha">{t('places.sortAlpha')}</option>
                <option value="progress">{t('projects.progress')}</option>
              </select>
            </div>
          </div>

          {visibleProjects.length === 0 ? (
            <div className="card py-8 text-center">
              <p className="text-sm text-muted">{t('projects.noResults')}</p>
              <button onClick={() => setFilters(DEFAULT_FILTERS)} className="btn-outline mt-4">
                {t('actions.clearFilters')}
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleProjects.map((project) => (
                <Link
                  key={project.id}
                  to={`/projetos/${project.id}`}
                  className="card block"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display font-semibold text-ink dark:text-[#FAF7F2]">
                      {project.name}
                    </p>
                    {project.is_completed && (
                      <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/20 dark:text-green-300">
                        {t('projects.completedBadge')}
                      </span>
                    )}
                  </div>
                  {project.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted">
                      {project.description}
                    </p>
                  )}
                  <div className="mt-4">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-line dark:bg-[#322A23]">
                      <div
                        className="h-full rounded-full bg-primary-600 transition-all"
                        style={{ width: `${project.progress_percent}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      {t('projects.progressText', { visited: project.visited_places, total: project.total_places })} · {Math.round(project.progress_percent)}% ·{' '}
                      {t(`visibility.option${project.visibility.charAt(0).toUpperCase() + project.visibility.slice(1)}`)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
