import { Outlet } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { Header } from './Header'
import { useAuth } from '@/context/AuthContext'

export function Layout() {
  const { isLoading } = useAuth()
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-label={t('loading')}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        <span className="sr-only">{t('loadingGeneric')}</span>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <a href="#main-content" className="skip-link">{t('skipToContent')}</a>

      <Sidebar />

      <div className="flex flex-1 flex-col">
        <Header />

        <main id="main-content" className="flex-1 p-4 pb-24 md:p-6 md:pb-24 lg:p-8 lg:pb-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>

        <MobileNav />
      </div>
    </div>
  )
}
