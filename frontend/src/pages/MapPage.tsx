import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, Link } from "react-router-dom"
import { Map, List, Table2, Flame, Route, Loader2, MapPin, Layers } from "lucide-react"
import { usersApi, tripsApi } from "@/lib/api"
import PlaceMap from "@/components/map/PlaceMap"
import { useMapStore, type MapViewMode, type MapStyle } from "@/stores/map"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/utils"
import { getPlaceEmoji, getPlaceLabel } from "@/lib/placeTypes"
import type { VisitedPlace, PlaceSummary } from "@/types"

export default function MapPage() {
  const navigate = useNavigate()
  const { viewMode, setViewMode, style, setStyle, setMarkerColour, markerColour } = useMapStore()
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showRoute, setShowRoute] = useState(false)
  const [colourByType, setColourByType] = useState(false)
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null)
  const [typeFilter, setTypeFilter] = useState("")

  const { data: visitedPlaces = [], isLoading: placesLoading } = useQuery({
    queryKey: ["my-places"],
    queryFn: usersApi.myPlaces,
    staleTime: 30_000,
  })

  const { data: trips = [] } = useQuery({
    queryKey: ["trips"],
    queryFn: tripsApi.list,
    staleTime: 30_000,
  })

  const { data: selectedTrip, isLoading: tripLoading } = useQuery({
    queryKey: ["trip", selectedTripId],
    queryFn: () => tripsApi.get(selectedTripId!),
    enabled: !!selectedTripId,
    staleTime: 30_000,
  })

  const isLoading = placesLoading || (!!selectedTripId && tripLoading)

  const tripPlaces: PlaceSummary[] = selectedTrip?.places ?? []
  const displayPlaces = selectedTripId ? tripPlaces : visitedPlaces
  const placeCount = displayPlaces.length

  // Type filter: compute available types from current display set
  const availableTypes = Array.from(new Set(displayPlaces.map((p) => p.place_type))).sort()
  const filteredPlaces = typeFilter
    ? displayPlaces.filter((p) => p.place_type === typeFilter)
    : displayPlaces

  const viewModes: { mode: MapViewMode; icon: React.ElementType; label: string }[] = [
    { mode: "map", icon: Map, label: "Mapa" },
    { mode: "list", icon: List, label: "Lista" },
    { mode: "table", icon: Table2, label: "Tabela" },
  ]

  const mapStyles: { value: MapStyle; label: string }[] = [
    { value: "light", label: "Claro" },
    { value: "dark", label: "Escuro" },
    { value: "minimal", label: "Minimal" },
  ]

  function handlePlaceClick(id: number) {
    navigate(`/lugares/${id}`)
  }

  function handleTripChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    setSelectedTripId(val ? Number(val) : null)
    setShowRoute(false)
    setTypeFilter("")
  }

  function isVisited(p: VisitedPlace | PlaceSummary): p is VisitedPlace {
    return "visit_count" in p
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header toolbar */}
      <div className="glass border-b border-border/50 px-6 py-3 flex items-center gap-3 flex-wrap">
        <h2 className="text-lg font-semibold mr-2">Os meus lugares</h2>

        {/* View mode toggle */}
        <div className="glass flex rounded-xl p-1 gap-1">
          {viewModes.map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                viewMode === mode
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>

        {viewMode === "map" && (
          <>
            {/* Map style */}
            <div className="glass flex rounded-xl p-1 gap-1">
              {mapStyles.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setStyle(value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    style === value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <Button
              variant={showHeatmap ? "default" : "outline"}
              size="sm"
              onClick={() => setShowHeatmap(!showHeatmap)}
            >
              <Flame className="size-3.5" />
              Mapa de calor
            </Button>

            <Button
              variant={colourByType ? "default" : "outline"}
              size="sm"
              onClick={() => setColourByType(!colourByType)}
              title="Cor dos marcadores por tipo de lugar"
            >
              <Layers className="size-3.5" />
              Marcadores por tipo
            </Button>

            {!colourByType && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Cor dos marcadores</span>
                <input
                  type="color"
                  value={markerColour}
                  onChange={(e) => setMarkerColour(e.target.value)}
                  className="h-6 w-8 cursor-pointer rounded border border-border"
                />
              </label>
            )}
          </>
        )}

        {/* Trip selector — visible in all view modes */}
        <select
          value={selectedTripId ?? ""}
          onChange={handleTripChange}
          className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todas as viagens</option>
          {trips.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>

        {/* Route — only meaningful when a trip is selected */}
        {viewMode === "map" && (
          <Button
            variant={showRoute ? "default" : "outline"}
            size="sm"
            onClick={() => setShowRoute(!showRoute)}
            disabled={!selectedTripId}
            title={!selectedTripId ? "Seleciona uma viagem para ver a rota" : undefined}
          >
            <Route className="size-3.5" />
            Rota
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          {isLoading && <Loader2 className="size-3.5 animate-spin" />}
          {selectedTripId
            ? `${placeCount} lugares na viagem`
            : `${placeCount} lugares visitados`
          }
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {viewMode === "map" && (
          <PlaceMap
            places={displayPlaces}
            onPlaceClick={handlePlaceClick}
            showHeatmap={showHeatmap}
            showRoute={showRoute && !!selectedTripId}
            colourByType={colourByType}
            className="h-full min-h-[500px] w-full"
          />
        )}

        {viewMode === "list" && (
          <div className="p-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {isLoading ? (
              <div className="col-span-full flex justify-center py-16">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              </div>
            ) : displayPlaces.length === 0 ? (
              <div className="col-span-full glass-card p-12 text-center text-muted-foreground">
                <MapPin className="mx-auto mb-3 size-8 opacity-30" />
                <p className="font-medium">
                  {selectedTripId ? "Esta viagem ainda não tem lugares." : "Ainda sem lugares visitados."}
                </p>
                {!selectedTripId && (
                  <p className="text-sm mt-1">Adiciona lugares às tuas viagens para os ver aqui.</p>
                )}
              </div>
            ) : (
              displayPlaces.map((place) => (
                <button
                  key={place.id}
                  onClick={() => handlePlaceClick(place.id)}
                  className="glass-card p-4 text-left hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 space-y-2"
                >
                  <div>
                    <p className="font-medium leading-snug flex items-center gap-2">
                      <span className="text-base shrink-0" title={getPlaceLabel(place.place_type)}>
                        {getPlaceEmoji(place.place_type)}
                      </span>
                      {place.name_pt ?? place.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 pl-6">
                      {getPlaceLabel(place.place_type)}
                      {place.country_code ? ` · ${place.country_code.toUpperCase()}` : ""}
                    </p>
                  </div>
                  {isVisited(place) && (
                    <div className="space-y-1">
                      {place.first_visited && (
                        <p className="text-xs text-muted-foreground">
                          Primeira visita: {formatDate(place.first_visited)}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {place.visit_count} {place.visit_count === 1 ? "viagem" : "viagens"}
                      </p>
                      {place.trips.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {place.trips.slice(0, 3).map((t) => (
                            <Link
                              key={t.id}
                              to={`/viagens/${t.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5 hover:bg-primary/20 transition-colors"
                            >
                              {t.title}
                            </Link>
                          ))}
                          {place.trips.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">+{place.trips.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {viewMode === "table" && (
          <div className="p-6 space-y-3">
            {/* Type filter row */}
            {availableTypes.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Filtrar por tipo:</span>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="rounded-lg border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Todos</option>
                  {availableTypes.map((t) => (
                    <option key={t} value={t}>
                      {getPlaceEmoji(t)} {getPlaceLabel(t)}
                    </option>
                  ))}
                </select>
                {typeFilter && (
                  <button
                    onClick={() => setTypeFilter("")}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Limpar
                  </button>
                )}
              </div>
            )}

            <div className="glass-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border/50">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium text-muted-foreground">Local</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">País</th>
                    {!selectedTripId && (
                      <>
                        <th className="px-4 py-3 font-medium text-muted-foreground">Primeira visita</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">Visitas</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">Viagens</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={selectedTripId ? 3 : 6} className="px-4 py-8 text-center text-muted-foreground">
                        <Loader2 className="size-5 animate-spin mx-auto" />
                      </td>
                    </tr>
                  ) : filteredPlaces.length === 0 ? (
                    <tr>
                      <td colSpan={selectedTripId ? 3 : 6} className="px-4 py-8 text-center text-muted-foreground">
                        {typeFilter
                          ? "Nenhum lugar deste tipo."
                          : selectedTripId
                          ? "Esta viagem ainda não tem lugares."
                          : "Ainda sem lugares visitados."
                        }
                      </td>
                    </tr>
                  ) : (
                    filteredPlaces.map((place, i) => (
                      <tr
                        key={place.id}
                        onClick={() => handlePlaceClick(place.id)}
                        className={`cursor-pointer hover:bg-accent/50 transition-colors ${i % 2 === 0 ? "" : "bg-muted/20"}`}
                      >
                        <td className="px-4 py-3 font-medium">{place.name_pt ?? place.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <span title={getPlaceLabel(place.place_type)}>
                            {getPlaceEmoji(place.place_type)}
                          </span>
                          {" "}
                          {getPlaceLabel(place.place_type)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {place.country_code?.toUpperCase() ?? "—"}
                        </td>
                        {!selectedTripId && isVisited(place) && (
                          <>
                            <td className="px-4 py-3 text-muted-foreground">
                              {place.first_visited ? formatDate(place.first_visited) : "—"}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{place.visit_count}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {place.trips.slice(0, 2).map((t) => (
                                  <Link
                                    key={t.id}
                                    to={`/viagens/${t.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 hover:bg-primary/20 transition-colors whitespace-nowrap"
                                  >
                                    {t.title}
                                  </Link>
                                ))}
                                {place.trips.length > 2 && (
                                  <span className="text-xs text-muted-foreground">+{place.trips.length - 2}</span>
                                )}
                              </div>
                            </td>
                          </>
                        )}
                        {!selectedTripId && !isVisited(place) && (
                          <>
                            <td className="px-4 py-3 text-muted-foreground">—</td>
                            <td className="px-4 py-3 text-muted-foreground">—</td>
                            <td className="px-4 py-3 text-muted-foreground">—</td>
                          </>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
