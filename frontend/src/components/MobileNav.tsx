import { NavLink } from 'react-router-dom'
import { Briefcase, Home, MapPin, PieChart, Search, Settings } from 'lucide-react'
import { useTranslation } from '@/i18n'

const items = [
  { to: '/', icon: Home, key: 'nav.home', end: true },
  { to: '/viagens', icon: Briefcase, key: 'nav.trips' },
  { to: '/pesquisa', icon: Search, key: 'nav.search' },
  { to: '/lugares', icon: MapPin, key: 'nav.places' },
  { to: '/estatisticas', icon: PieChart, key: 'nav.stats' },
]

export function MobileNav() {
  const { t } = useTranslation()

  return (
    <nav
      className="fixed inset-x-4 z-40 flex items-center justify-between rounded-pill bg-surface px-2 py-2 shadow-pop md:hidden dark:border dark:border-[#322A23] dark:bg-[#221D18]"
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
            `grid h-11 w-11 place-items-center rounded-full transition-colors ${
              isActive ? 'bg-brand text-white shadow-brand' : 'text-muted'
            }`
          }
        >
          <Icon size={20} />
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
