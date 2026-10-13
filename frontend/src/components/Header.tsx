import { Link, useLocation } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useAuth } from '@/context/AuthContext'

interface HeaderProps {
  title?: string
  subtitle?: string
}

export function Header({ title, subtitle }: HeaderProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const location = useLocation()
  const firstName = user?.username.split(' ')[0]
  const isHome = location.pathname === '/'

  return (
    <header className="flex flex-wrap items-center gap-4 px-2 pt-2 md:px-0">
      {(title || isHome) && (
        <div className="mr-auto">
          <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight md:text-[40px]">
            {title ?? t('dashboard.greeting', { name: firstName ?? '' })}
          </h1>
          {(subtitle || isHome) && (
            <p className="mt-1 text-base text-muted">{subtitle ?? t('dashboard.subtitle')}</p>
          )}
        </div>
      )}

      <Link to="/pesquisa" className="search-pill w-full sm:w-[212px]" aria-label={t('nav.search')}>
        <Search size={16} className="text-muted" />
        <span className="text-sm text-muted">{t('search.placeholder')}</span>
      </Link>

      <Link to="/viagens/novo" className="btn-primary">
        <Plus size={16} strokeWidth={2.5} />
        {t('trips.new')}
      </Link>
    </header>
  )
}
