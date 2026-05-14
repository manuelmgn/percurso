import { useRef, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Upload, Sparkles, Loader2, Calendar, MapPin } from "lucide-react"
import { tripsApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { formatDateRange } from "@/lib/utils"

function wordCount(text: string | null): number {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>()
  const tripId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const { data: trip, isLoading } = useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => tripsApi.get(tripId),
    enabled: !!tripId,
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => tripsApi.uploadCover(tripId, file),
    onSuccess: (updated) => {
      queryClient.setQueryData(["trip", tripId], updated)
      queryClient.invalidateQueries({ queryKey: ["trips"] })
      setUploadError(null)
    },
    onError: (err: Error) => setUploadError(err.message),
  })

  const generateMutation = useMutation({
    mutationFn: () => tripsApi.generateCover(tripId),
    onSuccess: (updated) => {
      queryClient.setQueryData(["trip", tripId], updated)
      queryClient.invalidateQueries({ queryKey: ["trips"] })
    },
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!trip) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Viagem não encontrada.</p>
      </div>
    )
  }

  const colour = trip.cover_colour ?? "#7C3AED"
  const descWords = wordCount(trip.description)
  const canGenerate = descWords >= 8

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadMutation.mutate(file)
    e.target.value = ""
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <button
        onClick={() => navigate("/viagens")}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Viagens
      </button>

      {/* Cover preview */}
      <div
        className="relative h-52 rounded-2xl overflow-hidden mb-6"
        style={trip.cover_image_url ? {} : { backgroundColor: colour }}
      >
        {trip.cover_image_url ? (
          <img src={trip.cover_image_url} alt={trip.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-end p-5">
            <span className="text-white font-bold text-xl leading-tight drop-shadow">{trip.title}</span>
          </div>
        )}
      </div>

      {/* Title and meta */}
      <h1 className="text-2xl font-bold mb-1">{trip.title}</h1>
      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
        {(trip.start_date || trip.end_date) && (
          <span className="flex items-center gap-1">
            <Calendar className="size-3.5" />
            {formatDateRange(trip.start_date, trip.end_date)}
          </span>
        )}
        <span className="flex items-center gap-1">
          <MapPin className="size-3.5" />
          {trip.place_count} lugares
        </span>
      </div>

      {trip.description && (
        <p className="text-muted-foreground mb-6">{trip.description}</p>
      )}

      {/* Image section */}
      <div className="glass-card p-5">
        <h2 className="font-semibold mb-4">Imagem de capa</h2>

        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Carregar imagem
          </Button>

          <div className="flex-1">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => generateMutation.mutate()}
              disabled={!canGenerate || generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Gerar com IA
            </Button>
            {!canGenerate && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                A descrição precisa de pelo menos 8 palavras ({descWords}/8)
              </p>
            )}
          </div>
        </div>

        {(uploadError || generateMutation.error) && (
          <p className="mt-3 text-sm text-destructive">
            {uploadError ?? (generateMutation.error as Error)?.message}
          </p>
        )}
      </div>
    </div>
  )
}
