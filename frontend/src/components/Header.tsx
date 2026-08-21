import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export function Header() {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      navigate(`/pesquisa?q=${encodeURIComponent(query.trim())}`)
    }
  }

  return (
    <header className="glass sticky top-0 z-30 rounded-none border-b border-neutral-200/50 px-4 py-3 dark:border-neutral-800/50">
      <div className="mx-auto flex max-w-7xl items-center gap-4">
        <h1 className="font-display text-xl font-bold text-primary-700 lg:hidden dark:text-primary-300">
          <Link to="/">Percursos</Link>
        </h1>

        <form onSubmit={handleSearch} className="flex-1" role="search" aria-label="Pesquisa global">
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              placeholder="Pesquisar viagens, lugares, projetos..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input pl-10"
              aria-label="Pesquisar"
            />
          </div>
        </form>

        <div className="flex items-center gap-2">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-700 text-sm font-semibold text-white" aria-hidden="true">
              {user?.username.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
