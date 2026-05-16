export type PlaceType =
  | "igreja" | "monumento" | "edificio" | "bairro"
  | "cidade" | "comarca" | "provincia" | "regiao"
  | "pais" | "natureza" | "outro"

export const PLACE_TYPE_LABELS: Record<PlaceType, string> = {
  igreja: "Igreja",
  monumento: "Monumento",
  edificio: "Edifício",
  bairro: "Bairro / Freguesia",
  cidade: "Cidade",
  comarca: "Comarca",
  provincia: "Província",
  regiao: "Região",
  pais: "País",
  natureza: "Natureza",
  outro: "Outro",
}

export const PLACE_TYPE_EMOJI: Record<PlaceType, string> = {
  igreja: "⛪",
  monumento: "🏛️",
  edificio: "🏢",
  bairro: "🏘️",
  cidade: "🏙️",
  comarca: "🗺️",
  provincia: "📍",
  regiao: "📌",
  pais: "🌍",
  natureza: "🌿",
  outro: "🌐",
}

export const PLACE_TYPE_COLOURS: Record<PlaceType, string> = {
  igreja: "#F59E0B",
  monumento: "#8B5CF6",
  edificio: "#64748B",
  bairro: "#14B8A6",
  cidade: "#3B82F6",
  comarca: "#F97316",
  provincia: "#EC4899",
  regiao: "#10B981",
  pais: "#EF4444",
  natureza: "#22C55E",
  outro: "#9CA3AF",
}

export function getPlaceLabel(type: string): string {
  return PLACE_TYPE_LABELS[type as PlaceType] ?? "Outro"
}

export function getPlaceEmoji(type: string): string {
  return PLACE_TYPE_EMOJI[type as PlaceType] ?? "🌐"
}

export function getPlaceColour(type: string): string {
  return PLACE_TYPE_COLOURS[type as PlaceType] ?? "#9CA3AF"
}

export const ALL_PLACE_TYPES: PlaceType[] = [
  "igreja", "monumento", "edificio", "bairro", "cidade",
  "comarca", "provincia", "regiao", "pais", "natureza", "outro",
]
