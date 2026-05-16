import { useParams, useNavigate, Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Loader2, Globe, Calendar, MapPin } from "lucide-react"
import { placesApi } from "@/lib/api"
import { getPlaceLabel } from "@/lib/placeTypes"
import { PlaceIcon } from "@/components/PlaceIcon"
import { formatDate } from "@/lib/utils"
import type { PlaceType } from "@/types"

const LANG_LABELS: Record<string, string> = {
  pt: "Português",
  gl: "Galego",
  en: "Inglês",
  es: "Espanhol",
}

export default function PlaceDetailPage() {
  const { osmId } = useParams<{ osmId: string }>()
  const placeOsmId = Number(osmId)
  const navigate = useNavigate()

  const { data: place, isLoading } = useQuery({
    queryKey: ["place", placeOsmId],
    queryFn: () => placesApi.get(placeOsmId),
    enabled: !!placeOsmId,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!place) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Local não encontrado.</p>
      </div>
    )
  }

  const displayName = place.name_pt ?? place.name

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Voltar
      </button>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{displayName}</h1>
        {place.name_pt && place.name !== place.name_pt && (
          <p className="text-sm text-muted-foreground mt-0.5">{place.name}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            <PlaceIcon type={place.place_type as PlaceType} size={14} />
            {getPlaceLabel(place.place_type)}
          </span>
          {place.country_code && (
            <span className="text-sm text-muted-foreground">{place.country_code.toUpperCase()}</span>
          )}
          {place.region_name && (
            <span className="text-sm text-muted-foreground">{place.region_name}</span>
          )}
        </div>
      </div>

      {/* Coordinates */}
      {place.centroid_lat != null && place.centroid_lng != null && (
        <div className="glass-card p-4 text-sm text-muted-foreground font-mono">
          {place.centroid_lat.toFixed(5)}, {place.centroid_lng.toFixed(5)}
        </div>
      )}

      {/* Trips that include this place */}
      {place.place_trips.length > 0 && (
        <div className="glass-card p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Calendar className="size-4 text-muted-foreground" />
            Viagens com este lugar
          </h2>
          <ul className="space-y-2">
            {place.place_trips.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/viagens/${t.id}`}
                  className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-accent/50 transition-colors group"
                >
                  <span className="font-medium group-hover:text-primary transition-colors">{t.title}</span>
                  {(t.start_date || t.end_date) && (
                    <span className="text-xs text-muted-foreground">
                      {t.start_date ? formatDate(t.start_date) : ""}
                      {t.start_date && t.end_date ? " – " : ""}
                      {t.end_date ? formatDate(t.end_date) : ""}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Wikipedia summary */}
      {place.wikipedia_summary ? (
        <div className="glass-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Sobre este lugar</h2>
            {place.wikipedia_language && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Globe className="size-3" />
                {LANG_LABELS[place.wikipedia_language] ?? place.wikipedia_language}
              </span>
            )}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {place.wikipedia_summary}
          </p>
          {place.wikipedia_title && (
            <a
              href={`https://${place.wikipedia_language ?? "pt"}.wikipedia.org/wiki/${encodeURIComponent(place.wikipedia_title)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Globe className="size-3" />
              Ver artigo completo na Wikipédia
            </a>
          )}
        </div>
      ) : (
        <div className="glass-card p-5 text-center text-sm text-muted-foreground">
          <MapPin className="mx-auto mb-2 size-6 opacity-30" />
          <p>Sem informação da Wikipédia disponível para este lugar.</p>
        </div>
      )}
    </div>
  )
}
