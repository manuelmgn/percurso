import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, ChevronUp, ExternalLink, HardDrive, Image as ImageIcon, Loader2, Search, Star, Unlink, X } from 'lucide-react'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { getErrorMessage } from '@/hooks/useApiResource'
import { useModalA11y } from '@/hooks/useModalA11y'
import { canEditEntity } from '@/utils/permissions'
import { formatDate } from '@/utils/format'
import { useTranslation } from '@/i18n'
import { AlertBanner } from '@/components/ui/ErrorBanner'
import { Lightbox } from '@/components/ui/Lightbox'
import type { ImmichAlbumDetail, ImmichAlbumSummary, ImmichStatus, Trip } from '@/types'

const ALBUM_PATH_RE = /\/albums\/([a-zA-Z0-9-]{1,64})(?:\/|$)/
/** Number of photos shown before the "show all" toggle keeps trip pages compact. */
const PREVIEW_LIMIT = 12

function extractImmichAlbumFromLinks(trip: Trip): { id: string; url: string } | null {
  for (const link of trip.external_links) {
    if (link.type !== 'immich') continue
    try {
      const match = ALBUM_PATH_RE.exec(new URL(link.url).pathname)
      if (match) return { id: match[1], url: link.url }
    } catch {
      // Ignore malformed URLs; server validation handles them.
    }
  }
  return null
}

