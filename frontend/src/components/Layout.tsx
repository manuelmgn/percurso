import { useTranslation } from '@/i18n'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { MobileHeader } from './MobileHeader'
import { Header } from './Header'
import { AnimatedOutlet } from './PageTransition'
import { UnreadCountProvider } from '@/context/UnreadCountContext'

export function Layout() {
  const { t } = useTranslation()

  // Auth bootstrap is gated by ProtectedRoute, so the shell renders as soon
  // as the route matches — no second loading flash inside the layout.
  return (
    <UnreadCountProvider>
      <div className="flex min-h-screen">
        <a href="#main-content" className="skip-link">{t('skipToContent')}</a>

        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <MobileHeader />

          <main id="main-content" className="flex-1 px-4 pb-32 pt-6 md:px-8 md:pt-8 lg:pb-10">
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
