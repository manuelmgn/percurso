import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Pencil, X } from 'lucide-react'
import { useTranslation } from '@/i18n'
import type { Photo } from '@/types'

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

  const photo = photos[index]

  const goTo = useCallback(
    (next: number) => {
      setIndex(((next % photos.length) + photos.length) % photos.length)
      setEditing(false)
    },
    [photos.length]
  )

  // Keyboard navigation + scroll lock while the overlay is open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goTo(index - 1)
      if (e.key === 'ArrowRight') goTo(index + 1)
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [index, goTo, onClose])

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
      className="fixed inset-0 z-50 flex flex-col bg-ink/90 backdrop-blur-sm"
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

        <figure className="flex max-h-full min-w-0 flex-col items-center">
          <img
            src={photo.url}
            alt={photo.caption ?? t('lightbox.title')}
            className="max-h-[75vh] w-auto max-w-full rounded-2xl object-contain shadow-pop"
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
            <span className="mt-1 block text-xs text-white/50">
              {index + 1} / {photos.length}
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
