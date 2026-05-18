import { useParams, useNavigate, Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Loader2 } from "lucide-react"
import { usersApi } from "@/lib/api"
import type { ProjectPublicSummary } from "@/types"

function ProjectCard({ project }: { project: ProjectPublicSummary }) {
  const bg = project.cover_colour ?? "#7C3AED"
  const pct = project.target_place_count > 0
    ? Math.round((project.visited_place_count / project.target_place_count) * 100)
    : 0
  return (
    <Link
      to={`/projetos/${project.id}`}
      className="glass-card block hover:ring-2 hover:ring-primary/30 transition-all rounded-xl overflow-hidden"
    >
      <div className="h-24 w-full overflow-hidden" style={project.cover_image_url ? {} : { backgroundColor: bg }}>
        {project.cover_image_url
          ? <img src={project.cover_image_url} alt={project.title} className="h-full w-full object-cover" />
          : <div className="flex h-full items-end p-3">
              <span className="text-white font-bold text-xs drop-shadow line-clamp-2">{project.title}</span>
            </div>
        }
      </div>
      <div className="p-3 space-y-1.5">
        <p className="font-medium text-sm truncate">{project.title}</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-muted-foreground shrink-0">{pct}%</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {project.visited_place_count} / {project.target_place_count} lugares
        </p>
      </div>
    </Link>
  )
}

export default function PublicProjectsPage() {
  const { username } = useParams<{ username: string }>()
  const navigate = useNavigate()

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["public-projects", username],
    queryFn: () => usersApi.publicProjects(username!),
    enabled: !!username,
    staleTime: 2 * 60_000,
  })

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Voltar
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Projetos de @{username}</h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem projetos públicos.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}
    </div>
  )
}
