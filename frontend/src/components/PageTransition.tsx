import { motion, AnimatePresence } from 'framer-motion'
import { useLocation, useOutlet } from 'react-router-dom'

export function AnimatedOutlet() {
  const location = useLocation()
  const outlet = useOutlet()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0.99 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0.99 }}
        transition={{ duration: 0.1, ease: 'linear' }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  )
}
