import { NavLink } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { useAuth } from '@/context/AuthContext'

function NavIconItem({
  to,
  icon,
  label,
}: {
  to: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-150 ${
          isActive
            ? 'bg-primary-100 text-primary-800 shadow-sm dark:bg-primary-900/40 dark:text-primary-200'
            : 'text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-200'
        }`
      }
      aria-label={label}
      title={label}
    >
      {icon}
    </NavLink>
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
  chartBar: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  ),
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  )
}

export function MobileNav() {
  const { t } = useTranslation()
  const { user } = useAuth()

  return (
    <nav
      className="glass fixed bottom-0 left-0 right-0 z-50 rounded-none border-t border-neutral-200/50 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-lg lg:hidden dark:border-neutral-800/50"
      aria-label={t('mobileNav.label')}
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 items-center justify-items-center">
        <NavIconItem to="/" icon={<Icon>{icons.home}</Icon>} label={t('nav.home')} />
        <NavIconItem to="/viagens" icon={<Icon>{icons.globe}</Icon>} label={t('nav.trips')} />
        <NavIconItem to="/projetos" icon={<Icon>{icons.checkCircle}</Icon>} label={t('nav.projects')} />
        <NavIconItem to="/estatisticas" icon={<Icon>{icons.chartBar}</Icon>} label={t('nav.stats')} />

        <NavLink
          to="/definicoes"
          className={({ isActive }) =>
            `flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-150 ${
              isActive
                ? 'bg-primary-100 shadow-sm ring-2 ring-primary-600 ring-offset-2 ring-offset-white dark:bg-primary-900/40 dark:ring-primary-400 dark:ring-offset-neutral-900'
                : 'hover:bg-neutral-100/60 dark:hover:bg-neutral-800/60'
            }`
          }
          aria-label={t('nav.settings')}
          title={t('nav.settings')}
        >
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt=""
              className="h-7 w-7 rounded-full object-cover shadow-inner"
            />
          ) : (
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-700 text-xs font-semibold text-white shadow-inner"
              aria-hidden="true"
            >
              {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
            </div>
          )}
        </NavLink>
      </div>
    </nav>
  )
}
