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
}

function MapLoading({ height }: { height: string }) {
  const { t } = useTranslation()
  return (
    <div
      style={{ height }}
      className="flex w-full items-center justify-center rounded-glass border border-neutral-200 bg-neutral-100 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
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
