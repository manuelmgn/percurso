import { useEffect, useRef, useState } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft, Upload, Sparkles, Loader2, Search, X, UserPlus, Link2,
  ExternalLink, Clock, Pencil,
} from "lucide-react"
import { tripsApi, placesApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ErrorBoundary } from "@/components/shared/ErrorBoundary"
import { useAuthStore } from "@/stores/auth"
import type { PlaceSearchResult, Trip, Visibility } from "@/types"

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

const VISIBILITY_LABELS: Record<Visibility, string> = {
  public: "Público",
  private: "Privado",
  link: "Link partilhável",
  users: "Utilizadores específicos",
}

const STATUS_LABELS: Record<string, string> = {
  accepted: "aceite",
  pending: "pendente",
  declined: "recusado",
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
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar lugar…" className="flex-1" />
        <Button type="submit" variant="outline" disabled={searching || !q.trim()}>
          {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        </Button>
      </form>
      {searchError && <p className="text-sm text-destructive">{searchError}</p>}
      {results.length > 0 && (
        <ul className="space-y-1.5">
          {results.map((r) => (
            <li key={`${r.osm_type}-${r.osm_id}`} className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium truncate">{r.name}</p>
                <p className="text-xs text-muted-foreground truncate">{r.display_name}</p>
              </div>
              <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => { onAdd(r); setResults([]); setQ("") }}>
                Adicionar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TripDetailsPanel({
  open,
  onClose,
  trip,
  onSave,
  isSaving,
  saveError,
  onInvite,
  isInviting,
  inviteError,
  inviteSuccess,
  onRemoveCompanion,
  isRemovingCompanion,
  onAddSharedUser,
  isAddingSharedUser,
  addSharedUserError,
  onRemoveSharedUser,
  isRemovingSharedUser,
  onDelete,
  isDeleting,
}: {
  open: boolean
  onClose: () => void
  trip: Trip
  onSave: (data: object) => void
  isSaving: boolean
  saveError: string | null
  onInvite: (username: string) => void
  isInviting: boolean
  inviteError: string | null
  inviteSuccess: boolean
  onRemoveCompanion: (companionId: number) => void
  isRemovingCompanion: boolean
  onAddSharedUser: (username: string) => void
  isAddingSharedUser: boolean
  addSharedUserError: string | null
  onRemoveSharedUser: (userId: number) => void
  isRemovingSharedUser: boolean
  onDelete: () => void
  isDeleting: boolean
}) {
  const [title, setTitle] = useState(trip.title)
  const [description, setDescription] = useState(trip.description ?? "")
  const [startDate, setStartDate] = useState(trip.start_date ?? "")
  const [endDate, setEndDate] = useState(trip.end_date ?? "")
  const [visibility, setVisibility] = useState<Visibility>(trip.visibility)
  const [inviteUsername, setInviteUsername] = useState("")
  const [sharedUsername, setSharedUsername] = useState("")

  // Re-initialise from latest trip data each time the panel opens
  useEffect(() => {
    if (open) {
      setTitle(trip.title)
      setDescription(trip.description ?? "")
      setStartDate(trip.start_date ?? "")
      setEndDate(trip.end_date ?? "")
      setVisibility(trip.visibility)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({
      title,
      description: description || null,
      start_date: startDate || null,
      end_date: endDate || null,
      visibility,
    })
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (inviteUsername.trim()) {
      onInvite(inviteUsername.trim())
      setInviteUsername("")
    }
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div
        className={`fixed right-0 top-0 h-full w-full max-w-md z-50 flex flex-col bg-background/95 backdrop-blur-xl border-l border-border/50 shadow-2xl transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 shrink-0">
          <h2 className="font-semibold">Editar detalhes</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <form id="trip-details-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Título</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Descrição</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Breve descrição…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Data de início</label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Data de fim</label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Visibilidade</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as Visibility)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {(Object.entries(VISIBILITY_LABELS) as [Visibility, string][]).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </form>

          <div className="pt-4 border-t border-border/50 space-y-3">
            <h3 className="text-sm font-medium">Acompanhantes</h3>
            {(trip.companions ?? []).length > 0 ? (
              <ul className="space-y-2">
                {(trip.companions ?? []).map((c) => (
                  <li key={c.id} className="flex items-center gap-3 text-sm">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-semibold">
                      {c.display_name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <span className="font-medium">{c.display_name}</span>
                      <Link to={`/perfil/${c.username}`} className="ml-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">@{c.username}</Link>
                      {c.status !== "accepted" && (
                        <span className={`ml-2 text-xs ${c.status === "declined" ? "text-destructive" : "text-amber-500"}`}>
                          · {STATUS_LABELS[c.status]}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveCompanion(c.id)}
                      disabled={isRemovingCompanion}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      aria-label="Remover acompanhante"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Ainda sem acompanhantes.</p>
            )}
            <form onSubmit={handleInvite} className="flex gap-2 pt-1">
              <Input
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                placeholder="Nome de utilizador…"
                className="flex-1"
              />
              <Button type="submit" variant="outline" size="sm" disabled={isInviting || !inviteUsername.trim()}>
                {isInviting ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              </Button>
            </form>
            {inviteSuccess && <p className="text-xs text-green-600">Convite enviado.</p>}
            {inviteError && <p className="text-xs text-destructive">{inviteError}</p>}
          </div>

          {/* Shared users — only shown when visibility === "users" */}
          {visibility === "users" && (
            <div className="pt-4 border-t border-border/50 space-y-3">
              <h3 className="text-sm font-medium">Partilhado com</h3>
              {(trip.shared_with ?? []).length > 0 ? (
                <ul className="space-y-2">
                  {(trip.shared_with ?? []).map((s) => (
                    <li key={s.id} className="flex items-center gap-3 text-sm">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-semibold overflow-hidden">
                        {s.avatar_url
                          ? <img src={s.avatar_url} alt={s.display_name} className="h-full w-full object-cover" />
                          : s.display_name[0]?.toUpperCase()
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{s.display_name}</span>
                        <Link to={`/perfil/${s.username}`} className="ml-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">@{s.username}</Link>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveSharedUser(s.user_id)}
                        disabled={isRemovingSharedUser}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        aria-label="Remover acesso"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum utilizador com acesso.</p>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (sharedUsername.trim()) { onAddSharedUser(sharedUsername.trim()); setSharedUsername("") }
                }}
                className="flex gap-2 pt-1"
              >
                <Input
                  value={sharedUsername}
                  onChange={(e) => setSharedUsername(e.target.value)}
                  placeholder="Nome de utilizador…"
                  className="flex-1"
                />
                <Button type="submit" variant="outline" size="sm" disabled={isAddingSharedUser || !sharedUsername.trim()}>
                  {isAddingSharedUser ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                </Button>
              </form>
              {addSharedUserError && <p className="text-xs text-destructive">{addSharedUserError}</p>}
            </div>
          )}
        </div>

        <div className="shrink-0 p-5 border-t border-border/50 space-y-2">
          {saveError && <p className="mb-3 text-sm text-destructive">{saveError}</p>}
          <Button type="submit" form="trip-details-form" disabled={isSaving} className="w-full">
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : "Guardar alterações"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive"
            disabled={isDeleting}
            onClick={() => {
              if (confirm("Tens a certeza? Esta ação é irreversível.")) onDelete()
            }}
          >
            {isDeleting ? <Loader2 className="size-4 animate-spin" /> : "Eliminar viagem"}
          </Button>
        </div>
      </div>
    </>
  )
}

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>()
  const tripId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { user } = useAuthStore()

  const [showDetails, setShowDetails] = useState(false)
  const [coverHover, setCoverHover] = useState(false)
  const [coverTap, setCoverTap] = useState(false)
  const [aiHint, setAiHint] = useState(false)
  const [mediaUrl, setMediaUrl] = useState("")
  const [coverLoaded, setCoverLoaded] = useState(false)
  const [coverGenFailed, setCoverGenFailed] = useState(false)
  const prevGeneratingRef = useRef<boolean>(false)
  const prevCoverUrlRef = useRef<string | null | undefined>(undefined)
  const pollCountRef = useRef(0)

  const { data: trip, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => tripsApi.get(tripId),
    enabled: !!tripId,
    staleTime: 10_000,
    refetchInterval: (query) => {
      if (!query.state.data?.cover_image_generating) return false
      if (pollCountRef.current >= 12) return false
      return 10_000
    },
  })

  useEffect(() => {
    const wasGenerating = prevGeneratingRef.current
    const isGenerating = trip?.cover_image_generating ?? false
    const currentUrl = trip?.cover_image_url
    if (!wasGenerating && isGenerating) {
      pollCountRef.current = 0
    }
    if (wasGenerating && !isGenerating && currentUrl === prevCoverUrlRef.current) {
      setCoverGenFailed(true)
    }
    prevGeneratingRef.current = isGenerating
    prevCoverUrlRef.current = currentUrl
  }, [trip?.cover_image_generating, trip?.cover_image_url])

  useEffect(() => {
    setCoverLoaded(false)
  }, [trip?.cover_image_url])

  useEffect(() => {
    if (!trip?.cover_image_generating) return
    pollCountRef.current += 1
    if (pollCountRef.current >= 12) {
      setCoverGenFailed(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt])

  const isCreator = trip?.creator_id === user?.id
  const overlayVisible = coverHover || coverTap

  const uploadMutation = useMutation({
    mutationFn: (file: File) => tripsApi.uploadCover(tripId, file),
    onSuccess: (updated) => {
      queryClient.setQueryData(["trip", tripId], (old: Trip | undefined) =>
        old ? { ...old, cover_image_url: updated.cover_image_url, cover_image_generating: false } : old,
      )
      queryClient.invalidateQueries({ queryKey: ["trips"] })
    },
  })

  const generateMutation = useMutation({
    mutationFn: () => tripsApi.generateCover(tripId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trip", tripId] })
      queryClient.invalidateQueries({ queryKey: ["trips"] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: object) => tripsApi.update(tripId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trip", tripId] })
      queryClient.invalidateQueries({ queryKey: ["trips"] })
      setShowDetails(false)
    },
  })

  const removePlaceMutation = useMutation({
    mutationFn: (placeId: number) => tripsApi.removePlace(tripId, placeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trip", tripId] })
      queryClient.invalidateQueries({ queryKey: ["trips"] })
      queryClient.invalidateQueries({ queryKey: ["my-places"] })
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
      queryClient.invalidateQueries({ queryKey: ["my-places"] })
    },
  })

  const inviteMutation = useMutation({
    mutationFn: (username: string) => tripsApi.inviteCompanion(tripId, username),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trip", tripId] }),
  })

  const removeCompanionMutation = useMutation({
    mutationFn: (companionId: number) => tripsApi.removeCompanion(tripId, companionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trip", tripId] }),
  })

  const addSharedUserMutation = useMutation({
    mutationFn: (username: string) => tripsApi.addSharedUser(tripId, username),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trip", tripId] }),
  })

  const removeSharedUserMutation = useMutation({
    mutationFn: (userId: number) => tripsApi.removeSharedUser(tripId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trip", tripId] }),
  })

  const deleteTripMutation = useMutation({
    mutationFn: () => tripsApi.delete(tripId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] })
      queryClient.invalidateQueries({ queryKey: ["my-places"] })
      navigate("/viagens")
    },
  })

  const addMediaMutation = useMutation({
    mutationFn: (url: string) => tripsApi.addMedia(tripId, url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trip", tripId] })
      setMediaUrl("")
    },
  })

  const removeMediaMutation = useMutation({
    mutationFn: (mediaId: number) => tripsApi.removeMedia(tripId, mediaId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trip", tripId] }),
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!trip) {
    return <div className="p-6"><p className="text-muted-foreground">Viagem não encontrada.</p></div>
  }

  const colour = trip.cover_colour ?? "#7C3AED"
  const descWords = wordCount(trip.description ?? "")

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadMutation.mutate(file)
    e.target.value = ""
  }

  function handleCoverAI() {
    if (descWords < 5) {
      setAiHint(true)
      setTimeout(() => setAiHint(false), 4000)
      return
    }
    setAiHint(false)
    setCoverGenFailed(false)
    pollCountRef.current = 0
    generateMutation.mutate()
  }

  function handleAddMedia(e: React.FormEvent) {
    e.preventDefault()
    if (mediaUrl.trim()) addMediaMutation.mutate(mediaUrl.trim())
  }

  return (
    <ErrorBoundary>
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/viagens")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Viagens
        </button>
        {isCreator && (
          <Button variant="outline" size="sm" onClick={() => setShowDetails(true)}>
            <Pencil className="size-3.5" />
            Editar detalhes
          </Button>
        )}
      </div>

      {/* Cover with interactive overlay */}
      <div
        className="relative h-52 rounded-2xl overflow-hidden"
        style={trip.cover_image_url ? {} : { backgroundColor: colour }}
        onMouseEnter={() => { setCoverHover(true); setCoverTap(false) }}
        onMouseLeave={() => { setCoverHover(false); setCoverTap(false); setAiHint(false) }}
        onClick={() => setCoverTap((v) => !v)}
      >
        {trip.cover_image_url ? (
          <img
            src={trip.cover_image_url}
            alt={trip.title}
            className={`h-full w-full object-cover transition-opacity duration-700 ${coverLoaded ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setCoverLoaded(true)}
          />
        ) : (
          <div className="flex h-full items-end p-5">
            <span className="text-white font-bold text-xl leading-tight drop-shadow">{trip.title}</span>
          </div>
        )}

        {/* Generating state — pulsing skeleton */}
        {trip.cover_image_generating && (
          <div className="absolute inset-0 overflow-hidden">
            <div className="h-full w-full animate-pulse bg-gradient-to-br from-primary/30 via-primary/15 to-primary/5" />
            <div className="absolute inset-0 flex items-end p-5 space-y-2">
              <div className="w-full space-y-2">
                <div className="h-4 w-2/3 rounded-md bg-white/25 animate-pulse" />
                <div className="h-3 w-1/2 rounded-md bg-white/15 animate-pulse" />
              </div>
            </div>
          </div>
        )}

        {/* Controls overlay — only for creator and when not generating */}
        {isCreator && !trip.cover_image_generating && (
          <div
            className={`absolute inset-0 flex items-center justify-center gap-3 bg-black/20 backdrop-blur-[2px] transition-opacity duration-200 ${overlayVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Upload pill */}
            <button
              className="group/btn inline-flex items-center h-9 px-2.5 rounded-full bg-black/60 backdrop-blur-sm text-white hover:bg-black/75 transition-all duration-200 disabled:opacity-40"
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
              disabled={uploadMutation.isPending}
            >
              {uploadMutation.isPending
                ? <Loader2 className="size-4 animate-spin shrink-0" />
                : <Upload className="size-4 shrink-0" />
              }
              <span className="max-w-0 group-hover/btn:max-w-[9rem] overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-200 group-hover/btn:ml-2">
                Carregar imagem
              </span>
            </button>

            {/* AI generate pill + hint */}
            <div className="relative">
              <button
                className="group/btn inline-flex items-center h-9 px-2.5 rounded-full bg-black/60 backdrop-blur-sm text-white hover:bg-black/75 transition-all duration-200 disabled:opacity-40"
                onClick={(e) => { e.stopPropagation(); handleCoverAI() }}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending
                  ? <Loader2 className="size-4 animate-spin shrink-0" />
                  : <Sparkles className="size-4 shrink-0" />
                }
                <span className="max-w-0 group-hover/btn:max-w-[7rem] overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-200 group-hover/btn:ml-2">
                  Gerar com IA
                </span>
              </button>
              {aiHint && (
                <p className="absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs bg-black/80 text-white rounded-lg px-3 py-1.5 pointer-events-none z-10">
                  Melhora a descrição para gerar uma imagem
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Cover generation failure notice */}
      {coverGenFailed && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <span>Não foi possível gerar a imagem. Tenta novamente.</span>
        </p>
      )}

      {/* Title + description */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold leading-tight">{trip.title}</h1>
        {trip.description && (
          <p className="text-muted-foreground leading-relaxed">{trip.description}</p>
        )}
      </div>

      {/* Places */}
      <div className="glass-card p-5">
        <h2 className="font-semibold mb-4">
          Lugares <span className="text-sm font-normal text-muted-foreground">({trip.place_count})</span>
        </h2>

        {trip.places && trip.places.length > 0 && (
          <ul className="mb-4 space-y-1.5">
            {trip.places.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <Link to={`/lugares/${p.id}`} className="flex-1 min-w-0 hover:text-primary transition-colors">
                  <span className="font-medium">{p.name_pt ?? p.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {p.place_type}{p.country_code ? ` · ${p.country_code.toUpperCase()}` : ""}
                  </span>
                </Link>
                {isCreator && (
                  <button
                    type="button"
                    onClick={() => removePlaceMutation.mutate(p.id)}
                    disabled={removePlaceMutation.isPending}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    aria-label="Remover lugar"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {isCreator && (
          <>
            <PlaceSearchAdd onAdd={(r) => addPlaceMutation.mutate(r)} isPending={addPlaceMutation.isPending} />
            {addPlaceMutation.error && (
              <p className="mt-2 text-sm text-destructive">{(addPlaceMutation.error as Error).message}</p>
            )}
            {addPlaceMutation.isPending && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> A adicionar lugar…
              </p>
            )}
          </>
        )}
      </div>

      {/* Media links */}
      <div className="glass-card p-5">
        <h2 className="font-semibold mb-4">Ligações</h2>

        {trip.media_links && trip.media_links.length > 0 && (
          <ul className="mb-4 space-y-2">
            {trip.media_links.map((m) => (
              <li key={m.id} className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                {m.og_image_url && (
                  <img src={m.og_image_url} alt="" className="h-12 w-16 shrink-0 rounded object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{m.og_title ?? m.url}</p>
                  {m.og_description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{m.og_description}</p>
                  )}
                  {m.og_site_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">{m.og_site_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded p-1 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                  {isCreator && (
                    <button
                      type="button"
                      onClick={() => removeMediaMutation.mutate(m.id)}
                      disabled={removeMediaMutation.isPending}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      aria-label="Remover link"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {isCreator && (
          <form onSubmit={handleAddMedia} className="flex gap-2">
            <Input
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="https://…"
              type="url"
              className="flex-1"
            />
            <Button type="submit" variant="outline" disabled={addMediaMutation.isPending || !mediaUrl.trim()}>
              {addMediaMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
              Adicionar
            </Button>
          </form>
        )}
        {addMediaMutation.error && (
          <p className="mt-2 text-sm text-destructive">{(addMediaMutation.error as Error).message}</p>
        )}
      </div>

      {/* Sharing link */}
      {trip.sharing_token && (
        <div className="glass-card p-4 flex items-center gap-3 text-sm">
          <Clock className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Link de partilha</p>
            <p className="text-xs text-muted-foreground truncate">
              {window.location.origin}/viagens/partilhada/{trip.sharing_token}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 text-xs text-primary hover:underline"
            onClick={() => navigator.clipboard.writeText(
              `${window.location.origin}/viagens/partilhada/${trip.sharing_token}`
            )}
          >
            Copiar
          </button>
        </div>
      )}

      {/* Details slide-over */}
      {isCreator && (
        <TripDetailsPanel
          open={showDetails}
          onClose={() => setShowDetails(false)}
          trip={trip}
          onSave={(data) => updateMutation.mutate(data)}
          isSaving={updateMutation.isPending}
          saveError={updateMutation.error ? (updateMutation.error as Error).message : null}
          onInvite={(username) => inviteMutation.mutate(username)}
          isInviting={inviteMutation.isPending}
          inviteError={inviteMutation.error ? (inviteMutation.error as Error).message : null}
          inviteSuccess={inviteMutation.isSuccess}
          onRemoveCompanion={(id) => removeCompanionMutation.mutate(id)}
          isRemovingCompanion={removeCompanionMutation.isPending}
          onAddSharedUser={(username) => addSharedUserMutation.mutate(username)}
          isAddingSharedUser={addSharedUserMutation.isPending}
          addSharedUserError={addSharedUserMutation.error ? (addSharedUserMutation.error as Error).message : null}
          onRemoveSharedUser={(userId) => removeSharedUserMutation.mutate(userId)}
          isRemovingSharedUser={removeSharedUserMutation.isPending}
          onDelete={() => deleteTripMutation.mutate()}
          isDeleting={deleteTripMutation.isPending}
        />
      )}
    </div>
    </ErrorBoundary>
  )
}
