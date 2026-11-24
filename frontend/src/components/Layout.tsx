import { useTranslation } from '@/i18n'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { MobileHeader } from './MobileHeader'
import { AnimatedOutlet } from './PageTransition'
import { UnreadCountProvider } from '@/context/UnreadCountContext'

export function Layout() {
  const { t } = useTranslation()

  // Auth bootstrap is gated by ProtectedRoute, so the shell renders as soon
  // as the route matches — no second loading flash inside the layout.
  // The dashboard greeting lives inside DashboardPage so it transitions as
  // part of the page instead of snapping in/out above AnimatedOutlet.
  return (
    <UnreadCountProvider>
      <div className="flex min-h-screen">
        <a href="#main-content" className="skip-link">{t('skipToContent')}</a>

        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <MobileHeader />

          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 px-4 pb-32 pt-6 focus:outline-none focus-visible:ring-0 md:px-8 md:pt-8 lg:pb-10"
          >
            <div className="mx-auto max-w-[1120px]">
              <AnimatedOutlet />
            </div>
          </main>

          <MobileNav />
        </div>
      </div>
    </UnreadCountProvider>
  )
}
