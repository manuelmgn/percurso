import { useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Loader2, MapPin, Users, Target } from "lucide-react"
import { projectsApi } from "@/lib/api"
import { PLACE_TYPE_LABELS } from "@/lib/utils"

export default function SharedProjectPage() {
  const { token } = useParams<{ token: string }>()

  const { data: project, isLoading, isError } = useQuery({
    queryKey: ["project-shared", token],
    queryFn: () => projectsApi.getShared(token!),
    enabled: !!token,
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError || !project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Projeto não encontrado</h1>
          <p className="text-muted-foreground">Este link pode ter expirado ou ser inválido.</p>
        </div>
      </div>
    )
  }

  const colour = project.cover_colour ?? "#7C3AED"
  const progressPct = project.target_place_count > 0
    ? Math.round((project.visited_place_count / project.target_place_count) * 100)
    : 0

  return (
    <div className="min-h-screen bg-background">
      {/* Cover */}
      <div
        className="relative h-64 w-full overflow-hidden"
        style={project.cover_image_url ? {} : { backgroundColor: colour }}
      >
        {project.cover_image_url ? (
          <img src={project.cover_image_url} alt={project.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-end p-8">
            <span className="text-white font-bold text-3xl leading-tight drop-shadow">{project.title}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
      </div>

      <div className="mx-auto max-w-2xl p-6">
        <div className="mb-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Projeto partilhado por {project.creator_display_name}
          </span>
        </div>

        <h1 className="text-3xl font-bold mb-3">{project.title}</h1>

        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-6">
          <span className="flex items-center gap-1.5">
            <Target className="size-4" />
            {project.target_place_count} lugares alvo
          </span>
          {project.collaborators.length > 0 && (
            <span className="flex items-center gap-1.5">
              <Users className="size-4" />
              {project.collaborators.length + 1} participantes
            </span>
          )}
        </div>

        {project.target_place_count > 0 && (
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-muted-foreground">Progresso</span>
              <span className="font-medium">{project.visited_place_count}/{project.target_place_count} ({progressPct}%)</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {project.description && (
          <p className="text-foreground/80 leading-relaxed mb-4">{project.description}</p>
        )}

        {project.goal_description && (
          <div className="glass-card p-4 mb-4">
            <h2 className="font-semibold mb-1 flex items-center gap-2">
              <MapPin className="size-4" /> Objetivo
            </h2>
            <p className="text-muted-foreground text-sm">{project.goal_description}</p>
          </div>
        )}

        {project.target_places && project.target_places.length > 0 && (
          <div>
            <h2 className="font-semibold mb-3">Lugares alvo</h2>
            <ul className="space-y-1.5">
              {project.target_places.map((p) => (
                <li key={p.id} className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                  <span className="font-medium">{p.name_pt ?? p.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {PLACE_TYPE_LABELS[p.place_type] ?? p.place_type}
                    {p.country_code ? ` · ${p.country_code.toUpperCase()}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
