import { useState } from 'react'
import { ExternalLink as ExternalLinkIcon, HardDrive, Images, Link as LinkIcon, Loader2, Plus, Trash2 } from 'lucide-react'
import { api } from '@/api'
import { getErrorMessage } from '@/hooks/useApiResource'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from '@/i18n'
import type { ExternalLink, Trip } from '@/types'

const MAX_LINKS = 3

const LINK_ICONS = {
  google_photos: Images,
  immich: HardDrive,
  link: LinkIcon,
} as const

interface TripLinksProps {
  trip: Trip
}

export function TripLinks({ trip }: TripLinksProps) {
  const { user } = useAuth()
  const { t } = useTranslation()

  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  // Local override: the parent refetches on its own schedule, so a plain
  // useState(init) could go stale. Until the user edits links here, the
  // prop stays the source of truth (same pattern as the cover photo).
  const [linksOverride, setLinksOverride] = useState<ExternalLink[] | undefined>(undefined)
  const links = linksOverride ?? trip.external_links

  const canEditTrip =
    !!user && (trip.creator_id === user.id || trip.participants.some((p) => p.id === user.id))

  // Hidden when there is nothing to show and the user cannot add links.
  if (!canEditTrip && links.length === 0) return null

  const save = async (next: { url: string }[]) => {
    setError('')
    setIsSaving(true)
    try {
      const updated = await api.trips.update(trip.id, { external_links: next })
      setLinksOverride(updated.external_links)
    } catch (err) {
      setError(getErrorMessage(err, t('trip.linkSaveError')))
      throw err
    } finally {
      setIsSaving(false)
    }
  }

  const handleAdd = async () => {
    const url = draft.trim()
    if (!url) return
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      setError(t('trip.linkErrorInvalid'))
      return
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      setError(t('trip.linkErrorInvalid'))
      return
    }
    if (links.length >= MAX_LINKS) {
      setError(t('trip.linkErrorMax'))
      return
    }
    const key = url.replace(/\/+$/, '')
    if (links.some((l) => l.url.replace(/\/+$/, '') === key)) {
      setError(t('trip.linkErrorDuplicate'))
      return
    }
    try {
      await save([...links.map((l) => ({ url: l.url })), { url }])
      setDraft('')
    } catch {
      // Error already surfaced by save().
    }
  }

  const handleRemove = async (link: ExternalLink) => {
    try {
      await save(links.filter((l) => l.url !== link.url).map((l) => ({ url: l.url })))
    } catch {
      // Error already surfaced by save().
    }
  }

  return (
    <section className="card">
      <h2 className="flex items-center gap-2 font-display text-xl font-bold">
        <ExternalLinkIcon size={16} className="text-primary" aria-hidden="true" /> {t('trip.linksTitle')}
      </h2>

      {links.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('trip.noLinks')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {links.map((link) => {
            const Icon = LINK_ICONS[link.type] ?? LinkIcon
            return (
              <li key={link.url} className="group flex items-center gap-2 text-sm">
                <Icon size={14} className="shrink-0 text-muted" aria-hidden="true" />
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate font-medium text-primary hover:underline"
                  title={link.url}
                >
                  {link.url}
                </a>
                <span className="shrink-0 rounded-full bg-fill px-2 py-0.5 text-xs text-muted">
                  {t(`trip.linkType.${link.type}`)}
                </span>
                {canEditTrip && (
                  <button
                    onClick={() => handleRemove(link)}
                    disabled={isSaving}
                    aria-label={t('trip.removeLink')}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted opacity-0 transition-opacity hover:bg-red-600/10 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {error && <p className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>}

      {canEditTrip && links.length < MAX_LINKS && (
        <div className="mt-3 flex gap-2">
          <input
            type="url"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAdd()
              }
            }}
            placeholder={t('trip.linkPlaceholder')}
            aria-label={t('trip.addLink')}
            className="input min-w-0 flex-1"
          />
          <button
            onClick={() => handleAdd()}
            disabled={isSaving || !draft.trim()}
            className="btn-outline inline-flex shrink-0 items-center gap-2"
          >
            {isSaving ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Plus size={14} aria-hidden="true" />
            )}
            {t('trip.addLink')}
          </button>
        </div>
      )}
    </section>
  )
}
