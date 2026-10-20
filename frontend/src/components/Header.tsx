import { useLocation } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { useAuth } from '@/context/AuthContext'

/** Contextual greeting shown at the top of the dashboard (home only). */
export function Header() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const location = useLocation()
  const firstName = user?.username.split(' ')[0]

  if (location.pathname !== '/') return null

  return (
    <header className="px-2 pt-2 md:px-0">
      <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight md:text-[40px]">
        {t('dashboard.greeting', { name: firstName ?? '' })}
      </h1>
      <p className="mt-1 text-base text-muted dark:text-[#A09A92]">{t('dashboard.subtitle')}</p>
    </header>
  )
}
