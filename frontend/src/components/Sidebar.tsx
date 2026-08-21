import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  )
}

const icons = {
  home: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  ),
  globe: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  ),
  checkCircle: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  ),
  mapPin: (
    <>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </>
  ),
  chartBar: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  ),
  cog: (
    <>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </>
  ),
  user: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  ),
  logout: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  ),
}

function NavItem({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-200'
            : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
        }`
      }
    >
      <Icon>{icon}</Icon>
      {children}
    </NavLink>
  )
}

export function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside className="glass hidden w-64 shrink-0 rounded-none border-r border-neutral-200/50 lg:block dark:border-neutral-800/50" aria-label="Navegação principal">
      <div className="flex h-full flex-col p-6">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold tracking-tight text-primary-700 dark:text-primary-300">
            <Link to="/">Percursos</Link>
          </h1>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Os teus lugares e viagens</p>
        </div>

        <nav className="flex-1 space-y-1" aria-label="Menu principal">
          <NavItem to="/" icon={icons.home}>Início</NavItem>
          <NavItem to="/viagens" icon={icons.globe}>Viagens</NavItem>
          <NavItem to="/projetos" icon={icons.checkCircle}>Projetos</NavItem>
          <NavItem to="/lugares" icon={icons.mapPin}>Lugares</NavItem>
          <NavItem to="/estatisticas" icon={icons.chartBar}>Estatísticas</NavItem>
          {user?.role === 'admin' && <NavItem to="/admin" icon={icons.cog}>Administração</NavItem>}
        </nav>

        <div className="border-t border-neutral-200/50 pt-4 dark:border-neutral-800/50">
          <NavItem to="/perfil" icon={icons.user}>Perfil</NavItem>
          <button
            onClick={logout}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-neutral-300 dark:hover:bg-neutral-800"
            aria-label="Terminar sessão"
          >
            <Icon>{icons.logout}</Icon>
            Sair
          </button>
        </div>
      </div>
    </aside>
  )
}
