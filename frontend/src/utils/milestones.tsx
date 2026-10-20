import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { api } from '@/api'
import { t } from '@/i18n'
import { Confetti } from '@/components/Confetti'
import type { MilestoneInfo } from '@/types'

function milestoneMessage(milestone: MilestoneInfo): string {
  // Only one milestone is celebrated: project completion.
  return t('milestone.projectCompleted', { name: milestone.project_name ?? '' })
}

function Celebration({ milestones }: { milestones: MilestoneInfo[] }) {
  const [showConfetti, setShowConfetti] = useState(true)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 5000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      {showConfetti && <Confetti onDone={() => setShowConfetti(false)} />}
      {visible && (
        <div className="fixed bottom-4 right-4 z-[80] flex flex-col gap-2" role="status">
          {milestones.map((milestone) => (
            <div
              key={milestone.key}
              className="card border-primary-300 px-4 py-3 text-sm font-medium text-ink dark:border-primary-700 dark:text-[#FAF7F2]"
            >
              {milestoneMessage(milestone)}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function celebrate(milestones: MilestoneInfo[]) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const cleanup = () => {
    root.unmount()
    container.remove()
  }
  // The celebration hides itself after ~5s; the extra timeout ensures cleanup.
  setTimeout(cleanup, 6000)
  root.render(<Celebration milestones={milestones} />)
}

// Fire-and-forget: call the backend and, if there are new milestones, show confetti
// and a toast per milestone. Errors are ignored on purpose.
export async function checkAndCelebrate(): Promise<void> {
  try {
    const response = await api.milestones.check()
    if (response.new_milestones.length > 0) {
      celebrate(response.new_milestones)
    }
  } catch {
    // Celebration is optional — never interrupt the user flow.
  }
}
