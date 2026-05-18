import { useParams, useNavigate, Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Loader2, Globe, MapPin, Flag, BarChart2, ChevronRight } from "lucide-react"
import { usersApi } from "@/lib/api"
import { useAuthStore } from "@/stores/auth"
import MiniMap from "@/components/map/MiniMap"
import type { TripPublicSummary, ProjectPublicSummary, VisitedPlacePublic } from "@/types"

// ── Small card components ──────────────────────────────────────────────────

function CoverArea({ colour, imageUrl, title }: { colour: string | null; imageUrl: string | null; title: string }) {
  const bg = colour ?? "#7C3AED"
  return (
    <div className="h-24 w-full rounded-xl overflow-hidden shrink-0" style={imageUrl ? {} : { backgroundColor: bg }}>
      {imageUrl
        ? <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
        : <div className="flex h-full items-end p-3">
            <span className="text-white font-bold text-xs leading-tight line-clamp-2 drop-shadow">{title}</span>
          </div>
      }
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
      <CoverArea colour={trip.cover_colour} imageUrl={trip.cover_image_url} title={trip.title} />
      <div className="p-3 space-y-0.5">
        <p className="font-medium text-sm truncate">{trip.title}</p>
        {dates && <p className="text-xs text-muted-foreground">{dates}</p>}
        <p className="text-xs text-muted-foreground">
          {trip.place_count} lugar{trip.place_count !== 1 ? "es" : ""}
        </p>
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
      <CoverArea colour={project.cover_colour} imageUrl={project.cover_image_url} title={project.title} />
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

function StatCard({ icon: Icon, value, label }: { icon: React.ElementType; value: string | number; label: string }) {
  return (
    <div className="glass-card p-4 flex flex-col items-center text-center gap-1">
      <Icon className="size-5 text-primary mb-1" />
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground leading-tight">{label}</p>
    </div>
  )
}

// ── Map helper — converts VisitedPlacePublic to MapPlace ──────────────────

function placeToMapPlace(p: VisitedPlacePublic) {
  return {
    id: p.id,
    osm_id: p.id,
    name: p.name,
    name_pt: p.name_pt,
    place_type: p.place_type,
    country_code: p.country_code,
    centroid_lng: p.centroid_lng,
    centroid_lat: p.centroid_lat,
    geometry_geojson: p.geometry_geojson,
  }
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>()
  const navigate = useNavigate()
  const { user: me } = useAuthStore()

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["profile", username],
    queryFn: () => usersApi.profile(username!),
    enabled: !!username,
    staleTime: 2 * 60_000,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Voltar
        </button>
        <p className="text-muted-foreground">Utilizador não encontrado.</p>
      </div>
    )
  }

  const isMe = me?.username === profile.username
  const allTrips = [...profile.pinned_trips, ...profile.recent_trips]
  const allProjects = [...profile.pinned_projects, ...profile.active_projects]
  const hasMoreTrips = profile.total_public_trip_count > allTrips.length
  const hasMoreProjects = profile.total_public_project_count > allProjects.length

  const mapPlaces = profile.visited_places
    .filter((p) => p.centroid_lng != null && p.centroid_lat != null)
    .map(placeToMapPlace)

  return (
    <div className="max-w-2xl mx-auto space-y-0">
      {/* ── Back button ────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-2">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Voltar
        </button>
      </div>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-6 pb-6">
        <div className="glass-card overflow-hidden">
          {/* Decorative colour bar */}
          <div className="h-20 bg-gradient-to-br from-primary/60 to-primary/20" />

          <div className="px-6 pb-6">
            {/* Avatar overlapping the bar */}
            <div className="-mt-10 mb-4 flex items-end justify-between">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-background border-4 border-background overflow-hidden text-2xl font-bold text-primary shadow-lg">
                {profile.avatar_url
                  ? <img src={profile.avatar_url} alt={profile.display_name} className="h-full w-full object-cover" />
                  : profile.display_name[0]?.toUpperCase()
                }
              </div>
              {isMe && (
                <Link
                  to="/definicoes"
                  className="text-xs text-primary hover:underline"
                >
                  Editar perfil
                </Link>
              )}
            </div>

            <h1 className="text-xl font-bold leading-tight">{profile.display_name}</h1>
            <p className="text-sm text-muted-foreground">@{profile.username}</p>

            {profile.biography && (
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{profile.biography}</p>
            )}

            {profile.website_url && (
              <a
                href={profile.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <Globe className="size-3.5" />
                <span className="truncate max-w-[260px]">
                  {profile.website_url.replace(/^https?:\/\//, "")}
                </span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      {profile.stats && (
        <div className="px-6 pb-6">
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              icon={MapPin}
              value={profile.stats.total_places}
              label={`lugar${profile.stats.total_places !== 1 ? "es" : ""} visitado${profile.stats.total_places !== 1 ? "s" : ""}`}
            />
            <StatCard
              icon={Flag}
              value={profile.stats.total_countries}
              label={`pa${profile.stats.total_countries !== 1 ? "íses" : "ís"}`}
            />
            <StatCard
              icon={BarChart2}
              value={`${profile.stats.avg_project_completion}%`}
              label="média dos projetos"
            />
          </div>
        </div>
      )}

      {/* ── Map ────────────────────────────────────────────────────────── */}
      {mapPlaces.length > 0 && (
        <div className="px-6 pb-6">
          <MiniMap places={mapPlaces} className="h-56 w-full rounded-2xl overflow-hidden" />
        </div>
      )}

      {/* ── Últimas viagens ────────────────────────────────────────────── */}
      {allTrips.length > 0 && (
        <div className="px-6 pb-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Últimas viagens</h2>
            {hasMoreTrips && (
              <Link
                to={`/perfil/${profile.username}/viagens`}
                className="flex items-center gap-0.5 text-xs text-primary hover:underline"
              >
                Ver mais
                <ChevronRight className="size-3.5" />
              </Link>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {allTrips.map((t) => <TripCard key={t.id} trip={t} />)}
          </div>
        </div>
      )}

      {/* ── Projetos ───────────────────────────────────────────────────── */}
      {allProjects.length > 0 && (
        <div className="px-6 pb-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Projetos</h2>
            {hasMoreProjects && (
              <Link
                to={`/perfil/${profile.username}/projetos`}
                className="flex items-center gap-0.5 text-xs text-primary hover:underline"
              >
                Ver mais
                <ChevronRight className="size-3.5" />
              </Link>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {allProjects.map((p) => <ProjectCard key={p.id} project={p} />)}
          </div>
        </div>
      )}

      {allTrips.length === 0 && allProjects.length === 0 && mapPlaces.length === 0 && (
        <div className="px-6 pb-6">
          <p className="text-sm text-muted-foreground">
            Este utilizador ainda não tem conteúdo público.
          </p>
        </div>
      )}
    </div>
  )
}
