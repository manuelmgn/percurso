import { useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, Loader2, Plus, Trash2 } from 'lucide-react'
import { api } from '@/api'
import { getErrorMessage } from '@/hooks/useApiResource'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from '@/i18n'
import { Lightbox } from '@/components/ui/Lightbox'
import type { Photo, Trip } from '@/types'

interface TripPhotosProps {
  trip: Trip
  /** When true, renders bare (no card frame or heading) for embedding in forms. */
  embedded?: boolean
}

export function TripPhotos({ trip, embedded = false }: TripPhotosProps) {
  const { user } = useAuth()
  const { t } = useTranslation()

  const [photos, setPhotos] = useState<Photo[] | null>(null)
  const [error, setError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canEditTrip =
    !!user && (trip.creator_id === user.id || trip.participants.some((p) => p.id === user.id))
  const canManage = (photo: Photo) =>
    !!user && canEditTrip && (photo.uploader_id === user.id || trip.creator_id === user.id)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const list = await api.photos.list(trip.id)
        if (!cancelled) setPhotos(list)
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, t('trip.photosLoadError')))
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [trip.id, t])

  // Hidden when there is nothing to show and the user cannot add photos.
  if (!canEditTrip && (photos === null || photos.length === 0)) return null

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError('')
    setIsUploading(true)
    try {
      const created = await api.photos.upload(trip.id, Array.from(files))
      setPhotos((current) => [...(current ?? []), ...created])
    } catch (err) {
      setError(getErrorMessage(err, t('trip.photosUploadError')))
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (photo: Photo) => {
    setError('')
    try {
      await api.photos.remove(trip.id, photo.id)
      setPhotos((current) => (current ?? []).filter((p) => p.id !== photo.id))
      if (lightboxIndex !== null) setLightboxIndex(null)
    } catch (err) {
      setError(getErrorMessage(err, t('trip.photoDeleteError')))
    }
  }

  const handleSaveCaption = async (photo: Photo, caption: string) => {
    try {
      const updated = await api.photos.updateCaption(trip.id, photo.id, { caption })
      setPhotos((current) => (current ?? []).map((p) => (p.id === photo.id ? updated : p)))
    } catch (err) {
      setError(getErrorMessage(err, t('trip.captionSaveError')))
      throw err
    }
  }

  const Wrapper = embedded ? 'div' : 'section'
  const frameClass = embedded ? '' : 'card'

  return (
    <Wrapper className={frameClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!embedded && (
          <h2 className="flex items-center gap-2 font-display text-xl font-bold">
            <ImageIcon size={16} className="text-primary" aria-hidden="true" /> {t('trip.photosTitle')}
          </h2>
        )}
        {canEditTrip && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              aria-label={t('trip.addPhotos')}
              onChange={(e) => handleFiles(e.target.files)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="btn-outline inline-flex items-center gap-2"
            >
              {isUploading ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Plus size={14} aria-hidden="true" />
              )}
              {isUploading ? t('trip.photosUploading') : t('trip.addPhotos')}
            </button>
          </>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>
      )}

      {photos !== null && photos.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('trip.noPhotos')}</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {(photos ?? []).map((photo, index) => (
            <div key={photo.id} className="group relative">
              <button
                onClick={() => setLightboxIndex(index)}
                className="block w-full overflow-hidden rounded-2xl shadow-card"
                aria-label={photo.caption ?? t('trip.openPhoto')}
              >
                <img
                  src={photo.url}
                  alt={photo.caption ?? ''}
                  loading="lazy"
                  className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] dark:brightness-[0.85]"
                />
              </button>
              {canManage(photo) && (
                <button
                  onClick={() => handleDelete(photo)}
                  aria-label={t('trip.deletePhoto')}
                  className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-ink/60 text-white opacity-0 shadow-pop transition-opacity hover:bg-red-600 group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {lightboxIndex !== null && photos && (
        <Lightbox
          photos={photos}
          initialIndex={lightboxIndex}
          canEdit={canManage}
          onClose={() => setLightboxIndex(null)}
          onSaveCaption={handleSaveCaption}
        />
      )}
    </Wrapper>
  )
}
