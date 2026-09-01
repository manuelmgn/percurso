import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { api } from '@/api'
import { Confetti } from '@/components/Confetti'
import type { MilestoneInfo } from '@/types'

function milestoneMessage(milestone: MilestoneInfo): string {
  // Só se celebra um marco: a conclusão de um projeto.
  return `Projeto "${milestone.project_name}" concluído! Parabéns!`
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
              className="card border-primary-300 px-4 py-3 text-sm font-medium text-neutral-900 dark:border-primary-700 dark:text-neutral-50"
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
  // A celebração desaparece sozinha ao fim de ~5s; o timeout extra garante a limpeza.
  setTimeout(cleanup, 6000)
  root.render(<Celebration milestones={milestones} />)
}

// Fire-and-forget: chama o backend e, se houver marcos novos, mostra confetti
// e um toast por marco. Erros são ignorados de propósito.
export async function checkAndCelebrate(): Promise<void> {
  try {
    const response = await api.milestones.check()
    if (response.new_milestones.length > 0) {
      celebrate(response.new_milestones)
    }
  } catch {
    // celebração é opcional — nunca interromper o fluxo do utilizador
  }
}
