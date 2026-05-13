import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Map, List, Table2, Flame, Route } from "lucide-react"
import { tripsApi } from "@/lib/api"
import PlaceMap from "@/components/map/PlaceMap"
import { useMapStore, type MapViewMode, type MapStyle } from "@/stores/map"
import { Button } from "@/components/ui/button"
import { PLACE_TYPE_LABELS } from "@/lib/utils"
import type { Place } from "@/types"

export default function MapPage() {
  const { viewMode, setViewMode, style, setStyle, setMarkerColour, markerColour } = useMapStore()
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showRoute, setShowRoute] = useState(false)
  const [_selectedPlace, setSelectedPlace] = useState<Place | null>(null)

  useQuery({ queryKey: ["trips"], queryFn: tripsApi.list })

  // Aggregate all places from all trips (mock — real implementation would fetch places per trip)
  const allPlaces: Place[] = []

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

            {/* Layer controls */}
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

            {/* Marker colour */}
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

        <div className="ml-auto text-sm text-muted-foreground">
          {allPlaces.length} lugares visitados
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        {viewMode === "map" && (
          <PlaceMap
            places={allPlaces}
            onPlaceClick={setSelectedPlace}
            showHeatmap={showHeatmap}
            showRoute={showRoute}
            className="h-full min-h-[500px] w-full rounded-2xl overflow-hidden"
          />
        )}

        {viewMode === "list" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {allPlaces.length === 0 && (
              <div className="col-span-full glass-card p-12 text-center text-muted-foreground">
                <Map className="mx-auto mb-3 size-8 opacity-30" />
                <p className="font-medium">Ainda sem lugares</p>
                <p className="text-sm mt-1">Adiciona lugares às tuas viagens para os ver aqui.</p>
              </div>
            )}
            {allPlaces.map((place) => (
              <button
                key={place.id}
                onClick={() => setSelectedPlace(place)}
                className="glass-card p-4 text-left hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200"
              >
                <p className="font-medium">{place.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {PLACE_TYPE_LABELS[place.place_type]} · {place.country_code}
                </p>
              </button>
            ))}
          </div>
        )}

        {viewMode === "table" && (
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
                {allPlaces.map((place, i) => (
                  <tr
                    key={place.id}
                    onClick={() => setSelectedPlace(place)}
                    className={`cursor-pointer hover:bg-accent/50 transition-colors ${i % 2 === 0 ? "" : "bg-muted/20"}`}
                  >
                    <td className="px-4 py-3 font-medium">{place.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{PLACE_TYPE_LABELS[place.place_type]}</td>
                    <td className="px-4 py-3 text-muted-foreground">{place.country_code}</td>
                    <td className="px-4 py-3 text-muted-foreground">{place.region_name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
