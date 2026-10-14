import { lazy, Suspense } from 'react'
import { useTranslation } from '@/i18n'
import type { MapMarker, MapPolygon } from './MapViewInner'

const MapViewInner = lazy(() => import('./MapViewInner'))

export type { MapMarker, MapPolygon }

interface MapViewProps {
  markers?: MapMarker[]
  polygons?: MapPolygon[]
  variant: 'minimal' | 'detailed'
  height?: string
  connectMarkers?: boolean
}

function MapLoading({ height }: { height: string }) {
  const { t } = useTranslation()
  return (
    <div
      style={{ height }}
      className="flex w-full items-center justify-center rounded-card border border-line bg-surface text-sm text-muted dark:border-[#322A23] dark:bg-[#221D18]"
      role="status"
    >
      {t('map.loading')}
    </div>
  )
}

export function MapView(props: MapViewProps) {
  const height = props.height || '350px'
  return (
    <Suspense fallback={<MapLoading height={height} />}>
      <MapViewInner {...props} />
    </Suspense>
  )
}
