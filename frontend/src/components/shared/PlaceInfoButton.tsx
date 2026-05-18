import { useState, useRef, useEffect } from "react"
import { Info, ExternalLink } from "lucide-react"
import { PlaceIcon } from "@/components/PlaceIcon"
import { PLACE_TYPE_LABELS, getPlaceCategoryLabel } from "@/lib/placeTypes"
import type { PlaceType } from "@/types"

export interface PlaceInfoData {
  osm_id: number
  osm_type?: string
  name: string
  display_name?: string
  name_pt?: string | null
  place_type: PlaceType
  place_type_label?: string
  country_code?: string | null
  region_name?: string | null
  centroid_lng?: number | null
  centroid_lat?: number | null
  wikipedia_summary?: string | null
  wikipedia_title?: string | null
  wikipedia_language?: string | null
  visit_count?: number
  first_visited?: string | null
}

function resolveCountryName(code: string): string {
  try {
    return new Intl.DisplayNames(["pt-PT"], { type: "region" }).of(code.toUpperCase()) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

function formatCoord(val: number, posDir: string, negDir: string): string {
  return `${Math.abs(val).toFixed(4)}° ${val >= 0 ? posDir : negDir}`
}

function formatVisitDate(d: string): string {
  return new Date(d).toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" })
}

export function PlaceInfoButton({
  place,
  align = "right",
}: {
  place: PlaceInfoData
  align?: "left" | "right"
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [open])

  const displayName = place.display_name ?? place.name_pt ?? place.name
  const typeLabel = place.place_type_label ?? PLACE_TYPE_LABELS[place.place_type] ?? place.place_type
  const categoryLabel = getPlaceCategoryLabel(place.place_type)
  const country = place.country_code ? resolveCountryName(place.country_code) : null
  const osmUrl = place.osm_type
    ? `https://www.openstreetmap.org/${place.osm_type}/${place.osm_id}`
    : null
  const wikiUrl =
    place.wikipedia_title && place.wikipedia_language
      ? `https://${place.wikipedia_language}.wikipedia.org/wiki/${encodeURIComponent(place.wikipedia_title)}`
      : null

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className={`rounded p-1 transition-colors ${open ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        title="Informações do lugar"
      >
        <Info className="size-3.5" />
      </button>

      {open && (
        <div
          className={`absolute top-full z-30 mt-1 w-72 rounded-xl border bg-background p-3.5 shadow-xl text-xs space-y-2.5 ${align === "right" ? "right-0" : "left-0"}`}
        >
          <p className="font-semibold text-sm leading-snug">{displayName}</p>

          <div className="space-y-1 text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <PlaceIcon type={place.place_type} size={12} className="shrink-0" />
              <span>{typeLabel}</span>
            </div>
            <p className="pl-[18px]">{categoryLabel}</p>
          </div>

          {(country || place.region_name) && (
            <div className="space-y-0.5 text-muted-foreground">
              {country && (
                <p><span className="text-foreground/80">País:</span> {country}</p>
              )}
              {place.region_name && (
                <p><span className="text-foreground/80">Região:</span> {place.region_name}</p>
              )}
            </div>
          )}

          {place.centroid_lat != null && place.centroid_lng != null && (
            <p className="font-mono text-muted-foreground">
              {formatCoord(place.centroid_lat, "N", "S")},{" "}
              {formatCoord(place.centroid_lng, "E", "W")}
            </p>
          )}

          {osmUrl && (
            <a
              href={osmUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="size-3 shrink-0" />
              Ver no OpenStreetMap
            </a>
          )}

          {place.wikipedia_summary && (
            <div className="border-t pt-2.5 space-y-1.5">
              <p className="text-muted-foreground leading-relaxed line-clamp-5">
                {place.wikipedia_summary}
              </p>
              {wikiUrl && (
                <a
                  href={wikiUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="size-3 shrink-0" />
                  Ver na Wikipédia
                </a>
              )}
            </div>
          )}

          {place.visit_count !== undefined && (
            <div className="border-t pt-2.5 space-y-0.5 text-muted-foreground">
              {place.first_visited && (
                <p>
                  <span className="text-foreground/80">Primeira visita:</span>{" "}
                  {formatVisitDate(place.first_visited)}
                </p>
              )}
              <p>
                <span className="text-foreground/80">Visitas:</span>{" "}
                {place.visit_count} viagem{place.visit_count !== 1 ? "s" : ""}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
