import type { LucideProps } from "lucide-react"
import {
  Beer, Coffee, Utensils, Popcorn, Hospital, GraduationCap,
  Church, Landmark, Hotel, Castle, Building2, Store,
  TreeDeciduous, Waves, Sun, MountainSnow, Flower2,
  Map, MapPinned, MapPin, LandPlot, Fence, TreePalm, Square, Pin,
} from "lucide-react"
import type { PlaceType, PlaceCategory } from "@/lib/placeTypes"

type IconComponent = React.ComponentType<LucideProps>

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

interface PlaceIconProps extends LucideProps {
  type: PlaceType | string
}

interface CategoryIconProps extends LucideProps {
  category: PlaceCategory | string
}

export function PlaceIcon({ type, ...props }: PlaceIconProps) {
  const Icon = TYPE_ICONS[type as PlaceType] ?? Pin
  return <Icon {...props} />
}

export function PlaceCategoryIcon({ category, ...props }: CategoryIconProps) {
  const Icon = CATEGORY_ICONS[category as PlaceCategory] ?? Pin
  return <Icon {...props} />
}
