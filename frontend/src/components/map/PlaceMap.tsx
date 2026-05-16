import { useEffect, useRef } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { useMapStore } from "@/stores/map"
import { getPlaceEmoji, getPlaceLabel, getPlaceColour } from "@/lib/placeTypes"

const MAP_STYLES = {
  light: import.meta.env.VITE_MAP_STYLE_LIGHT ?? "https://tiles.openfreemap.org/styles/liberty",
  dark: import.meta.env.VITE_MAP_STYLE_DARK ?? "https://tiles.openfreemap.org/styles/dark",
  minimal: import.meta.env.VITE_MAP_STYLE_MINIMAL ?? "https://tiles.openfreemap.org/styles/positron",
}

// Minimal interface satisfied by both Place and PlaceSummary (after adding centroid fields)
export interface MapPlace {
  id: number
  name: string
  name_pt: string | null
  place_type: string
  country_code: string | null
  centroid_lng: number | null
  centroid_lat: number | null
}

interface Props {
  places: MapPlace[]
  onPlaceClick?: (id: number) => void
  showHeatmap?: boolean
  showRoute?: boolean
  colourByType?: boolean
  className?: string
}

function whenReady(map: maplibregl.Map, fn: () => void): () => void {
  if (map.loaded()) {
    fn()
    return () => {}
  }
  map.once("load", fn)
  return () => map.off("load", fn)
}

export default function PlaceMap({ places, onPlaceClick, showHeatmap, showRoute, colourByType, className }: Props) {
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
    const _map = mapRef.current
    if (!_map) return
    const map: maplibregl.Map = _map

    function updateMarkers() {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      places
        .filter((p) => p.centroid_lng != null && p.centroid_lat != null)
        .forEach((place, idx) => {
          const colour = colourByType ? getPlaceColour(place.place_type) : markerColour
          const el = document.createElement("div")
          el.style.cssText = `
            width: 10px; height: 10px; border-radius: 50%;
            background: ${colour}; border: 2px solid white;
            box-shadow: 0 1px 4px rgba(0,0,0,0.35); cursor: pointer;
          `
          const emoji = getPlaceEmoji(place.place_type)
          const label = getPlaceLabel(place.place_type)
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([place.centroid_lng!, place.centroid_lat!])
            .setPopup(
              new maplibregl.Popup({ offset: 16, closeButton: false }).setHTML(
                `<div style="font-family:sans-serif;padding:2px 0">
                  ${showRoute ? `<span style="font-size:10px;font-weight:600;background:${colour};color:#fff;border-radius:9999px;padding:1px 6px;margin-right:4px">${idx + 1}</span>` : ""}
                  <strong style="font-size:13px">${place.name_pt ?? place.name}</strong><br/>
                  <span style="font-size:11px;opacity:.65">${emoji} ${label}${place.country_code ? " · " + place.country_code.toUpperCase() : ""}</span>
                </div>`,
              ),
            )
            .addTo(map)

          if (onPlaceClick) {
            el.addEventListener("click", (e) => {
              e.stopPropagation()
              onPlaceClick(place.id)
            })
          }
          markersRef.current.push(marker)
        })
    }

    return whenReady(map, updateMarkers)
  }, [places, markerColour, colourByType, onPlaceClick, showRoute])

  // ── Effect 3: heatmap layer ──────────────────────────────────────────────────
  useEffect(() => {
    const _map = mapRef.current
    if (!_map) return
    const map: maplibregl.Map = _map

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

  // ── Effect 4: route line layer ───────────────────────────────────────────────
  useEffect(() => {
    const _map = mapRef.current
    if (!_map) return
    const map: maplibregl.Map = _map

    function updateRoute() {
      if (map.getLayer("route-layer")) map.removeLayer("route-layer")
      if (map.getLayer("route-arrows")) map.removeLayer("route-arrows")
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
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": markerColour,
          "line-width": 2.5,
          "line-opacity": 0.85,
          "line-dasharray": [2, 1.5],
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
