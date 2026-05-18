import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Plus, Briefcase, Calendar, MapPin, Loader2, Globe, Lock, Link2, Pin } from "lucide-react"
import { tripsApi } from "@/lib/api"
import { useAuthStore } from "@/stores/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatDateRange } from "@/lib/utils"
import type { Trip } from "@/types"

const VISIBILITY_ICONS = {
  public: Globe,
  private: Lock,
  link: Link2,
  users: Lock,
}

function TripCard({ trip, onClick, isOwner }: { trip: Trip; onClick: () => void; isOwner: boolean }) {
  const queryClient = useQueryClient()
  const Icon = VISIBILITY_ICONS[trip.visibility]
  const colour = trip.cover_colour ?? "#7C3AED"

  const pinMutation = useMutation({
    mutationFn: () => trip.is_pinned ? tripsApi.unpin(trip.id) : tripsApi.pin(trip.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trips"] }),
  })

  return (
    <div className="relative">
      {isOwner && (
        <button
          onClick={(e) => { e.stopPropagation(); pinMutation.mutate() }}
          title={trip.is_pinned ? "Desafixar viagem" : "Fixar viagem no perfil"}
          className={`absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full transition-all ${
            trip.is_pinned
              ? "bg-primary text-primary-foreground opacity-100 shadow"
              : "bg-black/30 text-white opacity-40 hover:opacity-80"
          }`}
        >
          <Pin className="size-3.5" />
        </button>
      )}
      <button onClick={onClick} className="glass-card p-0 text-left overflow-hidden hover:-translate-y-1 hover:shadow-xl transition-all duration-200 w-full">
        {/* Cover */}
        <div className="relative h-36 overflow-hidden" style={trip.cover_image_url ? {} : { backgroundColor: colour }}>
          {trip.cover_image_url ? (
            <img src={trip.cover_image_url} alt={trip.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-end p-4">
              <span className="text-white font-bold text-base leading-tight line-clamp-3 drop-shadow">{trip.title}</span>
            </div>
          )}
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-tight">{trip.title}</h3>
            <Icon className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
          </div>

          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            {(trip.start_date || trip.end_date) && (
              <span className="flex items-center gap-1">
                <Calendar className="size-3" />
                {formatDateRange(trip.start_date, trip.end_date)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <MapPin className="size-3" />
              {trip.place_count} lugares
            </span>
          </div>

          {(trip.companions ?? []).length > 0 && (
            <div className="mt-3 flex -space-x-1.5">
              {(trip.companions ?? []).slice(0, 4).map((c) => (
                <div
                  key={c.id}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-semibold ring-2 ring-background"
                  title={c.display_name}
                >
                  {c.display_name[0]}
                </div>
              ))}
              {(trip.companions ?? []).length > 4 && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground text-[10px] ring-2 ring-background">
                  +{(trip.companions ?? []).length - 4}
                </div>
              )}
            </div>
          )}
        </div>
      </button>
      {pinMutation.error && (
        <p className="mt-1 text-xs text-destructive px-1">{(pinMutation.error as Error).message}</p>
      )}
    </div>
  )
}

function NewTripModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (data: { title: string; description: string }) => tripsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] })
      onCreated()
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="glass-panel w-full max-w-md p-6 animate-fade-in">
        <h2 className="text-lg font-semibold mb-4">Nova viagem</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate({ title, description })
          }}
          className="space-y-4"
          noValidate
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium">Título</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Viagem ao Porto"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Descrição (opcional)</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Uma breve descrição…"
            />
          </div>
          {mutation.error && (
            <p className="text-sm text-destructive">{mutation.error.message}</p>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="animate-spin" /> : "Criar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function TripsPage() {
  const [showNew, setShowNew] = useState(false)
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { data: trips = [], isLoading } = useQuery({
    queryKey: ["trips"],
    queryFn: tripsApi.list,
    staleTime: 30_000,
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Viagens</h1>
          <p className="text-sm text-muted-foreground mt-1">{trips.length} viagens registadas</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="size-4" />
          Nova viagem
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : trips.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <Briefcase className="mx-auto mb-4 size-12 text-purple-300" />
          <h3 className="text-lg font-semibold mb-2">Ainda sem viagens</h3>
          <p className="text-muted-foreground mb-6">Começa por criar a tua primeira viagem.</p>
          <Button onClick={() => setShowNew(true)}>
            <Plus className="size-4" />
            Criar viagem
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} isOwner={trip.creator_id === user?.id} onClick={() => navigate(`/viagens/${trip.id}`)} />
          ))}
        </div>
      )}

      {showNew && (
        <NewTripModal onClose={() => setShowNew(false)} onCreated={() => {}} />
      )}
    </div>
  )
}
