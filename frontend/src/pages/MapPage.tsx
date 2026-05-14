import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Map, List, Table2, Flame, Route, Loader2 } from "lucide-react"
import { usersApi } from "@/lib/api"
import PlaceMap from "@/components/map/PlaceMap"
import { useMapStore, type MapViewMode, type MapStyle } from "@/stores/map"
import { Button } from "@/components/ui/button"
import { PLACE_TYPE_LABELS } from "@/lib/utils"
import type { Place } from "@/types"

export default function MapPage() {
  const navigate = useNavigate()
  const { viewMode, setViewMode, style, setStyle, setMarkerColour, markerColour } = useMapStore()
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showRoute, setShowRoute] = useState(false)

  const { data: visitedPlaces = [], isLoading } = useQuery({
    queryKey: ["my-places"],
    queryFn: usersApi.myPlaces,
  })

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

  function handlePlaceClick(place: Place) {
    navigate(`/lugares/${place.id}`)
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
              variant={showRoute ? "default" : "outline"}
              size="sm"
              onClick={() => setShowRoute(!showRoute)}
            >
              <Route className="size-3.5" />
              Rota
            </Button>

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Cor dos marcadores</span>
              <input
                type="color"
                value={markerColour}
                onChange={(e) => setMarkerColour(e.target.value)}
                className="h-6 w-8 cursor-pointer rounded border border-border"
              />
            </label>
          </>
        )}

        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          {isLoading && <Loader2 className="size-3.5 animate-spin" />}
          {visitedPlaces.length} lugares visitados
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {viewMode === "map" && (
          <PlaceMap
            places={visitedPlaces}
            onPlaceClick={handlePlaceClick}
            showHeatmap={showHeatmap}
            showRoute={showRoute}
            className="h-full min-h-[500px] w-full"
          />
        )}

        {viewMode === "list" && (
          <div className="p-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {isLoading ? (
              <div className="col-span-full flex justify-center py-16">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              </div>
            ) : visitedPlaces.length === 0 ? (
              <div className="col-span-full glass-card p-12 text-center text-muted-foreground">
                <Map className="mx-auto mb-3 size-8 opacity-30" />
                <p className="font-medium">Ainda sem lugares</p>
                <p className="text-sm mt-1">Adiciona lugares às tuas viagens para os ver aqui.</p>
              </div>
            ) : (
              visitedPlaces.map((place) => (
                <button
                  key={place.id}
                  onClick={() => handlePlaceClick(place)}
                  className="glass-card p-4 text-left hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200"
                >
                  <p className="font-medium">{place.name_pt ?? place.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {PLACE_TYPE_LABELS[place.place_type]}
                    {place.country_code ? ` · ${place.country_code.toUpperCase()}` : ""}
                  </p>
                  {place.region_name && (
                    <p className="text-xs text-muted-foreground">{place.region_name}</p>
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {viewMode === "table" && (
          <div className="p-6">
            <div className="glass-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border/50">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium text-muted-foreground">Local</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">País</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Região</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                        <Loader2 className="size-5 animate-spin mx-auto" />
                      </td>
                    </tr>
                  ) : visitedPlaces.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                        Ainda sem lugares visitados.
                      </td>
                    </tr>
                  ) : (
                    visitedPlaces.map((place, i) => (
                      <tr
                        key={place.id}
                        onClick={() => handlePlaceClick(place)}
                        className={`cursor-pointer hover:bg-accent/50 transition-colors ${i % 2 === 0 ? "" : "bg-muted/20"}`}
                      >
                        <td className="px-4 py-3 font-medium">{place.name_pt ?? place.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{PLACE_TYPE_LABELS[place.place_type]}</td>
                        <td className="px-4 py-3 text-muted-foreground">{place.country_code?.toUpperCase() ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{place.region_name ?? "—"}</td>
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
