import { useParams, useNavigate, Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Loader2 } from "lucide-react"
import { usersApi } from "@/lib/api"
import type { TripPublicSummary } from "@/types"

function TripCard({ trip }: { trip: TripPublicSummary }) {
  const dates = [trip.start_date, trip.end_date].filter(Boolean).join(" → ")
  const bg = trip.cover_colour ?? "#7C3AED"
  return (
    <Link
      to={`/viagens/${trip.id}`}
      className="glass-card block hover:ring-2 hover:ring-primary/30 transition-all rounded-xl overflow-hidden"
    >
      <div className="h-24 w-full overflow-hidden" style={trip.cover_image_url ? {} : { backgroundColor: bg }}>
        {trip.cover_image_url
          ? <img src={trip.cover_image_url} alt={trip.title} className="h-full w-full object-cover" />
          : <div className="flex h-full items-end p-3">
              <span className="text-white font-bold text-xs drop-shadow line-clamp-2">{trip.title}</span>
            </div>
        }
      </div>
      <div className="p-3 space-y-0.5">
        <p className="font-medium text-sm truncate">{trip.title}</p>
        {dates && <p className="text-xs text-muted-foreground">{dates}</p>}
        <p className="text-xs text-muted-foreground">
          {trip.place_count} lugar{trip.place_count !== 1 ? "es" : ""}
        </p>
      </div>
    </Link>
  )
}

export default function PublicTripsPage() {
  const { username } = useParams<{ username: string }>()
  const navigate = useNavigate()

  const { data: trips = [], isLoading } = useQuery({
    queryKey: ["public-trips", username],
    queryFn: () => usersApi.publicTrips(username!),
    enabled: !!username,
    staleTime: 2 * 60_000,
  })

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Voltar
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Viagens de @{username}</h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : trips.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem viagens públicas.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {trips.map((t) => <TripCard key={t.id} trip={t} />)}
        </div>
      )}
    </div>
  )
}
