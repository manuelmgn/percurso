import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, MapPin, Route } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { formatTripDateRange, formatTripTitle, type DatePrefs } from '@/utils/format'
import type { TripListItem } from '@/types'

interface TripCardProps {
  trip: TripListItem
  prefs?: DatePrefs | null
  coverUrl?: string
}

export function TripCard({ trip, prefs, coverUrl }: TripCardProps) {
  const { t } = useTranslation()
  const [coverFailed, setCoverFailed] = useState(false)
  const cover = coverUrl ?? '/images/trips/lisboa.png'

  return (
    <Link to={`/viagens/${trip.id}`} className="card group flex h-full flex-col gap-4 p-3">
      <div className="relative overflow-hidden rounded-2xl">
        {coverFailed ? (
          <div className="grid h-40 w-full place-items-center bg-primary-tint dark:bg-primary/20">
            <Route size={28} className="text-primary" aria-hidden="true" />
          </div>
        ) : (
          <img
            src={cover}
            alt={formatTripTitle(trip, prefs)}
            className="h-40 w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] dark:brightness-[0.85]"
            loading="lazy"
            onError={() => setCoverFailed(true)}
          />
        )}
        {trip.projects.length > 0 && (
          <div
            className="absolute right-3 top-3 flex max-w-[85%] flex-wrap justify-end gap-1"
            title={trip.projects.map((p) => p.name).join(', ')}
          >
            {trip.projects.slice(0, 2).map((p) => (
              <span
                key={p.id}
                className="status-chip max-w-[10rem] truncate bg-white/70 text-ink backdrop-blur-sm dark:bg-black/50 dark:text-white"
              >
                {p.name}
              </span>
            ))}
            {trip.projects.length > 2 && (
              <span className="status-chip bg-white/70 text-ink backdrop-blur-sm dark:bg-black/50 dark:text-white">
                +{trip.projects.length - 2}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Fixed-height body: every slot reserves its space so all cards in a
          grid line up regardless of title length or date range. */}
      <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
        <h3 className="line-clamp-2 min-h-[2.75em] font-display text-[17px] font-bold leading-[1.375]" title={formatTripTitle(trip, prefs)}>
          {formatTripTitle(trip, prefs)}
        </h3>
        <div className="flex h-5 items-center gap-4 text-[13px] text-muted">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <CalendarDays size={13} className="shrink-0" aria-hidden="true" />
            <span className="truncate tabular-nums">{formatTripDateRange(trip.start_date, trip.end_date, prefs, true)}</span>
          </span>
          <span
            className="inline-flex shrink-0 items-center gap-1.5"
            title={t(trip.place_count === 1 ? 'trip.placeCount.one' : 'trip.placeCount.other', { count: trip.place_count })}
          >
            <MapPin size={13} aria-hidden="true" />
            <span className="tabular-nums" aria-hidden="true">{trip.place_count}</span>
            <span className="sr-only">
              {t(trip.place_count === 1 ? 'trip.placeCount.one' : 'trip.placeCount.other', { count: trip.place_count })}
            </span>
          </span>
        </div>
        <div className="mt-auto flex items-center justify-between pt-1">
          <span
            className="grid h-7 w-7 place-items-center rounded-full border-2 border-surface bg-brand text-[11px] font-bold text-white"
            title={trip.creator_username}
          >
            {trip.creator_username.charAt(0).toUpperCase()}
          </span>
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
            {t('trips.viewRoute')} <ArrowRight size={13} aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  )
}
