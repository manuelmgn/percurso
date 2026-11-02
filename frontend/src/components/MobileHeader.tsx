import { Link } from 'react-router-dom'
import { useTranslation } from '@/i18n'

/**
 * Mobile-only top bar, always visible above the content: app logo + wordmark
 * as one centred group (the sidebar carries this role on desktop). Sticky so
 * it stays put while scrolling; safe-area inset keeps it clear of notches.
 */
export function MobileHeader() {
  const { t } = useTranslation()

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-center border-b border-line bg-surface/95 py-3 backdrop-blur md:hidden"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <Link to="/" className="flex items-center gap-2.5 rounded-2xl px-2 transition-opacity hover:opacity-85" aria-label={t('nav.home')}>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-tint dark:bg-primary/20">
          <img src="/images/percurso-icono.svg" alt="" className="h-6 w-6" />
        </span>
        <span className="font-display text-lg font-bold tracking-tight text-primary">{t('app.name')}</span>
      </Link>
    </header>
  )
}
