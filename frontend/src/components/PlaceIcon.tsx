import {
  Beer, Coffee, Utensils, Popcorn, Hospital, GraduationCap,
  Church, Landmark, Hotel, Castle, Building2, Store,
  TreeDeciduous, Waves, Sun, MountainSnow, Flower2,
  Map, MapPinned, MapPin, LandPlot, Fence, TreePalm, Square, Pin,
} from "lucide-react"
import type { PlaceType, PlaceCategory } from "@/lib/placeTypes"

type IconComponent = React.ComponentType<{ size?: number; className?: string; title?: string }>

const TYPE_ICONS: Record<PlaceType, IconComponent> = {
  bar: Beer,
  cafe: Coffee,
  restaurante: Utensils,
  teatro: Popcorn,
  hospital: Hospital,
  escola: GraduationCap,
  templo: Church,
  museu: Landmark,
  hotel: Hotel,
  castelo: Castle,
  monumento: Landmark,
  edificio: Building2,
  tenda: Store,
  natureza: TreeDeciduous,
  auga: Waves,
  praia: Sun,
  montanha: MountainSnow,
  parque: Flower2,
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

const CATEGORY_ICONS: Record<PlaceCategory, IconComponent> = {
  edificios: Building2,
  natureza: Flower2,
  territorios: MapPin,
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
  const Icon = TYPE_ICONS[type as PlaceType] ?? Pin
  return <Icon size={size} className={className} title={title} />
}

export function PlaceCategoryIcon({ category, size, className, title }: CategoryIconProps) {
  const Icon = CATEGORY_ICONS[category as PlaceCategory] ?? Pin
  return <Icon size={size} className={className} title={title} />
}
