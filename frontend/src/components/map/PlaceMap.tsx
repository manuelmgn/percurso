import { useEffect, useRef, useState } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { useMapStore } from "@/stores/map"
import { getPlaceLabel, getPlaceColour, getCategoryColour, POLYGON_PLACE_TYPES } from "@/lib/placeTypes"

const MAP_STYLES = {
  light: import.meta.env.VITE_MAP_STYLE_LIGHT ?? "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
  dark: import.meta.env.VITE_MAP_STYLE_DARK ?? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  minimal: import.meta.env.VITE_MAP_STYLE_MINIMAL ?? "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
}

export interface MapPlace {
  id: number
  osm_id?: number
  name: string
  name_pt: string | null
  place_type: string
  country_code: string | null
  centroid_lng: number | null
  centroid_lat: number | null
  geometry_geojson?: Record<string, unknown> | null
  visit_count?: number
  first_visited?: string | null
  dimmed?: boolean
}

interface Props {
  places: MapPlace[]
  onPlaceClick?: (osmId: number) => void
  showHeatmap?: boolean
  showRoute?: boolean
  colourByType?: boolean
  fitBounds?: boolean
  className?: string
}

function whenReady(map: maplibregl.Map, fn: () => void): () => void {
  if (map.loaded()) {
    fn()
    return () => {}
  }
  let called = false
  const run = () => { if (!called) { called = true; fn() } }
  // `load` fires after style + glyphs are ready; `error` fires on style fetch failure.
  // Guard with `called` so only one path wins.
  map.once("load", run)
  map.once("error", run)
  return () => { map.off("load", run); map.off("error", run) }
}

