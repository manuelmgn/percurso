import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, MapPin, Route } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { StatusChip } from './StatusChip'
import { getTripStatus } from '@/utils/tripStatus'
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
    <Link to={`/viagens/${trip.id}`} className="card group flex flex-col gap-4 p-3">
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
        <StatusChip status={getTripStatus(trip.start_date, trip.end_date)} className="absolute right-3 top-3" />
      </div>

      <div className="flex flex-col gap-2 px-2 pb-2">
        <h3 className="font-display text-[17px] font-bold">{formatTripTitle(trip, prefs)}</h3>
        <div className="flex items-center gap-4 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays size={13} aria-hidden="true" /> {formatTripDateRange(trip.start_date, trip.end_date, prefs)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={13} aria-hidden="true" /> {t('trip.placeCount', { count: trip.place_count })}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between">
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
