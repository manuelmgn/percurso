import { useRef, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Upload, Sparkles, Loader2, Target } from "lucide-react"
import { projectsApi } from "@/lib/api"
import { Button } from "@/components/ui/button"

function wordCount(text: string | null): number {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const projectId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projectsApi.get(projectId),
    enabled: !!projectId,
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => projectsApi.uploadCover(projectId, file),
    onSuccess: (updated) => {
      queryClient.setQueryData(["project", projectId], updated)
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      setUploadError(null)
    },
    onError: (err: Error) => setUploadError(err.message),
  })

  const generateMutation = useMutation({
    mutationFn: () => projectsApi.generateCover(projectId),
    onSuccess: (updated) => {
      queryClient.setQueryData(["project", projectId], updated)
      queryClient.invalidateQueries({ queryKey: ["projects"] })
    },
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Projeto não encontrado.</p>
      </div>
    )
  }

  const colour = project.cover_colour ?? "#7C3AED"
  const descWords = wordCount(project.description)
  const canGenerate = descWords >= 8

  const pct = project.target_place_count === 0
    ? 0
    : Math.round((project.visited_place_count / project.target_place_count) * 100)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadMutation.mutate(file)
    e.target.value = ""
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <button
        onClick={() => navigate("/projetos")}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Projetos
      </button>

      {/* Cover preview */}
      <div
        className="relative h-40 rounded-2xl overflow-hidden mb-6"
        style={project.cover_image_url ? {} : { backgroundColor: colour }}
      >
        {project.cover_image_url ? (
          <img src={project.cover_image_url} alt={project.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-end p-5">
            <span className="text-white font-bold text-xl leading-tight drop-shadow">{project.title}</span>
          </div>
        )}
      </div>

      {/* Title and meta */}
      <h1 className="text-2xl font-bold mb-1">{project.title}</h1>
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Target className="size-3.5" />
        <span>{project.visited_place_count} de {project.target_place_count} lugares visitados ({pct}%)</span>
      </div>

      {project.description && (
        <p className="text-muted-foreground mb-2">{project.description}</p>
      )}
      {project.goal_description && (
        <p className="text-sm text-muted-foreground mb-6 italic">{project.goal_description}</p>
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