export default function PlaceMap({ places, onPlaceClick, showHeatmap, showRoute, colourByType, fitBounds, className }: Props) {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const polygonLayerIdsRef = useRef<string[]>([])
  const { style, markerColour } = useMapStore()
  const [polygonAsPointIds, setPolygonAsPointIds] = useState<Set<number>>(new Set())

  // ── Effect 1: initialise map ─────────────────────────────────────────────────
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
      polygonLayerIdsRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [style])

  // ── Effect 2: render point markers and polygon fill layers ───────────────────
  useEffect(() => {
    const _map = mapRef.current
    if (!_map) return
    const map: maplibregl.Map = _map

    function getColour(place: MapPlace): string {
      if (place.dimmed) return "#9CA3AF"
      if (colourByType) return getPlaceColour(place.place_type)
      return getCategoryColour(place.place_type)
    }

    function buildPopupHtml(place: MapPlace, colour: string, idx?: number): string {
      const label = getPlaceLabel(place.place_type)
      const displayName = place.name_pt ?? place.name
      const countryPart = place.country_code ? ` · ${place.country_code.toUpperCase()}` : ""
      const visitPart = place.visit_count != null
        ? `<br/><span style="font-size:10px;opacity:.55">${place.visit_count} ${place.visit_count === 1 ? "viagem" : "viagens"}${place.first_visited ? ` · desde ${place.first_visited.slice(0, 4)}` : ""}</span>`
        : ""
      const detailLink = place.osm_id
        ? `<br/><a href="/lugares/${place.osm_id}" style="font-size:10px;color:${colour}">Ver detalhes →</a>`
        : ""
      const orderBadge = showRoute && idx != null
        ? `<span style="font-size:10px;font-weight:600;background:${colour};color:#fff;border-radius:9999px;padding:1px 6px;margin-right:4px">${idx + 1}</span>`
        : ""
      return `<div style="font-family:sans-serif;padding:2px 0;min-width:140px">
        ${orderBadge}<strong style="font-size:13px">${displayName}</strong><br/>
        <span style="font-size:11px;opacity:.65">${label}${countryPart}</span>
        ${visitPart}${detailLink}
      </div>`
    }

    function updateAll() {
      // Clear existing markers
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []

      // Clear existing polygon layers/sources
      polygonLayerIdsRef.current.forEach((id) => {
        if (map.getLayer(`${id}-fill`)) map.removeLayer(`${id}-fill`)
        if (map.getLayer(`${id}-outline`)) map.removeLayer(`${id}-outline`)
        if (map.getSource(id)) map.removeSource(id)
      })
      polygonLayerIdsRef.current = []

      let pointIdx = 0

      places.forEach((place) => {
        const colour = getColour(place)
        const isPolygon = POLYGON_PLACE_TYPES.has(place.place_type as never)
          && place.geometry_geojson != null
          && !polygonAsPointIds.has(place.id)

        if (isPolygon) {
          const sourceId = `poly-${place.id}`
          polygonLayerIdsRef.current.push(sourceId)

          // Guard against duplicate sources (can occur on rapid re-renders)
          if (map.getSource(sourceId)) {
            if (map.getLayer(`${sourceId}-fill`)) map.removeLayer(`${sourceId}-fill`)
            if (map.getLayer(`${sourceId}-outline`)) map.removeLayer(`${sourceId}-outline`)
            map.removeSource(sourceId)
          }

          map.addSource(sourceId, {
            type: "geojson",
            data: {
              type: "Feature",
              geometry: place.geometry_geojson as never,
              properties: {},
            },
          })
          map.addLayer({
            id: `${sourceId}-fill`,
            type: "fill",
            source: sourceId,
            paint: { "fill-color": colour, "fill-opacity": 0.12 },
          })
          map.addLayer({
            id: `${sourceId}-outline`,
            type: "line",
            source: sourceId,
            paint: { "line-color": colour, "line-width": 1.5, "line-opacity": 0.7 },
          })

          map.on("click", `${sourceId}-fill`, (e) => {
            const popupHtml = buildPopupHtml(place, colour)
              + (place.id
                ? `<br/><button
                    data-view-as-point="${place.id}"
                    style="margin-top:4px;font-size:10px;color:${colour};background:none;border:none;cursor:pointer;padding:0">
                    Ver como ponto
                  </button>`
                : "")
            const popup = new maplibregl.Popup({ closeButton: false })
              .setLngLat(e.lngLat)
              .setHTML(popupHtml)
              .addTo(map)

            // Attach the "Ver como ponto" button after popup is in DOM
            const btn = popup.getElement()?.querySelector<HTMLButtonElement>(`[data-view-as-point="${place.id}"]`)
            btn?.addEventListener("click", () => {
              setPolygonAsPointIds((prev) => new Set([...prev, place.id]))
              popup.remove()
            })
          })
          map.on("mouseenter", `${sourceId}-fill`, () => { map.getCanvas().style.cursor = "pointer" })
          map.on("mouseleave", `${sourceId}-fill`, () => { map.getCanvas().style.cursor = "" })
        } else {
          // Render as a point marker (for all point types and polygon-as-point overrides)
          if (place.centroid_lng == null || place.centroid_lat == null) return
          const idx = showRoute ? pointIdx++ : undefined

          const el = document.createElement("div")
          el.style.cssText = `
            width: 10px; height: 10px; border-radius: 50%;
            background: ${colour}; border: 2px solid white;
            box-shadow: 0 1px 4px rgba(0,0,0,0.35); cursor: pointer;
          `
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([place.centroid_lng, place.centroid_lat])
            .setPopup(
              new maplibregl.Popup({ offset: 16, closeButton: false })
                .setHTML(buildPopupHtml(place, colour, idx)),
            )
            .addTo(map)

          if (onPlaceClick && place.osm_id) {
            el.addEventListener("click", (e) => {
              e.stopPropagation()
              onPlaceClick(place.osm_id!)
            })
          }
          markersRef.current.push(marker)
        }
      })

      if (fitBounds && places.length > 0) {
        const bounds = new maplibregl.LngLatBounds()
        let hasBounds = false
        places.forEach((place) => {
          if (place.centroid_lng != null && place.centroid_lat != null) {
            bounds.extend([place.centroid_lng, place.centroid_lat])
            hasBounds = true
          }
        })
        if (hasBounds) {
          map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 0 })
        }
      }
    }

    return whenReady(map, updateAll)
  }, [places, colourByType, fitBounds, markerColour, onPlaceClick, showRoute, polygonAsPointIds, style])

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
  }, [showHeatmap, places, style])

  // ── Effect 4: route line layer ───────────────────────────────────────────────
  useEffect(() => {
    const _map = mapRef.current
    if (!_map) return
    const map: maplibregl.Map = _map

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
  }, [showRoute, places, markerColour, style])

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
