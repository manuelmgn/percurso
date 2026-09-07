import { NavLink } from 'react-router-dom'
import { useTranslation } from '@/i18n'

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
          isActive ? 'text-primary-700 dark:text-primary-300' : 'text-neutral-500 dark:text-neutral-400'
        }`
      }
      aria-label={label}
    >
      {icon}
      <span>{label}</span>
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
  user: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  ),
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  )
}

export function MobileNav() {
  const { t } = useTranslation()

  return (
    <nav
      className="glass fixed bottom-0 left-0 right-0 z-50 flex justify-around rounded-none border-t border-neutral-200/50 px-2 py-2 lg:hidden dark:border-neutral-800/50"
      aria-label={t('mobileNav.label')}
    >
      <NavItem to="/" icon={<Icon>{icons.home}</Icon>} label={t('nav.home')} />
      <NavItem to="/viagens" icon={<Icon>{icons.globe}</Icon>} label={t('nav.trips')} />
      <NavItem to="/projetos" icon={<Icon>{icons.checkCircle}</Icon>} label={t('nav.projects')} />
      <NavItem to="/estatisticas" icon={<Icon>{icons.chartBar}</Icon>} label={t('nav.stats')} />
      <NavItem to="/perfil" icon={<Icon>{icons.user}</Icon>} label={t('nav.profile')} />
    </nav>
  )
}
