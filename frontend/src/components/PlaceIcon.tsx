import {
  Beer, Coffee, Utensils, Popcorn, Hospital, GraduationCap,
  Church, Amphora, Hotel, Castle, Landmark, Building, Store,
  TreeDeciduous, Waves, Sun, MountainSnow, Flower,
  Map, MapPinned, LandPlot, MapPin, Fence, TreePalm,
  Square, Pin, Hexagon,
  type LucideIcon,
} from "lucide-react"
import type { PlaceType, PlaceCategory } from "@/lib/placeTypes"

const PLACE_TYPE_ICON_MAP: Record<PlaceType, LucideIcon> = {
  bar: Beer,
  cafe: Coffee,
  restaurante: Utensils,
  teatro: Popcorn,
  hospital: Hospital,
  escola: GraduationCap,
  templo: Church,
  museu: Amphora,
  hotel: Hotel,
  castelo: Castle,
  monumento: Landmark,
  edificio: Building,
  tenda: Store,
  natureza: TreeDeciduous,
  auga: Waves,
  praia: Sun,
  montanha: MountainSnow,
  parque: Flower,
  pais: Map,
  regiao: MapPinned,
  provincia: LandPlot,
  comarca: LandPlot,
  cidade: MapPin,
  bairro: Fence,
  ilha: TreePalm,
  limite: Square,
  outro: Pin,
}

const PLACE_CATEGORY_ICON_MAP: Record<PlaceCategory, LucideIcon> = {
  edificios: Building,
  natureza: Flower,
  territorios: Hexagon,
  outro: Pin,
}

interface PlaceIconProps {
  type: PlaceType | string
  size?: number
  className?: string
  title?: string
}

interface CategoryIconProps {
  category: PlaceCategory | string
  size?: number
  className?: string
  title?: string
}

export function PlaceIcon({ type, size, className, title }: PlaceIconProps) {
  const IconComponent = PLACE_TYPE_ICON_MAP[type as PlaceType] ?? Pin
  return <IconComponent size={size} className={className} title={title} />
}

export function PlaceCategoryIcon({ category, size, className, title }: CategoryIconProps) {
  const IconComponent = PLACE_CATEGORY_ICON_MAP[category as PlaceCategory] ?? Pin
  return <IconComponent size={size} className={className} title={title} />
}
