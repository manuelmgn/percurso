import { useRef, useState } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { useLocation, useNavigationType, useOutlet } from 'react-router-dom'
import { getRouteDepth } from '@/routes'

type TransitionDirection = 'forward' | 'backward' | 'lateral'

const ENTER_EASE = [0.22, 1, 0.36, 1] as const
const EXIT_EASE = [0.4, 0, 1, 1] as const

const pageVariants: Variants = {
  initial: (direction: TransitionDirection) => {
    if (direction === 'forward') return { opacity: 0, x: 14, y: 0 }
    if (direction === 'backward') return { opacity: 0, x: -14, y: 0 }
    return { opacity: 0, x: 0, y: 6 }
  },
  animate: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: {
      duration: 0.21,
      ease: ENTER_EASE,
    },
  },
  exit: (direction: TransitionDirection) => {
    const offset =
      direction === 'forward'
        ? { x: -10, y: 0 }
        : direction === 'backward'
          ? { x: 10, y: 0 }
          : { x: 0, y: -4 }
    return {
      opacity: 0,
      ...offset,
      transition: {
        duration: 0.11,
        ease: EXIT_EASE,
      },
    }
  },
}

/**
 * Captures the outlet element for the lifetime of a keyed route wrapper so
 * the exiting page stays visually intact during its exit animation instead of
 * immediately swapping to the incoming route's tree.
 */
function FrozenOutlet({ outlet }: { outlet: React.ReactElement | null }) {
  const [frozen] = useState(outlet)
  return <>{frozen}</>
}

/**
 * Directional, compositor-only route transitions (transform + opacity):
 * - Drilling deeper (list -> detail -> edit): gentle glide from the right.
 * - Navigating back / POP: gentle glide from the left.
 * - Switching top-level sections: calm vertical micro-lift cross-fade.
 *
 * Resets scroll to the top between exit and enter (zero visible scroll jump)
 * and routes keyboard/screen-reader focus to #main-content once the incoming
 * page mounts. Reduced motion is enforced globally by MotionConfig in main.tsx.
 */
export function AnimatedOutlet() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const outlet = useOutlet()

  const prevPathRef = useRef(location.pathname)
  const directionRef = useRef<TransitionDirection>('lateral')

  if (prevPathRef.current !== location.pathname) {
    const prevDepth = getRouteDepth(prevPathRef.current)
    const nextDepth = getRouteDepth(location.pathname)
    if (navigationType === 'POP' || nextDepth < prevDepth) {
      directionRef.current = 'backward'
    } else if (nextDepth > prevDepth) {
      directionRef.current = 'forward'
    } else {
      directionRef.current = 'lateral'
    }
    prevPathRef.current = location.pathname
  }

  const handleExitComplete = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
    // Route focus to #main-content once the incoming page mounts, unless a
    // control inside it (e.g. SearchPage's input) already claimed focus.
    window.requestAnimationFrame(() => {
      const main = document.getElementById('main-content')
      if (!main) return
      const active = document.activeElement
      if (active && active !== document.body && main.contains(active)) return
      main.focus({ preventScroll: true })
    })
  }

  const direction = directionRef.current

  return (
    <AnimatePresence mode="wait" initial={false} custom={direction} onExitComplete={handleExitComplete}>
      <motion.div
        key={location.pathname}
        custom={direction}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="min-w-0"
      >
        <FrozenOutlet outlet={outlet} />
      </motion.div>
    </AnimatePresence>
  )
}