function ImmichAlbumPickerModal({
  currentAlbumId,
  onSelect,
  onClose,
}: {
  currentAlbumId: string | null
  onSelect: (album: ImmichAlbumSummary) => Promise<void>
  onClose: () => void
}) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const containerRef = useModalA11y<HTMLDivElement>(onClose)

  const [albums, setAlbums] = useState<ImmichAlbumSummary[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.immich
      .albums()
      .then((list) => {
        if (!cancelled) setAlbums(list)
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, t('trip.immichLoadError')))
      })
    return () => {
      cancelled = true
    }
  }, [t])

  const filtered = (albums ?? []).filter((a) =>
    a.name.toLowerCase().includes(query.trim().toLowerCase())
  )

  const handleChoose = async (album: ImmichAlbumSummary) => {
    if (savingId) return
    setError('')
    setSavingId(album.id)
    try {
      await onSelect(album)
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, t('trip.immichSaveError')))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t('trip.immichPickerTitle')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm focus:outline-none"
      onClick={onClose}
    >
      <div
        className="card flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <HardDrive size={18} className="text-primary" aria-hidden="true" />
            {t('trip.immichPickerTitle')}
          </h3>
          <button
            onClick={onClose}
            aria-label={t('lightbox.close')}
            className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-fill hover:text-ink"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="relative mt-4">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('trip.immichSearchPlaceholder')}
            className="input w-full pl-9"
            autoFocus
          />
        </div>

        <AlertBanner small className="mt-3" message={error} />

        <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
          {albums === null && !error ? (
            <div className="flex items-center justify-center py-10 text-muted">
              <Loader2 size={20} className="animate-spin" aria-hidden="true" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">{t('trip.immichNoAlbums')}</p>
          ) : (
            filtered.map((album) => {
              const isSelected = album.id === currentAlbumId
              const countKey = album.asset_count === 1 ? 'trip.immichCount.one' : 'trip.immichCount.other'
              return (
                <button
                  key={album.id}
                  onClick={() => handleChoose(album)}
                  disabled={savingId !== null}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition-colors disabled:opacity-50 ${
                    isSelected
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-line bg-bg/50 hover:border-primary/40 hover:bg-fill'
                  }`}
                >
                  {album.thumbnail_url ? (
                    <img
                      src={album.thumbnail_url}
                      alt=""
                      loading="lazy"
                      className="h-12 w-12 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-fill text-muted">
                      <ImageIcon size={18} aria-hidden="true" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{album.name}</p>
                    <p className="text-xs text-muted">
                      {t(countKey, { count: album.asset_count })}
                      {album.start_date ? ` · ${formatDate(album.start_date, user)}` : ''}
                    </p>
                  </div>
                  {savingId === album.id ? (
                    <Loader2 size={16} className="shrink-0 animate-spin text-primary" aria-hidden="true" />
                  ) : isSelected ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      <Check size={12} aria-hidden="true" />
                      {t('trip.immichSelected')}
                    </span>
                  ) : null}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

interface ImmichGalleryProps {
  trip: Trip
  onTripUpdate?: (trip: Trip) => void
}

export function ImmichGallery({ trip, onTripUpdate }: ImmichGalleryProps) {
  const { user } = useAuth()
  const { t } = useTranslation()

  const [status, setStatus] = useState<ImmichStatus | null>(null)
  const [album, setAlbum] = useState<ImmichAlbumDetail | null>(null)
  const [loadingAlbum, setLoadingAlbum] = useState(false)
  const [error, setError] = useState('')
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [isUnlinking, setIsUnlinking] = useState(false)
  const [isUpdatingCover, setIsUpdatingCover] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  // Local fallback overrides when rendered without an onTripUpdate callback.
  const [albumIdOverride, setAlbumIdOverride] = useState<string | null | undefined>(undefined)
  const [coverOverride, setCoverOverride] = useState<string | null | undefined>(undefined)

  const canEditTrip = canEditEntity(user, trip)
  const linkFallback = extractImmichAlbumFromLinks(trip)
  const explicitAlbumId = onTripUpdate
    ? trip.immich_album_id
    : (albumIdOverride !== undefined ? albumIdOverride : trip.immich_album_id)
  const coverImmichAssetId = onTripUpdate
    ? trip.cover_immich_asset_id
    : (coverOverride !== undefined ? coverOverride : trip.cover_immich_asset_id)
  const effectiveAlbumId = explicitAlbumId ?? linkFallback?.id ?? null

  useEffect(() => {
    let cancelled = false
    api.immich
      .status()
      .then((res) => {
        if (!cancelled) setStatus(res)
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({ enabled: false, server_configured: false, has_api_key: false, public_url: null })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!status?.server_configured || !effectiveAlbumId) {
      setAlbum(null)
      return
    }
    let cancelled = false
    setLoadingAlbum(true)
    setError('')
    setExpanded(false)
    api.immich
      .tripAlbum(trip.id)
      .then((data) => {
        if (!cancelled) setAlbum(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setAlbum(null)
          setError(getErrorMessage(err, t('trip.immichLoadError')))
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAlbum(false)
      })
    return () => {
      cancelled = true
    }
  }, [trip.id, status?.server_configured, effectiveAlbumId, t])

  if (!status) return null
  if (!effectiveAlbumId && (!status.server_configured || !canEditTrip)) return null

  const handleSelectAlbum = async (chosen: ImmichAlbumSummary) => {
    const updated = await api.trips.update(trip.id, { immich_album_id: chosen.id })
    if (onTripUpdate) {
      onTripUpdate(updated)
    } else {
      setAlbumIdOverride(updated.immich_album_id)
      setCoverOverride(updated.cover_immich_asset_id)
    }
  }

  const handleUnlink = async () => {
    if (isUnlinking) return
    setError('')
    setIsUnlinking(true)
    try {
      const updated = await api.trips.update(trip.id, { clear_immich_album: true })
      if (onTripUpdate) {
        onTripUpdate(updated)
      } else {
        setAlbumIdOverride(null)
        setCoverOverride(updated.cover_immich_asset_id)
      }
      setAlbum(null)
    } catch (err) {
      setError(getErrorMessage(err, t('trip.immichSaveError')))
    } finally {
      setIsUnlinking(false)
    }
  }

  const handleSetCover = async (assetId: string) => {
    if (isUpdatingCover) return
    setError('')
    setIsUpdatingCover(true)
    try {
      const updated = await api.trips.update(trip.id, { cover_immich_asset_id: assetId })
      if (onTripUpdate) {
        onTripUpdate(updated)
      } else {
        setCoverOverride(updated.cover_immich_asset_id)
      }
    } catch (err) {
      setError(getErrorMessage(err, t('trip.coverSetError')))
    } finally {
      setIsUpdatingCover(false)
    }
  }

  const handleClearCover = async () => {
    if (isUpdatingCover) return
    setError('')
    setIsUpdatingCover(true)
    try {
      const updated = await api.trips.update(trip.id, { clear_cover: true })
      if (onTripUpdate) {
        onTripUpdate(updated)
      } else {
        setCoverOverride(null)
      }
    } catch (err) {
      setError(getErrorMessage(err, t('trip.coverSetError')))
    } finally {
      setIsUpdatingCover(false)
    }
  }

  // Keep the external link usable even if the album metadata fetch fails
  // (e.g. Immich temporarily offline).
  const externalUrl =
    album?.external_url ??
    (effectiveAlbumId && status.public_url
      ? `${status.public_url}/albums/${effectiveAlbumId}`
      : linkFallback?.url ?? null)

  const allAssets = album?.assets ?? []
  const visibleAssets = expanded ? allAssets : allAssets.slice(0, PREVIEW_LIMIT)
  const hasMore = allAssets.length > PREVIEW_LIMIT

  const lightboxPhotos = allAssets.map((asset) => ({
    id: asset.id,
    url: asset.preview_url,
    caption: asset.caption,
    taken_at: asset.taken_at,
    lat: asset.lat,
    lon: asset.lon,
  }))

  const countKey =
    (album?.asset_count ?? 0) === 1 ? 'trip.immichCount.one' : 'trip.immichCount.other'

  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold">
            <HardDrive size={16} className="text-primary" aria-hidden="true" />
            {album ? album.name : t('trip.immichTitle')}
          </h2>
          {album && (
            <p className="mt-0.5 text-xs text-muted">
              {t(countKey, { count: album.asset_count })}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {externalUrl && (
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline inline-flex items-center gap-2"
            >
              <ExternalLink size={14} aria-hidden="true" />
              {t('trip.immichOpenExternal')}
            </a>
          )}
          {canEditTrip && status.server_configured && (
            status.has_api_key ? (
              <button
                onClick={() => setIsPickerOpen(true)}
                className="btn-outline inline-flex items-center gap-2"
              >
                <HardDrive size={14} aria-hidden="true" />
                {effectiveAlbumId ? t('trip.immichChange') : t('trip.immichLink')}
              </button>
            ) : (
              <Link
                to="/ajustes"
                className="btn-outline inline-flex items-center gap-2"
              >
                <HardDrive size={14} aria-hidden="true" />
                {t('trip.immichConfigureLink')}
              </Link>
            )
          )}
          {canEditTrip && explicitAlbumId && (
            <button
              onClick={() => handleUnlink()}
              disabled={isUnlinking}
              className="btn-outline inline-flex items-center gap-2 text-muted hover:text-red-600"
              aria-label={t('trip.immichUnlink')}
            >
              {isUnlinking ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Unlink size={14} aria-hidden="true" />
              )}
              {t('trip.immichUnlink')}
            </button>
          )}
        </div>
      </div>

      <AlertBanner small className="mt-3" message={error} />

      {!effectiveAlbumId ? (
        <p className="mt-3 text-sm text-muted">
          {status.has_api_key ? t('trip.immichEmpty') : t('trip.immichNeedsKey')}
        </p>
      ) : !status.server_configured ? (
        <p className="mt-3 text-sm text-muted">{t('trip.immichUnconfigured')}</p>
      ) : loadingAlbum && !album ? (
        <div className="flex items-center justify-center py-8 text-muted">
          <Loader2 size={20} className="animate-spin" aria-hidden="true" />
        </div>
      ) : album && allAssets.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('trip.immichNoPhotos')}</p>
      ) : album ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibleAssets.map((asset, index) => (
              <div key={asset.id} className="group relative">
                <button
                  onClick={() => setLightboxIndex(index)}
                  className="block w-full overflow-hidden rounded-2xl shadow-card"
                  aria-label={asset.caption ?? asset.filename ?? t('trip.openPhoto')}
                >
                  <img
                    src={asset.thumbnail_url}
                    alt={asset.caption ?? ''}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] dark:brightness-[0.85]"
                  />
                </button>
                {coverImmichAssetId === asset.id &&
                  (canEditTrip ? (
                    <button
                      onClick={() => handleClearCover()}
                      disabled={isUpdatingCover}
                      aria-label={t('trip.clearCover')}
                      title={t('trip.coverPhoto')}
                      className="absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-primary text-white shadow-pop"
                    >
                      <Star size={14} fill="currentColor" aria-hidden="true" />
                    </button>
                  ) : (
                    <span
                      className="absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-primary text-white shadow-pop"
                      title={t('trip.coverPhoto')}
                    >
                      <Star size={14} fill="currentColor" aria-hidden="true" />
                    </span>
                  ))}
                {canEditTrip && coverImmichAssetId !== asset.id && (
                  <button
                    onClick={() => handleSetCover(asset.id)}
                    disabled={isUpdatingCover}
                    aria-label={t('trip.setAsCover')}
                    className="absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-ink/60 text-white opacity-0 shadow-pop transition-opacity hover:bg-primary group-hover:opacity-100 focus:opacity-100"
                  >
                    <Star size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setExpanded((prev) => !prev)}
                className="btn-outline inline-flex items-center gap-2"
              >
                {expanded ? (
                  <>
                    <ChevronUp size={15} aria-hidden="true" />
                    {t('trip.immichShowLess')}
                  </>
                ) : (
                  <>
                    <ChevronDown size={15} aria-hidden="true" />
                    {t('trip.immichShowAll', { count: allAssets.length })}
                  </>
                )}
              </button>
            </div>
          )}
        </>
      ) : null}

      {isPickerOpen && (
        <ImmichAlbumPickerModal
          currentAlbumId={effectiveAlbumId}
          onSelect={handleSelectAlbum}
          onClose={() => setIsPickerOpen(false)}
        />
      )}

      {lightboxIndex !== null && lightboxPhotos.length > 0 && (
        <Lightbox
          photos={lightboxPhotos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </section>
  )
}
