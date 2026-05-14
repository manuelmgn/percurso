import { useEffect, useRef, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Upload, Sparkles, Loader2, Search, X } from "lucide-react"
import { tripsApi, placesApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { PlaceSearchResult, Visibility } from "@/types"

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

const VISIBILITY_LABELS: Record<Visibility, string> = {
  public: "Público",
  private: "Privado",
  link: "Link partilhável",
  users: "Utilizadores específicos",
}

function PlaceSearchAdd({
  onAdd,
  isPending,
}: {
  onAdd: (result: PlaceSearchResult) => void
  isPending: boolean
}) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<PlaceSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!q.trim()) return
    setSearching(true)
    setSearchError(null)
    try {
      const found = await placesApi.search(q.trim())
      setResults(found)
      if (found.length === 0) setSearchError("Nenhum lugar encontrado.")
    } catch (err: unknown) {
      setSearchError((err as Error).message)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pesquisar lugar…"
          className="flex-1"
        />
        <Button type="submit" variant="outline" disabled={searching || !q.trim()}>
          {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        </Button>
      </form>
      {searchError && <p className="text-sm text-destructive">{searchError}</p>}
      {results.length > 0 && (
        <ul className="space-y-1.5">
          {results.map((r) => (
            <li
              key={`${r.osm_type}-${r.osm_id}`}
              className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{r.name}</p>
                <p className="text-xs text-muted-foreground truncate">{r.display_name}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => {
                  onAdd(r)
                  setResults([])
                  setQ("")
                }}
              >
                Adicionar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>()
  const tripId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploadError, setUploadError] = useState<string | null>(null)
  const [addPlaceError, setAddPlaceError] = useState<string | null>(null)

  const [editTitle, setEditTitle] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editStartDate, setEditStartDate] = useState("")
  const [editEndDate, setEditEndDate] = useState("")
  const [editVisibility, setEditVisibility] = useState<Visibility>("private")
  const [formReady, setFormReady] = useState(false)

  const { data: trip, isLoading } = useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => tripsApi.get(tripId),
    enabled: !!tripId,
  })

  useEffect(() => {
    if (trip && !formReady) {
      setEditTitle(trip.title)
      setEditDescription(trip.description ?? "")
      setEditStartDate(trip.start_date ?? "")
      setEditEndDate(trip.end_date ?? "")
      setEditVisibility(trip.visibility)
      setFormReady(true)
    }
  }, [trip, formReady])

  const uploadMutation = useMutation({
    mutationFn: (file: File) => tripsApi.uploadCover(tripId, file),
    onSuccess: (updated) => {
      queryClient.setQueryData(["trip", tripId], (old: typeof trip) =>
        old ? { ...old, cover_image_url: updated.cover_image_url } : old,
      )
      queryClient.invalidateQueries({ queryKey: ["trips"] })
      setUploadError(null)
    },
    onError: (err: Error) => setUploadError(err.message),
  })

  const generateMutation = useMutation({
    mutationFn: () => tripsApi.generateCover(tripId),
    onSuccess: (updated) => {
      queryClient.setQueryData(["trip", tripId], (old: typeof trip) =>
        old ? { ...old, cover_image_url: updated.cover_image_url } : old,
      )
      queryClient.invalidateQueries({ queryKey: ["trips"] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: object) => tripsApi.update(tripId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trip", tripId] })
      queryClient.invalidateQueries({ queryKey: ["trips"] })
    },
  })

  const removePlaceMutation = useMutation({
    mutationFn: (placeId: number) => tripsApi.removePlace(tripId, placeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trip", tripId] })
      queryClient.invalidateQueries({ queryKey: ["trips"] })
    },
  })

  const addPlaceMutation = useMutation({
    mutationFn: async (result: PlaceSearchResult) => {
      const place = await placesApi.import(result.osm_id, result.osm_type)
      await tripsApi.addPlace(tripId, place.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trip", tripId] })
      queryClient.invalidateQueries({ queryKey: ["trips"] })
      setAddPlaceError(null)
    },
    onError: (err: Error) => setAddPlaceError(err.message),
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
  const savedDescWords = wordCount(trip.description ?? "")
  const canGenerate = savedDescWords >= 8

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadMutation.mutate(file)
    e.target.value = ""
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    updateMutation.mutate({
      title: editTitle,
      description: editDescription || null,
      start_date: editStartDate || null,
      end_date: editEndDate || null,
      visibility: editVisibility,
    })
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <button
        onClick={() => navigate("/viagens")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Viagens
      </button>

      {/* Cover */}
      <div
        className="relative h-52 rounded-2xl overflow-hidden"
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

      {/* Detalhes */}
      <div className="glass-card p-5">
        <h2 className="font-semibold mb-4">Detalhes</h2>
        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Título</label>
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Descrição</label>
            <Input
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Breve descrição…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Data de início</label>
              <Input
                type="date"
                value={editStartDate}
                onChange={(e) => setEditStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Data de fim</label>
              <Input
                type="date"
                value={editEndDate}
                onChange={(e) => setEditEndDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Visibilidade</label>
            <select
              value={editVisibility}
              onChange={(e) => setEditVisibility(e.target.value as Visibility)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {(Object.entries(VISIBILITY_LABELS) as [Visibility, string][]).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          {updateMutation.error && (
            <p className="text-sm text-destructive">{(updateMutation.error as Error).message}</p>
          )}
          {updateMutation.isSuccess && (
            <p className="text-sm text-green-600">Alterações guardadas.</p>
          )}
          <Button type="submit" disabled={updateMutation.isPending} className="w-full">
            {updateMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Guardar alterações"}
          </Button>
        </form>
      </div>

      {/* Lugares */}
      <div className="glass-card p-5">
        <h2 className="font-semibold mb-4">
          Lugares{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({trip.place_count})
          </span>
        </h2>

        {trip.places && trip.places.length > 0 && (
          <ul className="mb-4 space-y-1.5">
            {trip.places.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">{p.name_pt ?? p.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {p.place_type}
                    {p.country_code ? ` · ${p.country_code.toUpperCase()}` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removePlaceMutation.mutate(p.id)}
                  disabled={removePlaceMutation.isPending}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  aria-label="Remover lugar"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <PlaceSearchAdd
          onAdd={(r) => addPlaceMutation.mutate(r)}
          isPending={addPlaceMutation.isPending}
        />
        {addPlaceError && (
          <p className="mt-2 text-sm text-destructive">{addPlaceError}</p>
        )}
        {addPlaceMutation.isPending && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            A adicionar lugar…
          </p>
        )}
      </div>

      {/* Imagem de capa */}
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
                A descrição precisa de pelo menos 8 palavras ({savedDescWords}/8)
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
