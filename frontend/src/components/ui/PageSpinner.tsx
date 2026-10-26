import { t } from '@/i18n'

/**
 * The full-page loading block used while a screen's primary data is on its
 * way. One shared component replaces the 13 hand-copied spinner triples;
 * the small inline spinners (buttons, rows) stay local.
 */
export function PageSpinner() {
  return (
    <div className="flex items-center justify-center py-12" role="status" aria-label={t('loading')}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span className="sr-only">{t('loadingGeneric')}</span>
    </div>
  )
}
