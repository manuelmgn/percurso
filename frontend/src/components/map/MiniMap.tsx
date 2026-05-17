import { useNavigate } from "react-router-dom"
import PlaceMap, { type MapPlace } from "./PlaceMap"

interface Props {
  places: MapPlace[]
  className?: string
}

export default function MiniMap({ places, className }: Props) {
  const navigate = useNavigate()

  if (places.length === 0) return null

  return (
    <PlaceMap
      places={places}
      fitBounds
      colourByType
      onPlaceClick={(osmId) => navigate(`/lugares/${osmId}`)}
      className={className ?? "h-72 w-full rounded-2xl overflow-hidden"}
    />
  )
}
