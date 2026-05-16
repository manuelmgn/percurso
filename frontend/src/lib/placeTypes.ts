export type PlaceType =
  | "bar" | "cafe" | "restaurante" | "teatro" | "hospital"
  | "escola" | "templo" | "museu" | "hotel" | "castelo"
  | "monumento" | "edificio" | "tenda"
  | "natureza" | "auga" | "praia" | "montanha" | "parque"
  | "pais" | "regiao" | "provincia" | "comarca" | "cidade"
  | "bairro" | "ilha" | "limite" | "outro"

export type PlaceCategory = "edificios" | "natureza" | "territorios" | "outro"

export const PLACE_TYPE_LABELS: Record<PlaceType, string> = {
  bar: "Bar",
  cafe: "Café",
  restaurante: "Restaurante",
  teatro: "Teatro",
  hospital: "Hospital",
  escola: "Escola",
  templo: "Templo",
  museu: "Museu",
  hotel: "Hotel",
  castelo: "Castelo",
  monumento: "Monumento",
  edificio: "Edifício",
  tenda: "Loja",
  natureza: "Natureza",
  auga: "Água",
  praia: "Praia",
  montanha: "Montanha",
  parque: "Parque",
  pais: "País",
  regiao: "Região",
  provincia: "Província",
  comarca: "Comarca",
  cidade: "Cidade",
  bairro: "Bairro",
  ilha: "Ilha",
  limite: "Limite administrativo",
  outro: "Outro",
}

export const PLACE_CATEGORY_LABELS: Record<PlaceCategory, string> = {
  edificios: "Edifícios",
  natureza: "Espaços Naturais",
  territorios: "Territórios",
  outro: "Outro",
}

export const PLACE_TYPE_CATEGORY: Record<PlaceType, PlaceCategory> = {
  bar: "edificios",
  cafe: "edificios",
  restaurante: "edificios",
  teatro: "edificios",
  hospital: "edificios",
  escola: "edificios",
  templo: "edificios",
  museu: "edificios",
  hotel: "edificios",
  castelo: "edificios",
  monumento: "edificios",
  edificio: "edificios",
  tenda: "edificios",
  natureza: "natureza",
  auga: "natureza",
  praia: "natureza",
  montanha: "natureza",
  parque: "natureza",
  pais: "territorios",
  regiao: "territorios",
  provincia: "territorios",
  comarca: "territorios",
  cidade: "territorios",
  bairro: "territorios",
  ilha: "territorios",
  limite: "territorios",
  outro: "outro",
}

export const PLACE_TYPE_COLOURS: Record<PlaceType, string> = {
  bar: "#F97316",
  cafe: "#B45309",
  restaurante: "#EF4444",
  teatro: "#EC4899",
  hospital: "#14B8A6",
  escola: "#3B82F6",
  templo: "#8B5CF6",
  museu: "#A855F7",
  hotel: "#F59E0B",
  castelo: "#6B7280",
  monumento: "#64748B",
  edificio: "#94A3B8",
  tenda: "#D97706",
  natureza: "#22C55E",
  auga: "#0EA5E9",
  praia: "#FBBF24",
  montanha: "#9CA3AF",
  parque: "#4ADE80",
  pais: "#EF4444",
  regiao: "#F97316",
  provincia: "#EAB308",
  comarca: "#84CC16",
  cidade: "#3B82F6",
  bairro: "#06B6D4",
  ilha: "#10B981",
  limite: "#94A3B8",
  outro: "#9CA3AF",
}

export function getPlaceLabel(type: string): string {
  return PLACE_TYPE_LABELS[type as PlaceType] ?? "Outro"
}

export function getPlaceCategory(type: string): PlaceCategory {
  return PLACE_TYPE_CATEGORY[type as PlaceType] ?? "outro"
}

export function getPlaceCategoryLabel(type: string): string {
  const cat = getPlaceCategory(type)
  return PLACE_CATEGORY_LABELS[cat]
}

export function getPlaceColour(type: string): string {
  return PLACE_TYPE_COLOURS[type as PlaceType] ?? "#9CA3AF"
}

export const ALL_PLACE_TYPES: PlaceType[] = [
  "bar", "cafe", "restaurante", "teatro", "hospital", "escola",
  "templo", "museu", "hotel", "castelo", "monumento", "edificio", "tenda",
  "natureza", "auga", "praia", "montanha", "parque",
  "pais", "regiao", "provincia", "comarca", "cidade", "bairro", "ilha", "limite",
  "outro",
]
