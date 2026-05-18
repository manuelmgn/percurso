import { useEffect, useRef, useState } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft, Upload, Sparkles, Loader2, Target, Search, X,
  UserPlus, FileText, Check, AlertCircle, Pencil, Trash2, Link2, ExternalLink,
  CheckCircle2, Layers,
} from "lucide-react"
import { projectsApi, placesApi, tripsApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ErrorBoundary } from "@/components/shared/ErrorBoundary"
import { useAuthStore } from "@/stores/auth"
import { getPlaceLabel } from "@/lib/placeTypes"
import { PlaceIcon } from "@/components/PlaceIcon"
import { PlaceInfoButton } from "@/components/shared/PlaceInfoButton"
import MiniMap from "@/components/map/MiniMap"
import type { PlaceSearchResult, PlaceType, Project, ProjectTargetPlace, Visibility, MissingMember } from "@/types"

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function doSearch(query: string) {
    setSearching(true)
    setSearchError(null)
    try {
      const found = await placesApi.search(query)
      setResults(found)
      if (found.length === 0) setSearchError("Nenhum lugar encontrado.")
    } catch (err: unknown) {
      setSearchError((err as Error).message)
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    const trimmed = q.trim()
    if (trimmed.length < 3) {
      setResults([])
      setSearchError(null)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(trimmed), 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [q])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = q.trim()
    if (!trimmed) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    doSearch(trimmed)
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
          {results.map((r) => {
            const key = `${r.osm_type}-${r.osm_id}`
            return (
              <li key={key} className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <PlaceIcon type={r.place_type as PlaceType} size={15} className="shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {r.place_type_label}
                    {" · "}
                    {r.display_name}
                  </p>
                </div>
                <PlaceInfoButton place={r} />
                <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => { onAdd(r); setResults([]); setQ("") }}>
                  Adicionar
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

interface MatchResult {
  query: string
  match: PlaceSearchResult | null
  confidence: number | null
  alternatives: PlaceSearchResult[]
}

function BulkImport({ projectId, onDone }: { projectId: number; onDone: () => void }) {
  const [text, setText] = useState("")
  const [matches, setMatches] = useState<MatchResult[] | null>(null)
  const [selected, setSelected] = useState<Record<number, PlaceSearchResult>>({})
  const [searching, setSearching] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return
    setSearching(true)
    setError(null)
    try {
      const results = await projectsApi.importPlaces(projectId, lines) as MatchResult[]
      setMatches(results)
      const initial: Record<number, PlaceSearchResult> = {}
      results.forEach((r, i) => { if (r.match) initial[i] = r.match })
      setSelected(initial)
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setSearching(false)
    }
  }

  async function handleImport() {
    if (!matches) return
    setImporting(true)
    setError(null)
    try {
      for (const result of Object.values(selected)) {
        const place = await placesApi.import(result.osm_id, result.osm_type)
        await projectsApi.addPlace(projectId, place.id)
      }
      setMatches(null)
      setText("")
      setSelected({})
      onDone()
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setImporting(false)
    }
  }

  if (matches) {
    const selectedCount = Object.keys(selected).length
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Confirma os lugares encontrados. Desseleciona os que não estão corretos.
        </p>
        <ul className="space-y-1.5 max-h-72 overflow-y-auto">
          {matches.map((r, i) => (
            <li key={i} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${r.match ? "bg-muted/30" : "bg-destructive/5 border-destructive/30"}`}>
              {r.match ? (
                <>
                  <input
                    type="checkbox"
                    checked={!!selected[i]}
                    onChange={(e) => {
                      const next = { ...selected }
                      if (e.target.checked) next[i] = r.match!
                      else delete next[i]
                      setSelected(next)
                    }}
                    className="mt-0.5 accent-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{selected[i]?.name ?? r.match.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {selected[i]?.place_type ?? r.match.place_type}
                      {(selected[i]?.country_code ?? r.match.country_code) ? ` · ${(selected[i]?.country_code ?? r.match.country_code)!.toUpperCase()}` : ""}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground opacity-60">← "{r.query}"</span>
                    {r.alternatives.length > 0 && (
                      <select
                        className="mt-1 block text-xs border rounded px-1 py-0.5 bg-background"
                        value={`${selected[i]?.osm_type}-${selected[i]?.osm_id}`}
                        onChange={(e) => {
                          const [osm_type, osm_id] = e.target.value.split("-")
                          const alt = [r.match!, ...r.alternatives].find(
                            (a) => a.osm_type === osm_type && String(a.osm_id) === osm_id
                          )
                          if (alt) setSelected({ ...selected, [i]: alt })
                        }}
                      >
                        <option value={`${r.match.osm_type}-${r.match.osm_id}`}>{r.match.name} (melhor resultado)</option>
                        {r.alternatives.map((a) => (
                          <option key={`${a.osm_type}-${a.osm_id}`} value={`${a.osm_type}-${a.osm_id}`}>{a.name} — {a.display_name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <Check className="size-3.5 shrink-0 mt-0.5 text-green-500" />
                </>
              ) : (
                <>
                  <AlertCircle className="size-3.5 shrink-0 mt-0.5 text-destructive" />
                  <span className="text-muted-foreground">"{r.query}" — sem resultado encontrado</span>
                </>
              )}
            </li>
          ))}
        </ul>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => { setMatches(null); setSelected({}) }}>
            Voltar
          </Button>
          <Button className="flex-1" disabled={importing || selectedCount === 0} onClick={handleImport}>
            {importing ? <Loader2 className="size-4 animate-spin" /> : null}
            Adicionar {selectedCount} {selectedCount === 1 ? "lugar" : "lugares"}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSearch} className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Porto\nBraga\nViana do Castelo\n…"}
        rows={5}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" variant="outline" className="w-full" disabled={searching || !text.trim()}>
        {searching ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
        Pesquisar lugares
      </Button>
    </form>
  )
}

function ProjectDetailsPanel({
  open,
  onClose,
  project,
  onSave,
  isSaving,
  saveError,
  onInvite,
  isInviting,
  inviteError,
  inviteSuccess,
  onRemoveCollaborator,
  isRemovingCollaborator,
  onAddSharedUser,
  isAddingSharedUser,
  addSharedUserError,
  onRemoveSharedUser,
  isRemovingSharedUser,
  onDelete,
  isDeleting,
  onArchive,
  isArchiving,
}: {
  open: boolean
  onClose: () => void
  project: Project
  onSave: (data: object) => void
  isSaving: boolean
  saveError: string | null
  onInvite: (username: string) => void
  isInviting: boolean
  inviteError: string | null
  inviteSuccess: boolean
  onRemoveCollaborator: (collaboratorId: number) => void
  isRemovingCollaborator: boolean
  onAddSharedUser: (username: string) => void
  isAddingSharedUser: boolean
  addSharedUserError: string | null
  onRemoveSharedUser: (userId: number) => void
  isRemovingSharedUser: boolean
  onDelete: () => void
  isDeleting: boolean
  onArchive: () => void
  isArchiving: boolean
}) {
  const [title, setTitle] = useState(project.title)
  const [description, setDescription] = useState(project.description ?? "")
  const [goal, setGoal] = useState(project.goal_description ?? "")
  const [visibility, setVisibility] = useState<Visibility>(project.visibility)
  const [inviteUsername, setInviteUsername] = useState("")
  const [sharedUsername, setSharedUsername] = useState("")

  useEffect(() => {
    if (open) {
      setTitle(project.title)
      setDescription(project.description ?? "")
      setGoal(project.goal_description ?? "")
      setVisibility(project.visibility)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({
      title,
      description: description || null,
      goal_description: goal || null,
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
          <form id="project-details-form" onSubmit={handleSubmit} className="space-y-4">
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
            <div>
              <label className="mb-1.5 block text-sm font-medium">Objetivo</label>
              <Input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Visitar todas as comarcas…"
              />
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
            <h3 className="text-sm font-medium">Colaboradores</h3>
            {(project.collaborators ?? []).length > 0 ? (
              <ul className="space-y-2">
                {(project.collaborators ?? []).map((c) => (
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
                      onClick={() => onRemoveCollaborator(c.id)}
                      disabled={isRemovingCollaborator}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      aria-label="Remover colaborador"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Ainda sem colaboradores.</p>
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
              {(project.shared_with ?? []).length > 0 ? (
                <ul className="space-y-2">
                  {(project.shared_with ?? []).map((s) => (
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
          <Button type="submit" form="project-details-form" disabled={isSaving} className="w-full">
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : "Guardar alterações"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={isArchiving}
            onClick={onArchive}
          >
            {isArchiving ? <Loader2 className="size-4 animate-spin" /> : project.is_archived ? "Desarquivar projeto" : "Arquivar projeto"}
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
            {isDeleting ? <Loader2 className="size-4 animate-spin" /> : "Eliminar projeto"}
          </Button>
        </div>
      </div>
    </>
  )
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const projectId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { user } = useAuthStore()

  const [showDetails, setShowDetails] = useState(false)
  const [mediaUrl, setMediaUrl] = useState("")
  const [coverHover, setCoverHover] = useState(false)
  const [coverTap, setCoverTap] = useState(false)
  const [aiHint, setAiHint] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [coverLoaded, setCoverLoaded] = useState(false)
  const [coverGenFailed, setCoverGenFailed] = useState(false)
  const [showTripModal, setShowTripModal] = useState(false)
  const [visitPlace, setVisitPlace] = useState<ProjectTargetPlace | null>(null)
  const [visitMode, setVisitMode] = useState<"trip" | null>(null)
  const [newTripTitle, setNewTripTitle] = useState("")
  const [newTripDescription, setNewTripDescription] = useState("")
  const [tripMemberWarning, setTripMemberWarning] = useState<{ tripId: number; missing: MissingMember[] } | null>(null)
  const [checkingTripMembers, setCheckingTripMembers] = useState(false)
  const prevGeneratingRef = useRef<boolean>(false)
  const prevCoverUrlRef = useRef<string | null | undefined>(undefined)
  const pollCountRef = useRef(0)

  const { data: project, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projectsApi.get(projectId),
    enabled: !!projectId,
    staleTime: 10_000,
    refetchInterval: (query) => {
      if (!query.state.data?.cover_image_generating) return false
      if (pollCountRef.current >= 12) return false
      return 10_000
    },
  })

  useEffect(() => {
    const wasGenerating = prevGeneratingRef.current
    const isGenerating = project?.cover_image_generating ?? false
    const currentUrl = project?.cover_image_url
    if (!wasGenerating && isGenerating) {
      pollCountRef.current = 0
    }
    if (wasGenerating && !isGenerating && currentUrl === prevCoverUrlRef.current) {
      setCoverGenFailed(true)
    }
    prevGeneratingRef.current = isGenerating
    prevCoverUrlRef.current = currentUrl
  }, [project?.cover_image_generating, project?.cover_image_url])

  useEffect(() => {
    setCoverLoaded(false)
  }, [project?.cover_image_url])

  useEffect(() => {
    if (!project?.cover_image_generating) return
    pollCountRef.current += 1
    if (pollCountRef.current >= 12) {
      setCoverGenFailed(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt])

  const isCreator = project?.creator_id === user?.id
  const isCollaborator = !isCreator && !!(project && user && (project.collaborators ?? []).some((c) => c.user_id === user.id && c.status === "accepted"))
  const canEdit = isCreator || isCollaborator
  const overlayVisible = coverHover || coverTap

  const uploadMutation = useMutation({
    mutationFn: (file: File) => projectsApi.uploadCover(projectId, file),
    onSuccess: (updated) => {
      queryClient.setQueryData(["project", projectId], (old: Project | undefined) =>
        old ? { ...old, cover_image_url: updated.cover_image_url, cover_image_generating: false } : old,
      )
      queryClient.invalidateQueries({ queryKey: ["projects"] })
    },
  })

  const generateMutation = useMutation({
    mutationFn: () => projectsApi.generateCover(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] })
      queryClient.invalidateQueries({ queryKey: ["projects"] })
    },
  })

  const deleteCoverMutation = useMutation({
    mutationFn: () => projectsApi.deleteCover(projectId),
    onSuccess: (updated) => {
      queryClient.setQueryData(["project", projectId], (old: Project | undefined) =>
        old ? { ...old, cover_image_url: updated.cover_image_url, cover_image_generating: false } : old,
      )
      queryClient.invalidateQueries({ queryKey: ["projects"] })
    },
  })

  const addMediaMutation = useMutation({
    mutationFn: (url: string) => projectsApi.addMedia(projectId, url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] })
      setMediaUrl("")
    },
  })

  const removeMediaMutation = useMutation({
    mutationFn: (mediaId: number) => projectsApi.removeMedia(projectId, mediaId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
  })

  const updateMutation = useMutation({
    mutationFn: (data: object) => projectsApi.update(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] })
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      setShowDetails(false)
    },
  })

  const removePlaceMutation = useMutation({
    mutationFn: (placeId: number) => projectsApi.removePlace(projectId, placeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] })
      queryClient.invalidateQueries({ queryKey: ["projects"] })
    },
  })

  const addPlaceMutation = useMutation({
    mutationFn: async (result: PlaceSearchResult) => {
      const place = await placesApi.import(result.osm_id, result.osm_type)
      await projectsApi.addPlace(projectId, place.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] })
      queryClient.invalidateQueries({ queryKey: ["projects"] })
    },
  })

  const inviteMutation = useMutation({
    mutationFn: (username: string) => projectsApi.inviteCollaborator(projectId, username),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
  })

  const removeCollaboratorMutation = useMutation({
    mutationFn: (collaboratorId: number) => projectsApi.removeCollaborator(projectId, collaboratorId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
  })

  const leaveProjectMutation = useMutation({
    mutationFn: () => projectsApi.leaveProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] })
      queryClient.invalidateQueries({ queryKey: ["projects"] })
    },
  })

  const addSharedUserMutation = useMutation({
    mutationFn: (username: string) => projectsApi.addSharedUser(projectId, username),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
  })

  const removeSharedUserMutation = useMutation({
    mutationFn: (userId: number) => projectsApi.removeSharedUser(projectId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
  })

  const deleteProjectMutation = useMutation({
    mutationFn: () => projectsApi.delete(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      navigate("/projetos")
    },
  })

  const archiveProjectMutation = useMutation({
    mutationFn: () => project!.is_archived ? projectsApi.unarchive(projectId) : projectsApi.archive(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] })
      queryClient.invalidateQueries({ queryKey: ["projects"] })
    },
  })

  const { data: myTrips, isLoading: loadingTrips } = useQuery({
    queryKey: ["trips"],
    queryFn: () => tripsApi.list(),
    enabled: showTripModal,
    staleTime: 30_000,
  })

  const associateTripMutation = useMutation({
    mutationFn: (tripId: number) => projectsApi.associateTrip(projectId, tripId),
    onSuccess: (data) => {
      queryClient.setQueryData(["project", projectId], data)
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      setShowTripModal(false)
      setTripMemberWarning(null)
    },
  })

  const disassociateTripMutation = useMutation({
    mutationFn: (tripId: number) => projectsApi.disassociateTrip(projectId, tripId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] })
      queryClient.invalidateQueries({ queryKey: ["projects"] })
    },
  })

  const markVisitedMutation = useMutation({
    mutationFn: (placeId: number) => projectsApi.markPlaceVisited(projectId, placeId),
    onSuccess: (data) => {
      queryClient.setQueryData(["project", projectId], data)
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      setVisitPlace(null)
      setVisitMode(null)
    },
  })

  const unmarkVisitedMutation = useMutation({
    mutationFn: (placeId: number) => projectsApi.unmarkPlaceVisited(projectId, placeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] })
      queryClient.invalidateQueries({ queryKey: ["projects"] })
    },
  })

  const createTripForPlaceMutation = useMutation({
    mutationFn: ({ placeId, title, description }: { placeId: number; title: string; description: string | null }) =>
      projectsApi.createTripForPlace(projectId, placeId, { title, description }),
    onSuccess: (data) => {
      queryClient.setQueryData(["project", projectId], data)
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      queryClient.invalidateQueries({ queryKey: ["trips"] })
      const newTripId = data.new_trip_id
      setVisitPlace(null)
      setVisitMode(null)
      setNewTripTitle("")
      setNewTripDescription("")
      if (newTripId) navigate(`/viagens/${newTripId}`)
    },
  })

  async function handleSelectTrip(selectedTripId: number) {
    setCheckingTripMembers(true)
    try {
      const res = await tripsApi.checkProjectMembers(selectedTripId, projectId)
      if (res.missing_members.length > 0) {
        setTripMemberWarning({ tripId: selectedTripId, missing: res.missing_members })
      } else {
        associateTripMutation.mutate(selectedTripId)
      }
    } catch {
      associateTripMutation.mutate(selectedTripId)
    } finally {
      setCheckingTripMembers(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!project) {
    return <div className="p-6"><p className="text-muted-foreground">Projeto não encontrado.</p></div>
  }

  const colour = project.cover_colour ?? "#7C3AED"
  const descWords = wordCount(project.description ?? "")
  const pct = project.target_place_count === 0
    ? 0
    : Math.round((project.visited_place_count / project.target_place_count) * 100)

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
          onClick={() => navigate("/projetos")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Projetos
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
        className="relative h-48 rounded-2xl overflow-hidden"
        style={project.cover_image_url ? {} : { backgroundColor: colour }}
        onMouseEnter={() => { setCoverHover(true); setCoverTap(false) }}
        onMouseLeave={() => { setCoverHover(false); setCoverTap(false); setAiHint(false) }}
        onClick={() => setCoverTap((v) => !v)}
      >
        {project.cover_image_url ? (
          <img
            src={project.cover_image_url}
            alt={project.title}
            className={`h-full w-full object-cover transition-opacity duration-700 ${coverLoaded ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setCoverLoaded(true)}
          />
        ) : (
          <div className="flex h-full items-end p-5">
            <span className="text-white font-bold text-xl leading-tight drop-shadow">{project.title}</span>
          </div>
        )}

        {/* Generating state */}
        {project.cover_image_generating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <Loader2 className="size-8 animate-spin text-white mb-3" />
            <p className="text-white font-medium text-sm">A gerar imagem...</p>
            <p className="text-white/70 text-xs mt-1">Isto pode demorar alguns segundos</p>
          </div>
        )}

        {/* Controls overlay */}
        {isCreator && !project.cover_image_generating && (
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

            {/* Delete cover pill — only when a cover image exists */}
            {project.cover_image_url && (
              <button
                className="group/btn inline-flex items-center h-9 px-2.5 rounded-full bg-black/60 backdrop-blur-sm text-white hover:bg-red-600/80 transition-all duration-200 disabled:opacity-40"
                onClick={(e) => { e.stopPropagation(); deleteCoverMutation.mutate() }}
                disabled={deleteCoverMutation.isPending}
              >
                {deleteCoverMutation.isPending
                  ? <Loader2 className="size-4 animate-spin shrink-0" />
                  : <Trash2 className="size-4 shrink-0" />
                }
                <span className="max-w-0 group-hover/btn:max-w-[6rem] overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-200 group-hover/btn:ml-2">
                  Remover imagem
                </span>
              </button>
            )}
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
        <h1 className="text-2xl font-bold leading-tight">{project.title}</h1>
        {project.description && (
          <p className="text-muted-foreground leading-relaxed">{project.description}</p>
        )}
        {project.goal_description && (
          <p className="text-sm text-muted-foreground italic">{project.goal_description}</p>
        )}
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Target className="size-3.5" />
          <span>{project.visited_place_count} de {project.target_place_count} lugares visitados ({pct}%)</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Target places */}
      <div className="glass-card p-5">
        <h2 className="font-semibold mb-4">
          Lugares objetivo <span className="text-sm font-normal text-muted-foreground">({project.target_place_count})</span>
        </h2>

        {project.target_places && project.target_places.length > 0 && (
          <ul className="mb-4 space-y-1.5">
            {project.target_places.map((p) => (
              <li key={p.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${p.visited ? "bg-green-500/5 border-green-500/20" : "bg-muted/30"}`}>
                <PlaceIcon
                  type={p.place_type as PlaceType}
                  size={15}
                  className="shrink-0 text-muted-foreground mt-0.5"
                  title={getPlaceLabel(p.place_type)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link to={`/lugares/${p.osm_id}`} className="font-medium hover:text-primary transition-colors">
                      {p.name_pt ?? p.name}
                    </Link>
                    {p.country_code && (
                      <span className="text-xs text-muted-foreground">{p.country_code.toUpperCase()}</span>
                    )}
                    {p.visited && (
                      <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                        <CheckCircle2 className="size-3" />
                        Visitado
                      </span>
                    )}
                  </div>
                  {p.visit_trips.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      via {p.visit_trips.map((t) => t.title).join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 mt-0.5">
                  <PlaceInfoButton place={p} />
                  {!p.visited && canEdit && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs px-2"
                      onClick={() => { setVisitPlace(p); setVisitMode(null) }}
                    >
                      Marcar
                    </Button>
                  )}
                  {p.direct_visit && canEdit && (
                    <button
                      type="button"
                      onClick={() => unmarkVisitedMutation.mutate(p.id)}
                      disabled={unmarkVisitedMutation.isPending}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      aria-label="Retirar visita direta"
                      title="Retirar visita direta"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                  {isCreator && (
                    <button
                      type="button"
                      onClick={() => removePlaceMutation.mutate(p.id)}
                      disabled={removePlaceMutation.isPending}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      aria-label="Remover lugar"
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
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowBulkImport(false)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${!showBulkImport ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                Pesquisa individual
              </button>
              <button
                type="button"
                onClick={() => setShowBulkImport(true)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${showBulkImport ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                Importar lista
              </button>
            </div>

            {!showBulkImport ? (
              <>
                <PlaceSearchAdd onAdd={(r) => addPlaceMutation.mutate(r)} isPending={addPlaceMutation.isPending} />
                {addPlaceMutation.error && (
                  <p className="text-sm text-destructive">{(addPlaceMutation.error as Error).message}</p>
                )}
                {addPlaceMutation.isPending && (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> A adicionar lugar…
                  </p>
                )}
              </>
            ) : (
              <BulkImport
                projectId={projectId}
                onDone={() => {
                  queryClient.invalidateQueries({ queryKey: ["project", projectId] })
                  setShowBulkImport(false)
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Viagens associadas */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Viagens associadas</h2>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setShowTripModal(true)}>
              <Layers className="size-3.5" />
              Associar
            </Button>
          )}
        </div>
        {(project.associated_trips ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma viagem associada a este projeto.</p>
        ) : (
          <ul className="space-y-2">
            {(project.associated_trips ?? []).map((t) => {
              const n = t.covered_place_ids.length
              return (
                <li key={t.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <Link to={`/viagens/${t.id}`} className="font-medium hover:text-primary transition-colors">
                      {t.title}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t.start_date ? new Date(t.start_date + "T00:00:00").toLocaleDateString("pt-PT") : "Sem data"}
                      {n > 0 && ` · ${n} lugar${n !== 1 ? "es" : ""} coberto${n !== 1 ? "s" : ""}`}
                    </p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => disassociateTripMutation.mutate(t.id)}
                      disabled={disassociateTripMutation.isPending}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      aria-label="Remover associação"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Trip selector modal */}
      {showTripModal && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={() => { setShowTripModal(false); setTripMemberWarning(null) }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl bg-background border shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <h3 className="font-semibold">Associar viagem</h3>
                <button
                  onClick={() => { setShowTripModal(false); setTripMemberWarning(null) }}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
              {tripMemberWarning ? (
                <div className="p-5 space-y-4">
                  <div className="flex items-start gap-3 rounded-lg border border-amber-300/50 bg-amber-50/50 dark:bg-amber-900/10 p-4">
                    <AlertCircle className="size-4 shrink-0 text-amber-500 mt-0.5" />
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Colaboradores do projeto sem acesso à viagem</p>
                      <p className="text-xs text-muted-foreground">
                        Estes colaboradores não são acompanhantes da viagem selecionada:
                      </p>
                      <ul className="text-xs space-y-1">
                        {tripMemberWarning.missing.map((m) => (
                          <li key={m.user_id} className="font-medium">
                            {m.display_name} <span className="text-muted-foreground font-normal">@{m.username}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setTripMemberWarning(null)}>
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1"
                      disabled={associateTripMutation.isPending}
                      onClick={() => associateTripMutation.mutate(tripMemberWarning.tripId)}
                    >
                      {associateTripMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                      Associar mesmo assim
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
                  {loadingTrips ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (() => {
                    const associatedIds = new Set((project.associated_trips ?? []).map((t) => t.id))
                    const available = (myTrips ?? []).filter((t) => !associatedIds.has(t.id))
                    return available.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhuma viagem disponível para associar.</p>
                    ) : (
                      <ul className="space-y-2">
                        {available.map((t) => (
                          <li key={t.id}>
                            <button
                              type="button"
                              className="w-full flex items-center gap-3 rounded-lg border bg-muted/30 hover:bg-muted/60 px-3 py-2.5 text-sm transition-colors text-left disabled:opacity-60"
                              onClick={() => handleSelectTrip(t.id)}
                              disabled={checkingTripMembers || associateTripMutation.isPending}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{t.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {t.start_date ? new Date(t.start_date + "T00:00:00").toLocaleDateString("pt-PT") : "Sem data"}
                                  {" · "}{t.place_count} lugar{t.place_count !== 1 ? "es" : ""}
                                </p>
                              </div>
                              {checkingTripMembers && <Loader2 className="size-3.5 animate-spin shrink-0 text-muted-foreground" />}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )
                  })()}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Mark visited modal */}
      {visitPlace !== null && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={() => { setVisitPlace(null); setVisitMode(null); setNewTripTitle(""); setNewTripDescription("") }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl bg-background border shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <h3 className="font-semibold truncate pr-2">
                  Marcar «{visitPlace.name_pt ?? visitPlace.name}»
                </h3>
                <button
                  onClick={() => { setVisitPlace(null); setVisitMode(null); setNewTripTitle(""); setNewTripDescription("") }}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {visitMode === null ? (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => markVisitedMutation.mutate(visitPlace.id)}
                      disabled={markVisitedMutation.isPending}
                      className="w-full flex items-start gap-3 rounded-lg border bg-muted/30 hover:bg-muted/60 p-4 text-sm text-left transition-colors disabled:opacity-60"
                    >
                      {markVisitedMutation.isPending
                        ? <Loader2 className="size-4 shrink-0 mt-0.5 animate-spin" />
                        : <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-green-600" />
                      }
                      <div>
                        <p className="font-medium">Marcar como visitado diretamente</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Sem criar uma viagem. Contabiliza para o teu progresso pessoal.
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisitMode("trip")}
                      className="w-full flex items-start gap-3 rounded-lg border bg-muted/30 hover:bg-muted/60 p-4 text-sm text-left transition-colors"
                    >
                      <Layers className="size-4 shrink-0 mt-0.5 text-primary" />
                      <div>
                        <p className="font-medium">Criar uma nova viagem</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Cria uma viagem com este lugar e associa-a ao projeto. Os outros membros serão adicionados automaticamente.
                        </p>
                      </div>
                    </button>
                    {markVisitedMutation.error && (
                      <p className="text-sm text-destructive">{(markVisitedMutation.error as Error).message}</p>
                    )}
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (newTripTitle.trim()) {
                        createTripForPlaceMutation.mutate({
                          placeId: visitPlace.id,
                          title: newTripTitle.trim(),
                          description: newTripDescription.trim() || null,
                        })
                      }
                    }}
                    className="space-y-3"
                  >
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">Título da viagem *</label>
                      <Input
                        value={newTripTitle}
                        onChange={(e) => setNewTripTitle(e.target.value)}
                        placeholder={`Visita a ${visitPlace.name_pt ?? visitPlace.name}`}
                        required
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">Descrição (opcional)</label>
                      <textarea
                        value={newTripDescription}
                        onChange={(e) => setNewTripDescription(e.target.value)}
                        rows={2}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    {createTripForPlaceMutation.error && (
                      <p className="text-sm text-destructive">{(createTripForPlaceMutation.error as Error).message}</p>
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" type="button" className="flex-1" onClick={() => setVisitMode(null)}>
                        Voltar
                      </Button>
                      <Button
                        type="submit"
                        className="flex-1"
                        disabled={createTripForPlaceMutation.isPending || !newTripTitle.trim()}
                      >
                        {createTripForPlaceMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                        Criar viagem
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Media links */}
      <div className="glass-card p-5">
        <h2 className="font-semibold mb-4">Ligações</h2>

        {project.media_links && project.media_links.length > 0 && (
          <ul className="mb-4 space-y-2">
            {project.media_links.map((m) => (
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

      {/* Colaboradores */}
      {(() => {
        const accepted = (project.collaborators ?? []).filter((c) => c.status === "accepted")
        if (accepted.length === 0) return null
        return (
          <div className="glass-card p-5">
            <h2 className="font-semibold mb-4">
              Colaboradores <span className="text-sm font-normal text-muted-foreground">({accepted.length})</span>
            </h2>
            <ul className="space-y-2">
              {accepted.map((c) => (
                <li key={c.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                  {c.avatar_url ? (
                    <img src={c.avatar_url} alt="" className="size-7 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="size-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-medium">
                      {c.display_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <Link to={`/perfil/${c.username}`} className="flex-1 min-w-0 hover:text-primary transition-colors">
                    <span className="font-medium truncate block">{c.display_name}</span>
                    <span className="text-xs text-muted-foreground">@{c.username}</span>
                  </Link>
                  {!isCreator && c.user_id === user?.id && (
                    <button
                      type="button"
                      onClick={() => leaveProjectMutation.mutate()}
                      disabled={leaveProjectMutation.isPending}
                      className="shrink-0 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    >
                      {leaveProjectMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Sair do projeto"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {leaveProjectMutation.error && (
              <p className="mt-2 text-sm text-destructive">{(leaveProjectMutation.error as Error).message}</p>
            )}
          </div>
        )
      })()}

      {/* Mapa do projeto */}
      {(project.target_places ?? []).length > 0 && (
        <div className="glass-card p-5">
          <h2 className="font-semibold mb-4">Mapa</h2>
          <MiniMap
            places={(project.target_places ?? []).map((p) => ({
              id: p.id,
              osm_id: p.osm_id,
              name: p.name,
              name_pt: p.name_pt,
              place_type: p.place_type,
              country_code: p.country_code,
              centroid_lng: p.centroid_lng,
              centroid_lat: p.centroid_lat,
              geometry_geojson: p.geometry_geojson,
              dimmed: !p.visited,
            }))}
          />
        </div>
      )}

      {/* Details slide-over */}
      {isCreator && (
        <ProjectDetailsPanel
          open={showDetails}
          onClose={() => setShowDetails(false)}
          project={project}
          onSave={(data) => updateMutation.mutate(data)}
          isSaving={updateMutation.isPending}
          saveError={updateMutation.error ? (updateMutation.error as Error).message : null}
          onInvite={(username) => inviteMutation.mutate(username)}
          isInviting={inviteMutation.isPending}
          inviteError={inviteMutation.error ? (inviteMutation.error as Error).message : null}
          inviteSuccess={inviteMutation.isSuccess}
          onRemoveCollaborator={(id) => removeCollaboratorMutation.mutate(id)}
          isRemovingCollaborator={removeCollaboratorMutation.isPending}
          onAddSharedUser={(username) => addSharedUserMutation.mutate(username)}
          isAddingSharedUser={addSharedUserMutation.isPending}
          addSharedUserError={addSharedUserMutation.error ? (addSharedUserMutation.error as Error).message : null}
          onRemoveSharedUser={(userId) => removeSharedUserMutation.mutate(userId)}
          isRemovingSharedUser={removeSharedUserMutation.isPending}
          onDelete={() => deleteProjectMutation.mutate()}
          isDeleting={deleteProjectMutation.isPending}
          onArchive={() => archiveProjectMutation.mutate()}
          isArchiving={archiveProjectMutation.isPending}
        />
      )}
    </div>
    </ErrorBoundary>
  )
}
