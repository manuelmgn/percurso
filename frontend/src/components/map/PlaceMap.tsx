import { useEffect, useRef } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { useMapStore } from "@/stores/map"
import type { Place } from "@/types"

const MAP_STYLES = {
  light: import.meta.env.VITE_MAP_STYLE_LIGHT ?? "https://tiles.openfreemap.org/styles/liberty",
  dark: import.meta.env.VITE_MAP_STYLE_DARK ?? "https://tiles.openfreemap.org/styles/dark",
  minimal: import.meta.env.VITE_MAP_STYLE_MINIMAL ?? "https://tiles.openfreemap.org/styles/positron",
}

interface Props {
  places: Place[]
  onPlaceClick?: (place: Place) => void
  showHeatmap?: boolean
  showRoute?: boolean
  className?: string
}

export default function PlaceMap({ places, onPlaceClick, showHeatmap, showRoute, className }: Props) {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { style, markerColour, polygonOpacity } = useMapStore()

  useEffect(() => {
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLES[style],
      center: [-8.0, 39.5],
      zoom: 6,
    })

    map.addControl(new maplibregl.NavigationControl(), "top-right")
    map.addControl(new maplibregl.ScaleControl(), "bottom-left")

    mapRef.current = map

    map.on("load", () => {
      // Add point places as markers
      const pointPlaces = places.filter((p) => p.centroid_lng != null && !p.has_polygon)
      pointPlaces.forEach((place) => {
        const marker = new maplibregl.Marker({ color: markerColour })
          .setLngLat([place.centroid_lng!, place.centroid_lat!])
          .setPopup(
            new maplibregl.Popup({ offset: 25 }).setHTML(
              `<div class="font-sans"><strong>${place.name}</strong><br/><span class="text-xs opacity-70">${place.place_type}</span></div>`,
            ),
          )
          .addTo(map)

        if (onPlaceClick) {
          marker.getElement().addEventListener("click", () => onPlaceClick(place))
        }
      })

      // Heatmap layer
      if (showHeatmap && pointPlaces.length > 0) {
        map.addSource("heatmap-data", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: pointPlaces.map((p) => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: [p.centroid_lng!, p.centroid_lat!] },
              properties: {},
            })),
          },
        })
        map.addLayer({
          id: "heatmap-layer",
          type: "heatmap",
          source: "heatmap-data",
          paint: {
            "heatmap-color": [
              "interpolate",
              ["linear"],
              ["heatmap-density"],
              0, "rgba(124,58,237,0)",
              0.5, "rgba(124,58,237,0.5)",
              1, "rgba(124,58,237,0.9)",
            ],
            "heatmap-radius": 30,
            "heatmap-opacity": 0.7,
          },
        })
      }

      // Route line
      if (showRoute && pointPlaces.length > 1) {
        const coords = pointPlaces.map((p) => [p.centroid_lng!, p.centroid_lat!] as [number, number])
        map.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: { type: "LineString", coordinates: coords },
            properties: {},
          },
        })
        map.addLayer({
          id: "route-layer",
          type: "line",
          source: "route",
          paint: {
            "line-color": markerColour,
            "line-width": 2.5,
            "line-opacity": 0.8,
            "line-dasharray": [2, 1],
          },
        })
      }
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [style, markerColour, polygonOpacity])

  // Export to PNG
  function exportToPng() {
    if (!mapRef.current) return
    const canvas = mapRef.current.getCanvas()
    const link = document.createElement("a")
    link.download = "percurso-mapa.png"
    link.href = canvas.toDataURL("image/png")
    link.click()
  }

  return (
    <div className="relative">
      <div ref={containerRef} className={className ?? "h-[500px] w-full rounded-2xl overflow-hidden"} />
      <button
        onClick={exportToPng}
        className="glass absolute bottom-4 right-4 rounded-xl px-3 py-2 text-xs font-medium hover:bg-white/90 dark:hover:bg-white/10 transition-all"
        title="Exportar como PNG"
      >
        Exportar PNG
      </button>
    </div>
  )
}
