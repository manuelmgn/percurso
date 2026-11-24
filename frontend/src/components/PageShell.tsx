import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { PageSkeleton, type SkeletonVariant } from '@/components/ui/Skeleton'

const DEFAULT_SKELETON_DELAY_MS = 90
const REVEAL_EASE = [0.22, 1, 0.36, 1] as const

interface PageShellProps {
  /** Skeleton shape matching the page layout (also declared on the route in routes.tsx). */
  skeleton?: SkeletonVariant
  /** True while the page's primary data is still loading. */
  isLoading?: boolean
  /** Grace period before showing a skeleton so cached / sub-90ms loads never flash. */
  skeletonDelayMs?: number
  /** Wrapper classes for the loaded page content. */
  className?: string
  children: React.ReactNode
}

/**
 * Unitary page container used by every route in the app.
 *
 * Centralises loading, skeleton grace timing, and skeleton-to-content reveal so
 * every existing and future page feels cohesive:
 * - Cached or fast (<90ms) loads render straight into the route transition with
 *   zero skeleton flash.
 * - Slower loads fade in the matching shimmer skeleton, then smoothly cross-fade
 *   into the real content once ready (never a hard pop-in).
 */
export function PageShell({
  skeleton = 'detail',
  isLoading = false,
  skeletonDelayMs = DEFAULT_SKELETON_DELAY_MS,
  className = 'space-y-6',
  children,
}: PageShellProps) {
  const [showSkeleton, setShowSkeleton] = useState(false)
  // Remember if a skeleton was visibly painted so we know to run the smooth
  // skeleton -> content reveal when the loaded branch mounts.
  const hadVisibleSkeleton = useRef(false)

  useEffect(() => {
    if (!isLoading) {
      setShowSkeleton(false)
      return
    }
    const timer = window.setTimeout(() => {
      hadVisibleSkeleton.current = true
      setShowSkeleton(true)
    }, skeletonDelayMs)
    return () => window.clearTimeout(timer)
  }, [isLoading, skeletonDelayMs])

  if (isLoading) {
    if (!showSkeleton) {
      // Reserve vertical space during the short grace window to avoid footer/scroll
      // jumping if the response lands in <90ms.
      return <div key="grace" className="min-h-[40vh]" aria-busy="true" />
    }
    return (
      <motion.div
        key="skeleton"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
      >
        <PageSkeleton variant={skeleton} />
      </motion.div>
    )
  }

  const animateReveal = hadVisibleSkeleton.current
  hadVisibleSkeleton.current = false

  // Always render the same motion.div element type for loaded content so
  // subsequent re-renders never unmount/remount children (maps, inputs, etc.).
  // Framer Motion only evaluates `initial` on mount.
  return (
    <motion.div
      key="content"
      initial={animateReveal ? { opacity: 0, y: 5 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: REVEAL_EASE }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/**
 * Route-level <Suspense> fallback used automatically by the route registry.
 * Delays the skeleton and top progress indicator by 90ms so prefetched or
 * already-cached chunks never flash a loading state.
 */
export function RouteSuspenseFallback({ variant }: { variant: SkeletonVariant }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), DEFAULT_SKELETON_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [])

  if (!visible) {
    return <div className="min-h-[40vh]" aria-busy="true" />
  }

  return (
    <>
      <div className="route-progress-bar" aria-hidden="true" />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
      >
        <PageSkeleton variant={variant} />
      </motion.div>
    </>
  )
}
