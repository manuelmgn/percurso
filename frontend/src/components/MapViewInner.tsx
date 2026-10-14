import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Geometry } from 'geojson'
import { useTheme } from '@/components/ThemeProvider'
import { useTranslation } from '@/i18n'

const TILE_LAYERS = {
  light: {
    url: '/api/tiles/light/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  dark: {
    url: '/api/tiles/dark/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
} as const

export interface MapMarker {
  id: number | string
  lat: number
  lon: number
  title: string
  subtitle?: string
  href?: string
  color?: string
}

export interface MapPolygon {
  id: number | string
  geojson: Geometry
  title: string
  subtitle?: string
  href?: string
  visited?: boolean
}

interface MapViewInnerProps {
  markers?: MapMarker[]
  polygons?: MapPolygon[]
  variant: 'minimal' | 'detailed'
  height?: string
}

// Brand pin colours, rotating by marker order (spec §6.5): magenta, coral,
// plum. Markers with an explicit color always win.
const MARKER_COLORS = ['#C1075D', '#E06F56', '#6B21A8']

// Polygon styling — edit these values freely to retune the project maps.
// borderWeight: border thickness (same for visited and pending).
// borderColor/fillColor: outline and interior colours for each state.
// fillOpacity: interior opacity (0 = fully transparent, 1 = solid).
export const POLYGON_STYLE = {
  borderWeight: 3,
  visited: { borderColor: '#0284c7', fillColor: '#0284c7', fillOpacity: 0.7 },
  pending: { borderColor: '#f2a5b8', fillColor: '#f2a5b8', fillOpacity: 0.5 },
}

function popupHtml(title: string, subtitle?: string, href?: string, viewPageText = 'Ver ficha'): string {
  let html = `<strong>${title}</strong>`
  if (subtitle) html += `<br><span>${subtitle}</span>`
  if (href) html += `<br><a href="${href}">${viewPageText}</a>`
  return html
}

export default function MapViewInner({
  markers = [],
  polygons = [],
  variant,
  height = '350px',
}: MapViewInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const { resolvedTheme } = useTheme()
  const { t } = useTranslation()

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: variant === 'detailed',
    })

    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    setTimeout(() => map.invalidateSize(), 0)

    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
      tileLayerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Swap the base tile layer when the theme changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const config = TILE_LAYERS[resolvedTheme]
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current)
    tileLayerRef.current = L.tileLayer(config.url, {
      attribution: config.attribution,
      maxZoom: 19,
    }).addTo(map)
  }, [resolvedTheme])

  useEffect(() => {
    const map = mapRef.current
    const group = layerRef.current
    if (!map || !group) return

    group.clearLayers()
    const bounds: L.LatLngExpression[] = []

    for (const [index, marker] of markers.entries()) {
      const color = marker.color || MARKER_COLORS[index % MARKER_COLORS.length]
      L.circleMarker([marker.lat, marker.lon], {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.9,
      })
        .bindPopup(popupHtml(marker.title, marker.subtitle, marker.href, t('map.popup.viewPage')))
        .addTo(group)
      bounds.push([marker.lat, marker.lon])
    }

    for (const polygon of polygons) {
      const style = polygon.visited ? POLYGON_STYLE.visited : POLYGON_STYLE.pending
      const layer = L.geoJSON(polygon.geojson, {
        style: {
          color: style.borderColor,
          weight: POLYGON_STYLE.borderWeight,
          opacity: 1,
          fillColor: style.fillColor,
          fillOpacity: style.fillOpacity,
        },
      })
      layer.bindPopup(popupHtml(polygon.title, polygon.subtitle, polygon.href, t('map.popup.viewPage')))
      group.addLayer(layer)
      const polygonBounds = layer.getBounds()
      if (polygonBounds.isValid()) {
        bounds.push(polygonBounds.getSouthWest(), polygonBounds.getNorthEast())
      }
    }

    if (bounds.length === 0) return

    const latLngBounds = L.latLngBounds(bounds)
    const isSinglePoint = latLngBounds.getSouthWest().equals(latLngBounds.getNorthEast())
    if (isSinglePoint) {
      map.setView(latLngBounds.getCenter(), 10)
    } else {
      map.fitBounds(latLngBounds, { padding: [24, 24] })
    }
  }, [markers, polygons, t])

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="relative z-0 w-full overflow-hidden rounded-card border border-line dark:border-[#322A23]"
      role="application"
      aria-label={t('map.ariaLabel')}
    />
  )
}
