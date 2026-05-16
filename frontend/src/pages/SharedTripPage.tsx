import { useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Loader2, Calendar, MapPin, Users } from "lucide-react"
import { tripsApi } from "@/lib/api"
import { formatDateRange } from "@/lib/utils"
import { getPlaceLabel } from "@/lib/placeTypes"
import { PlaceIcon } from "@/components/PlaceIcon"
import type { PlaceType } from "@/types"

export default function SharedTripPage() {
  const { token } = useParams<{ token: string }>()

  const { data: trip, isLoading, isError } = useQuery({
    queryKey: ["trip-shared", token],
    queryFn: () => tripsApi.getShared(token!),
    enabled: !!token,
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError || !trip) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Viagem não encontrada</h1>
          <p className="text-muted-foreground">Este link pode ter expirado ou ser inválido.</p>
        </div>
      </div>
    )
  }

  const colour = trip.cover_colour ?? "#7C3AED"

  return (
    <div className="min-h-screen bg-background">
      {/* Cover */}
      <div
        className="relative h-64 w-full overflow-hidden"
        style={trip.cover_image_url ? {} : { backgroundColor: colour }}
      >
        {trip.cover_image_url ? (
          <img src={trip.cover_image_url} alt={trip.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-end p-8">
            <span className="text-white font-bold text-3xl leading-tight drop-shadow">{trip.title}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
      </div>

      <div className="mx-auto max-w-2xl p-6">
        <div className="mb-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Viagem partilhada por {trip.creator_display_name}
          </span>
        </div>

        <h1 className="text-3xl font-bold mb-3">{trip.title}</h1>

        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-6">
          {(trip.start_date || trip.end_date) && (
            <span className="flex items-center gap-1.5">
              <Calendar className="size-4" />
              {formatDateRange(trip.start_date, trip.end_date)}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <MapPin className="size-4" />
            {trip.place_count} lugares
          </span>
          {trip.companions.length > 0 && (
            <span className="flex items-center gap-1.5">
              <Users className="size-4" />
              {trip.companions.length + 1} participantes
            </span>
          )}
        </div>

        {trip.description && (
          <p className="text-foreground/80 leading-relaxed mb-6">{trip.description}</p>
        )}

        {trip.places && trip.places.length > 0 && (
          <div>
            <h2 className="font-semibold mb-3">Lugares</h2>
            <ul className="space-y-1.5">
              {trip.places.map((p) => (
                <li key={p.id} className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                  <PlaceIcon
                    type={p.place_type as PlaceType}
                    size={14}
                    className="mr-1.5 shrink-0 text-muted-foreground"
                    title={getPlaceLabel(p.place_type)}
                  />
                  <span className="font-medium">{p.name_pt ?? p.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {p.country_code ? `· ${p.country_code.toUpperCase()}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
