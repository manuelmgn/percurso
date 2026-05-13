import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Briefcase, Calendar, MapPin, Loader2, Globe, Lock, Link2 } from "lucide-react"
import { tripsApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDateRange, VISIBILITY_LABELS } from "@/lib/utils"
import type { Trip } from "@/types"

const VISIBILITY_ICONS = {
  public: Globe,
  private: Lock,
  link: Link2,
  users: Lock,
}

function TripCard({ trip, onClick }: { trip: Trip; onClick: () => void }) {
  const Icon = VISIBILITY_ICONS[trip.visibility]
  return (
    <button onClick={onClick} className="glass-card p-0 text-left overflow-hidden hover:-translate-y-1 hover:shadow-xl transition-all duration-200 w-full">
      {/* Cover image */}
      <div className="relative h-36 bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900/30 dark:to-purple-800/30">
        {trip.cover_image_url ? (
          <img src={trip.cover_image_url} alt={trip.title} className="h-full w-full object-cover" />
        ) : trip.cover_image_generating ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-6 animate-spin text-purple-400" />
            <span className="ml-2 text-xs text-purple-400">A gerar imagem…</span>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <Briefcase className="size-10 text-purple-300" />
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

        {trip.companions.length > 0 && (
          <div className="mt-3 flex -space-x-1.5">
            {trip.companions.slice(0, 4).map((c) => (
              <div
                key={c.id}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-semibold ring-2 ring-background"
                title={c.display_name}
              >
                {c.display_name[0]}
              </div>
            ))}
            {trip.companions.length > 4 && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground text-[10px] ring-2 ring-background">
                +{trip.companions.length - 4}
              </div>
            )}
          </div>
        )}
      </div>
    </button>
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
        <h2 className="text-lg font-semibold mb-4">Nova Viagem</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate({ title, description })
          }}
          className="space-y-4"
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
  const { data: trips = [], isLoading } = useQuery({
    queryKey: ["trips"],
    queryFn: tripsApi.list,
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
            <TripCard key={trip.id} trip={trip} onClick={() => {}} />
          ))}
        </div>
      )}

      {showNew && (
        <NewTripModal onClose={() => setShowNew(false)} onCreated={() => {}} />
      )}
    </div>
  )
}
