import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/api'
import type { ProjectListItem } from '@/types'

const visibilityLabels: Record<ProjectListItem['visibility'], string> = {
  all: 'Todos',
  specific: 'Utilizadores específicos',
  private: 'Privado',
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        setProjects(await api.projects.list())
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar projetos')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label="A carregar">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        <span className="sr-only">A carregar...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold">Projetos</h2>
        <Link to="/projetos/novo" className="btn-primary">
          Novo projeto
        </Link>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {projects.length === 0 && !error ? (
        <div className="card flex flex-col items-center py-12 text-center">
          <svg className="h-12 w-12 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="mt-4 font-display text-lg font-semibold">Ainda não tens projetos</h3>
          <p className="mt-1 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
            Cria um projeto para juntares lugares e acompanhares o teu progresso.
          </p>
          <Link to="/projetos/novo" className="btn-primary mt-6">
            Criar o meu primeiro projeto
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/projetos/${project.id}`}
              className="card block transition-shadow hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-display font-semibold text-neutral-900 dark:text-neutral-50">
                  {project.name}
                </p>
                {project.is_completed && (
                  <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/20 dark:text-green-300">
                    Concluído
                  </span>
                )}
              </div>
              {project.description && (
                <p className="mt-1 line-clamp-2 text-sm text-neutral-500 dark:text-neutral-400">
                  {project.description}
                </p>
              )}
              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                  <div
                    className="h-full rounded-full bg-primary-600 transition-all"
                    style={{ width: `${project.progress_percent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  {project.visited_places} de {project.total_places} visitados · {Math.round(project.progress_percent)}% ·{' '}
                  {visibilityLabels[project.visibility]}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
