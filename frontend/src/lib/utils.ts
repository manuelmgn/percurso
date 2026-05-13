import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ""
  return new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(dateStr),
  )
}

export function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return ""
  const fmt = (d: string) =>
    new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "short" }).format(new Date(d))
  if (!end) return fmt(start)
  return `${fmt(start)} – ${fmt(end)}`
}

export const VISIBILITY_LABELS: Record<string, string> = {
  public: "Público",
  private: "Privado",
  link: "Partilhado por link",
  users: "Utilizadores específicos",
}

export const PLACE_TYPE_LABELS: Record<string, string> = {
  building: "Edifício",
  landmark: "Marco",
  monument: "Monumento",
  parish: "Freguesia/Parróquia",
  neighbourhood: "Bairro",
  city: "Cidade",
  town: "Vila",
  village: "Aldeia",
  comarca: "Comarca",
  province: "Província",
  region: "Região",
  country: "País",
}
