import { useEffect, useState } from 'react'
import { useTranslation } from '@/i18n'
import { api, ApiError } from '@/api'
import type { PinEntityType } from '@/types'

interface PinButtonProps {
  entityType: PinEntityType
  entityId: number
  label: string
  showLabel?: boolean
}

export function PinButton({ entityType, entityId, label, showLabel = false }: PinButtonProps) {
  const [isPinned, setIsPinned] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const { t } = useTranslation()

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setIsLoading(true)
        const pins = await api.pins.list()
        if (!cancelled) {
          setIsPinned(pins.some((p) => p.entity_type === entityType && p.entity_id === entityId))
        }
      } catch {
        // Pins are optional; failure leaves the button hidden.
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [entityType, entityId])

  if (isLoading) return null

  const handleClick = async () => {
    setError('')
    try {
      if (isPinned) {
        await api.pins.unpin(entityType, entityId)
      } else {
        await api.pins.pin(entityType, entityId)
      }
      setIsPinned(!isPinned)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError(t('pinButton.error'))
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        aria-label={isPinned ? t('pinButton.unpinAria', { label }) : t('pinButton.pinAria', { label })}
        title={isPinned ? t('actions.unpin') : t('actions.pin')}
        className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-2 text-sm font-medium transition-colors ${
          isPinned
            ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
            : 'bg-line/40 text-ink hover:bg-line dark:bg-[#322A23]/50 dark:text-[#FAF7F2] dark:hover:bg-[#322A23]'
        }`}
      >
        <svg
          className="h-4 w-4"
          fill={isPinned ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"
          />
        </svg>
        {showLabel && (isPinned ? t('actions.unpin') : t('actions.pin'))}
      </button>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </>
  )
}
