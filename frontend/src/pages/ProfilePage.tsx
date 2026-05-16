import { useParams, useNavigate, Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Loader2, Globe, MapPin, Briefcase, FolderOpen } from "lucide-react"
import { usersApi } from "@/lib/api"
import { useAuthStore } from "@/stores/auth"
import { getPlaceEmoji, getPlaceLabel } from "@/lib/placeTypes"
import type { TripPublicSummary, ProjectPublicSummary } from "@/types"

function CoverCard({ colour, imageUrl }: { colour: string | null; imageUrl: string | null }) {
  const bg = colour ?? "#7C3AED"
  return (
    <div
      className="h-20 w-full rounded-xl overflow-hidden shrink-0"
      style={imageUrl ? {} : { backgroundColor: bg }}
    >
      {imageUrl && <img src={imageUrl} alt="" className="h-full w-full object-cover" />}
    </div>
  )
}

function TripCard({ trip }: { trip: TripPublicSummary }) {
  const dates = [trip.start_date, trip.end_date].filter(Boolean).join(" → ")
  return (
    <Link
      to={`/viagens/${trip.id}`}
      className="glass-card block hover:ring-2 hover:ring-primary/30 transition-all rounded-xl overflow-hidden"
    >
      <CoverCard colour={trip.cover_colour} imageUrl={trip.cover_image_url} />
      <div className="p-3 space-y-0.5">
        <p className="font-medium text-sm truncate">{trip.title}</p>
        {dates && <p className="text-xs text-muted-foreground">{dates}</p>}
        <p className="text-xs text-muted-foreground">{trip.place_count} lugar{trip.place_count !== 1 ? "es" : ""}</p>
      </div>
    </Link>
  )
}

function ProjectCard({ project }: { project: ProjectPublicSummary }) {
  const pct = project.target_place_count > 0
    ? Math.round((project.visited_place_count / project.target_place_count) * 100)
    : 0
  return (
    <Link
      to={`/projetos/${project.id}`}
      className="glass-card block hover:ring-2 hover:ring-primary/30 transition-all rounded-xl overflow-hidden"
    >
      <CoverCard colour={project.cover_colour} imageUrl={project.cover_image_url} />
      <div className="p-3 space-y-1.5">
        <p className="font-medium text-sm truncate">{project.title}</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-muted-foreground shrink-0">{pct}%</span>
        </div>
      </div>
    </Link>
  )
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>()
  const navigate = useNavigate()
  const { user: me } = useAuthStore()

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["profile", username],
    queryFn: () => usersApi.profile(username!),
    enabled: !!username,
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Utilizador não encontrado.</p>
      </div>
    )
  }

  const isMe = me?.username === profile.username

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Voltar
      </button>

      {/* Profile header */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-2xl font-bold overflow-hidden">
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt={profile.display_name} className="h-full w-full object-cover" />
              : profile.display_name[0]?.toUpperCase()
            }
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight">{profile.display_name}</h1>
            <p className="text-sm text-muted-foreground">@{profile.username}</p>
            {isMe && (
              <Link to="/definicoes" className="text-xs text-primary hover:underline mt-0.5 inline-block">
                Editar perfil
              </Link>
            )}
          </div>
        </div>

        {profile.biography && (
          <p className="text-sm text-muted-foreground leading-relaxed">{profile.biography}</p>
        )}

        <div className="flex flex-wrap gap-4 text-sm">
          {profile.visited_place_count !== null && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="size-3.5" />
              <span>{profile.visited_place_count} lugar{profile.visited_place_count !== 1 ? "es" : ""} visitado{profile.visited_place_count !== 1 ? "s" : ""}</span>
            </div>
          )}
          {profile.trips.length > 0 && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Briefcase className="size-3.5" />
              <span>{profile.trips.length} viagem{profile.trips.length !== 1 ? "ns" : ""}</span>
            </div>
          )}
          {profile.projects.length > 0 && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <FolderOpen className="size-3.5" />
              <span>{profile.projects.length} projeto{profile.projects.length !== 1 ? "s" : ""}</span>
            </div>
          )}
          {profile.website_url && (
            <a
              href={profile.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-primary hover:underline"
            >
              <Globe className="size-3.5" />
              <span className="truncate max-w-[200px]">{profile.website_url.replace(/^https?:\/\//, "")}</span>
            </a>
          )}
        </div>
      </div>

      {/* Public trips */}
      {profile.trips.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">Viagens públicas</h2>
          <div className="grid grid-cols-2 gap-3">
            {profile.trips.map((t) => <TripCard key={t.id} trip={t} />)}
          </div>
        </div>
      )}

      {/* Public projects */}
      {profile.projects.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">Projetos públicos</h2>
          <div className="grid grid-cols-2 gap-3">
            {profile.projects.map((p) => <ProjectCard key={p.id} project={p} />)}
          </div>
        </div>
      )}

      {/* Visited places (public only) */}
      {profile.visited_places.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">Lugares visitados</h2>
          <ul className="space-y-1.5">
            {profile.visited_places.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
              >
                <span className="text-base shrink-0" title={getPlaceLabel(p.place_type)}>
                  {getPlaceEmoji(p.place_type)}
                </span>
                <span className="font-medium">{p.name_pt ?? p.name}</span>
                <span className="text-xs text-muted-foreground">
                  {p.country_code ? `· ${p.country_code.toUpperCase()}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {profile.trips.length === 0 && profile.projects.length === 0 && profile.visited_places.length === 0 && (
        <p className="text-sm text-muted-foreground">Este utilizador ainda não tem conteúdo público.</p>
      )}
    </div>
  )
}
