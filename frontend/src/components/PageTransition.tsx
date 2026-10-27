import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { useLocation, useOutlet } from 'react-router-dom'

// Cross-fade + micro slide between routes. Both pages stay mounted for a
// beat (mode="popLayout" keeps the new page from waiting for the old one to
// leave) so navigation feels instant; the movement itself is 200ms. The
// animation runs in the compositor (opacity + transform only).
export function AnimatedOutlet() {
  const location = useLocation()
  const outlet = useOutlet()

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{
            opacity: { duration: 0.2, ease: 'easeOut' },
            y: { duration: 0.2, ease: [0.22, 0.61, 0.36, 1] },
          }}
          className="min-w-0"
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  )
}
