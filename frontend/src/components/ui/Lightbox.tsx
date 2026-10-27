import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Pencil, X } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useModalA11y } from '@/hooks/useModalA11y'
import { formatDateTime } from '@/utils/format'
import type { Photo } from '@/types'

const MIN_ZOOM = 1
const MAX_ZOOM = 4
/** Double-click toggles between this level and fit-to-view. */
const TOGGLE_ZOOM = 2.5

interface LightboxProps {
  photos: Photo[]
  initialIndex: number
  /** Whether the current user may edit this photo's caption. */
  canEdit: (photo: Photo) => boolean
  onClose: () => void
  onSaveCaption: (photo: Photo, caption: string) => Promise<void>
}

export function Lightbox({ photos, initialIndex, canEdit, onClose, onSaveCaption }: LightboxProps) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(initialIndex)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null)

  const photo = photos[index]

  // Esc + focus trap + scroll lock from the shared hook.
  const containerRef = useModalA11y<HTMLDivElement>(onClose)

  const resetView = useCallback(() => {
    setZoom(MIN_ZOOM)
    setPan({ x: 0, y: 0 })
  }, [])

  const goTo = useCallback(
    (next: number) => {
      setIndex(((next % photos.length) + photos.length) % photos.length)
      setEditing(false)
      resetView()
    },
    [photos.length, resetView]
  )

  // Scroll lock and keyboard handling live in useModalA11y (shared with the
  // settings modal); the arrow-key navigation stays here.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goTo(index - 1)
      if (e.key === 'ArrowRight') goTo(index + 1)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [index, goTo])

  // Wheel zoom needs a non-passive listener to stop the page from zooming
  // or scrolling behind the lightbox.
  const figureRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = figureRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current - e.deltaY * 0.002)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
    }
  }, [])

  // Pointer-event panning covers mouse drag and single-finger touch drag
  // alike; pinch zooming is intentionally not implemented (no libraries).
  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= MIN_ZOOM) return
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: pan.x,
      baseY: pan.y,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    setPan({ x: drag.baseX + e.clientX - drag.startX, y: drag.baseY + e.clientY - drag.startY })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null
  }

  // Double-click zooms in; a second double-click (or the wheel back to 1x)
  // returns to fit-to-view.
  const onImageClick = () => {
    if (zoom === MIN_ZOOM) {
      setZoom(TOGGLE_ZOOM)
    } else {
      resetView()
    }
  }

  const startEditing = () => {
    setDraft(photo.caption ?? '')
    setEditing(true)
  }

  const saveCaption = async () => {
    setIsSaving(true)
    try {
      await onSaveCaption(photo, draft.trim())
      setEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  if (!photo) return null

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-ink/90 backdrop-blur-sm focus:outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={t('lightbox.title')}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label={t('lightbox.close')}
        className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X size={20} aria-hidden="true" />
      </button>

      <div className="flex flex-1 items-center justify-center gap-2 p-4" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => goTo(index - 1)}
          disabled={photos.length < 2}
          aria-label={t('lightbox.previous')}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-30"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>

        <figure ref={figureRef} className="flex max-h-full min-w-0 flex-col items-center overflow-hidden">
          <img
            src={photo.url}
            alt={photo.caption ?? t('lightbox.title')}
            onClick={(e) => {
              // Keep the backdrop's close-on-click working everywhere else.
              e.stopPropagation()
              onImageClick()
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={`max-h-[75vh] w-auto max-w-full rounded-2xl object-contain shadow-pop transition-transform duration-200 ${
              zoom > MIN_ZOOM ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
            }`}
            style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` }}
          />
          <figcaption className="mt-3 max-w-lg text-center">
            {editing ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  saveCaption()
                }}
              >
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t('lightbox.captionPlaceholder')}
                  maxLength={512}
                  className="w-64 max-w-full rounded-pill bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="submit"
                  disabled={isSaving}
                  aria-label={t('actions.save')}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-white transition-opacity disabled:opacity-50"
                >
                  <Check size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={isSaving}
                  aria-label={t('actions.cancel')}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </form>
            ) : (
              <span className="inline-flex items-center gap-2 text-sm text-white/85">
                {photo.caption ?? ''}
                {canEdit(photo) && (
                  <button
                    onClick={startEditing}
                    aria-label={t('lightbox.editCaption')}
                    className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
                  >
                    <Pencil size={13} aria-hidden="true" />
                  </button>
                )}
              </span>
            )}
            {(photo.taken_at || photo.lat !== null) && (
              <span className="mt-1 block text-xs text-white/50">
                {photo.taken_at ? formatDateTime(photo.taken_at) : ''}
                {photo.taken_at && photo.lat !== null && ' · '}
                {photo.lat !== null && photo.lon !== null
                  ? `${photo.lat.toFixed(5)}, ${photo.lon.toFixed(5)}`
                  : ''}
              </span>
            )}
            <span className="mt-1 block text-xs text-white/50">
              {index + 1} / {photos.length}
              {zoom > MIN_ZOOM && ` · ${Math.round(zoom * 100)}%`}
            </span>
          </figcaption>
        </figure>

        <button
          onClick={() => goTo(index + 1)}
          disabled={photos.length < 2}
          aria-label={t('lightbox.next')}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-30"
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
