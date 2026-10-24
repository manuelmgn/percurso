import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from '@/i18n'

type Align = 'start' | 'center' | 'end'

interface InfoTooltipProps {
  /** Hint shown inside the bubble. */
  text: string
  /** Horizontal alignment of the bubble relative to the trigger. */
  align?: Align
  className?: string
}

const alignClasses: Record<Align, string> = {
  start: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  end: 'right-0',
}

/**
 * Tiny semi-transparent "?" bubble that reveals a short hint on hover,
 * focus or tap. The bubble is rendered inline next to the label it explains.
 */
export function InfoTooltip({ text, align = 'start', className = '' }: InfoTooltipProps) {
  const { t } = useTranslation()
  const id = useId()
  const rootRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)

  // Tapping outside closes the bubble on touch devices, where there is no
  // pointer-leave event to rely on.
  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  return (
    <span ref={rootRef} className={`relative inline-flex shrink-0 ${className}`}>
      <button
        type="button"
        aria-label={t('tooltip.moreInfo')}
        aria-describedby={id}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') setOpen(true)
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') setOpen(false)
        }}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse') return
          // Prevent the synthetic focus/click so the tap only toggles once.
          event.preventDefault()
          setOpen((value) => !value)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(event) => {
          // Keyboard activation (Enter/Space) has no pointer detail.
          if (event.detail === 0) setOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
        }}
        className="info-tooltip-trigger"
      >
        ?
      </button>
      <span
        id={id}
        role="tooltip"
        className={`info-tooltip-bubble ${alignClasses[align]} ${open ? 'opacity-100' : 'opacity-0'}`}
      >
        {text}
      </span>
    </span>
  )
}
