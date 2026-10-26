import { NavLink } from 'react-router-dom'
import { Bell, Briefcase, Compass, Home, Search, Settings } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useUnreadCount } from '@/context/UnreadCountContext'

const items = [
  { to: '/', icon: Home, key: 'nav.home', end: true },
  { to: '/viagens', icon: Compass, key: 'nav.trips' },
  { to: '/projetos', icon: Briefcase, key: 'nav.projects' },
  { to: '/pesquisa', icon: Search, key: 'nav.search' },
  { to: '/notificacoes', icon: Bell, key: 'nav.notifications' },
]

export function MobileNav() {
  const { t } = useTranslation()
  const { unreadCount } = useUnreadCount()

  return (
    <nav
      className="fixed inset-x-4 z-40 flex items-center justify-between rounded-pill bg-surface px-2 py-2 shadow-pop md:hidden dark:border dark:border-line"
      style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      aria-label={t('nav.main')}
    >
      {items.map(({ to, icon: Icon, key, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          aria-label={t(key)}
          title={t(key)}
          className={({ isActive }) =>
            `relative grid h-11 w-11 place-items-center rounded-full transition-colors ${
              isActive ? 'bg-brand text-white shadow-brand' : 'text-muted'
            }`
          }
        >
          <Icon size={20} />
          {to === '/notificacoes' && unreadCount > 0 && (
            <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </NavLink>
      ))}
      <NavLink
        to="/definicoes"
        aria-label={t('nav.settings')}
        title={t('nav.settings')}
        className={({ isActive }) =>
          `grid h-11 w-11 place-items-center rounded-full transition-colors ${
            isActive ? 'bg-brand text-white shadow-brand' : 'text-muted'
          }`
        }
      >
        <Settings size={20} />
      </NavLink>
    </nav>
  )
}
