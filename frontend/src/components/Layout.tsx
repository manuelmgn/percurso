import { useTranslation } from '@/i18n'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { Header } from './Header'
import { AnimatedOutlet } from './PageTransition'
import { useAuth } from '@/context/AuthContext'
import { UnreadCountProvider } from '@/context/UnreadCountContext'
import { PageSpinner } from '@/components/ui/PageSpinner'

export function Layout() {
  const { isLoading } = useAuth()
  const { t } = useTranslation()

  // Layout-level loading (silent auth bootstrap) — full viewport centring.
  if (isLoading) {
    return <div className="min-h-screen pt-40"><PageSpinner /></div>
  }

  return (
    <UnreadCountProvider>
      <div className="flex min-h-screen">
        <a href="#main-content" className="skip-link">{t('skipToContent')}</a>

        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <main id="main-content" className="flex-1 px-4 pb-28 pt-6 md:px-8 md:pt-8 lg:pb-10">
            <div className="mx-auto flex max-w-[1120px] flex-col gap-10">
              <Header />
              <AnimatedOutlet />
            </div>
          </main>

          <MobileNav />
        </div>
      </div>
    </UnreadCountProvider>
  )
}
