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

// Schedule work for when the map is ready; returns a cleanup that cancels if not yet fired.
function whenReady(map: maplibregl.Map, fn: () => void): () => void {
  if (map.loaded()) {
    fn()
    return () => {}
  }
  map.once("load", fn)
  return () => map.off("load", fn)
}

export default function PlaceMap({ places, onPlaceClick, showHeatmap, showRoute, className }: Props) {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const { style, markerColour } = useMapStore()

  // ── Effect 1: initialise map (re-runs only when map style changes) ──────────
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

    return () => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [style])

  // ── Effect 2: update point markers ──────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    function updateMarkers() {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      places
        .filter((p) => p.centroid_lng != null && p.centroid_lat != null)
        .forEach((place) => {
          const el = document.createElement("div")
          el.style.cssText = `
            width: 10px; height: 10px; border-radius: 50%;
            background: ${markerColour}; border: 2px solid white;
            box-shadow: 0 1px 4px rgba(0,0,0,0.35); cursor: pointer;
          `
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([place.centroid_lng!, place.centroid_lat!])
            .setPopup(
              new maplibregl.Popup({ offset: 16, closeButton: false }).setHTML(
                `<div style="font-family:sans-serif;padding:2px 0">
                  <strong style="font-size:13px">${place.name_pt ?? place.name}</strong><br/>
                  <span style="font-size:11px;opacity:.65">${place.place_type}${place.country_code ? " · " + place.country_code.toUpperCase() : ""}</span>
                </div>`,
              ),
            )
            .addTo(map)

          if (onPlaceClick) {
            el.addEventListener("click", (e) => {
              e.stopPropagation()
              onPlaceClick(place)
            })
          }
          markersRef.current.push(marker)
        })
    }

    return whenReady(map, updateMarkers)
  }, [places, markerColour, onPlaceClick])

  // ── Effect 3: heatmap layer ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    function updateHeatmap() {
      if (map.getLayer("heatmap-layer")) map.removeLayer("heatmap-layer")
      if (map.getSource("heatmap-data")) map.removeSource("heatmap-data")
      if (!showHeatmap) return

      const pts = places.filter((p) => p.centroid_lng != null && p.centroid_lat != null)
      if (pts.length === 0) return

      map.addSource("heatmap-data", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: pts.map((p) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [p.centroid_lng!, p.centroid_lat!] },
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
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(124,58,237,0)",
            0.5, "rgba(124,58,237,0.5)",
            1, "rgba(124,58,237,0.9)",
          ],
          "heatmap-radius": 30,
          "heatmap-opacity": 0.7,
        },
      })
    }

    return whenReady(map, updateHeatmap)
  }, [showHeatmap, places])

  // ── Effect 4: route layer ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    function updateRoute() {
      if (map.getLayer("route-layer")) map.removeLayer("route-layer")
      if (map.getSource("route")) map.removeSource("route")
      if (!showRoute) return

      const coords = places
        .filter((p) => p.centroid_lng != null && p.centroid_lat != null)
        .map((p) => [p.centroid_lng!, p.centroid_lat!] as [number, number])
      if (coords.length < 2) return

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

    return whenReady(map, updateRoute)
  }, [showRoute, places, markerColour])

  function exportToPng() {
    if (!mapRef.current) return
    const canvas = mapRef.current.getCanvas()
    const a = document.createElement("a")
    a.download = "percurso-mapa.png"
    a.href = canvas.toDataURL("image/png")
    a.click()
  }

  return (
    <div className="relative h-full">
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
