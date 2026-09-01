import { useEffect, useRef } from 'react'

const COLORS = ['#c1075d', '#e06f56', '#ffd64e', '#6b21a8', '#3b82f6', '#22c55e']
const PARTICLE_COUNT = 150
const DURATION_MS = 3000

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  rotation: number
  rotationSpeed: number
}

// Lightweight canvas confetti burst: fires ~150 particles with gravity for a
// few seconds, then calls onDone so the parent can unmount it.
export function Confetti({ onDone }: { onDone?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.6,
      y: canvas.height * 0.3,
      vx: (Math.random() - 0.5) * 12,
      vy: -Math.random() * 12 - 4,
      size: Math.random() * 8 + 4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
    }))

    const start = performance.now()
    let frame: number

    const tick = (now: number) => {
      const elapsed = now - start
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const fade = Math.max(0, 1 - elapsed / DURATION_MS)

      for (const p of particles) {
        p.vy += 0.25 // gravidade
        p.x += p.vx
        p.y += p.vy
        p.rotation += p.rotationSpeed

        ctx.save()
        ctx.globalAlpha = fade
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        ctx.restore()
      }

      if (elapsed < DURATION_MS) {
        frame = requestAnimationFrame(tick)
      } else {
        onDoneRef.current?.()
      }
    }
    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[70]"
      aria-hidden="true"
    />
  )
}
