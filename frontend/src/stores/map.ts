import { create } from "zustand"
import { persist } from "zustand/middleware"

export type MapStyle = "light" | "dark" | "minimal"
export type MapViewMode = "map" | "list" | "table"

interface MapState {
  style: MapStyle
  viewMode: MapViewMode
  markerColour: string
  polygonOpacity: number
  setStyle: (style: MapStyle) => void
  setViewMode: (mode: MapViewMode) => void
  setMarkerColour: (colour: string) => void
  setPolygonOpacity: (opacity: number) => void
}

export const useMapStore = create<MapState>()(
  persist(
    (set) => ({
      style: "light",
      viewMode: "map",
      markerColour: "#7c3aed",
      polygonOpacity: 0.2,
      setStyle: (style) => set({ style }),
      setViewMode: (viewMode) => set({ viewMode }),
      setMarkerColour: (markerColour) => set({ markerColour }),
      setPolygonOpacity: (polygonOpacity) => set({ polygonOpacity }),
    }),
    { name: "percurso-map" },
  ),
)
