import { Link, NavLink } from 'react-router-dom'
import {
  Briefcase,
  FolderOpen,
  Home,
  LogOut,
  MapPin,
  PieChart,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useAuth } from '@/context/AuthContext'

const items = [
  { to: '/', icon: Home, key: 'nav.home', end: true },
  { to: '/viagens', icon: Briefcase, key: 'nav.trips' },
  { to: '/projetos', icon: FolderOpen, key: 'nav.projects' },
  { to: '/lugares', icon: MapPin, key: 'nav.places' },
  { to: '/estatisticas', icon: PieChart, key: 'nav.stats' },
  { to: '/pesquisa', icon: Search, key: 'nav.search' },
]

export function Sidebar() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()

  return (
    <aside className="sticky top-6 m-6 hidden h-[calc(100vh-3rem)] w-[232px] shrink-0 flex-col rounded-card bg-surface p-4 shadow-card md:flex dark:border dark:border-[#322A23] dark:bg-[#221D18]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-2 pt-2">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-tint dark:bg-primary/20">
          <img src="/images/percurso-icono.svg" alt="" className="h-7 w-7" />
        </div>
        <span className="font-brand text-xl font-bold tracking-tight text-primary">{t('app.name')}</span>
      </div>

      {/* Navigation */}
      <nav className="mt-8 flex flex-1 flex-col gap-1 overflow-y-auto" aria-label={t('nav.main')}>
        {items.map(({ to, icon: Icon, key, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `nav-item ${isActive ? 'bg-[#FBE9F0] font-semibold text-primary dark:bg-primary/20' : ''}`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={18} strokeWidth={isActive ? 2.4 : 2} />
                {t(key)}
              </>
            )}
          </NavLink>
        ))}
        {user?.role === 'admin' && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `nav-item ${isActive ? 'bg-[#FBE9F0] font-semibold text-primary dark:bg-primary/20' : ''}`
            }
          >
            {({ isActive }) => (
              <>
                <ShieldCheck size={18} strokeWidth={isActive ? 2.4 : 2} />
                {t('nav.admin')}
              </>
            )}
          </NavLink>
        )}
      </nav>

      {/* User */}
      <div className="mt-auto flex items-center gap-1 rounded-2xl bg-bg p-2 dark:bg-[#191512]">
        <Link to="/definicoes" className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 transition-opacity hover:opacity-80">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <div
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand font-display text-[13px] font-bold text-white"
              aria-hidden="true"
            >
              {user?.username.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user?.username}</p>
            <p className="text-xs text-muted">{t('nav.profile')}</p>
          </div>
        </Link>
        <button
          onClick={logout}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-line/50 hover:text-ink dark:hover:bg-[#322A23] dark:hover:text-[#FAF7F2]"
          aria-label={t('sidebar.logoutAria')}
          title={t('nav.logout')}
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  )
}
