import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { usersApi } from "@/lib/api"
import { useAuthStore } from "@/stores/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { VISIBILITY_LABELS } from "@/lib/utils"
import { Loader2, Check } from "lucide-react"
import type { Visibility } from "@/types"

function VisibilitySelect({
  value,
  onChange,
}: {
  value: Visibility
  onChange: (v: Visibility) => void
}) {
  return (
    <div className="glass flex rounded-xl p-1 gap-1">
      {(["public", "private", "link", "users"] as Visibility[]).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
            value === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {VISIBILITY_LABELS[v]}
        </button>
      ))}
    </div>
  )
}

export default function SettingsPage() {
  const { user, setUser } = useAuthStore()
  const [displayName, setDisplayName] = useState(user?.display_name ?? "")
  const [biography, setBiography] = useState(user?.biography ?? "")
  const [websiteUrl, setWebsiteUrl] = useState(user?.website_url ?? "")
  const [tripVisibility, setTripVisibility] = useState<Visibility>(user?.default_trip_visibility ?? "private")
  const [projectVisibility, setProjectVisibility] = useState<Visibility>(user?.default_project_visibility ?? "private")
  const [placesVisibility, setPlacesVisibility] = useState<Visibility>(user?.visited_places_visibility ?? "private")
  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: (data: unknown) => usersApi.update(data as Partial<typeof user>),
    onSuccess: (updatedUser) => {
      setUser(updatedUser)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({
      display_name: displayName,
      biography,
      website_url: websiteUrl,
      default_trip_visibility: tripVisibility,
      default_project_visibility: projectVisibility,
      visited_places_visibility: placesVisibility,
    })
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Definições</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Profile */}
        <div className="glass-card p-6 space-y-4">
          <h2 className="font-semibold text-base">Perfil</h2>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Nome de apresentação</label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Biografia</label>
            <Input value={biography} onChange={(e) => setBiography(e.target.value)} placeholder="Conta algo sobre ti…" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Website ou rede social</label>
            <Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://…" type="url" />
          </div>
        </div>

        {/* Privacy */}
        <div className="glass-card p-6 space-y-5">
          <h2 className="font-semibold text-base">Privacidade</h2>
          <div>
            <label className="mb-2 block text-sm font-medium">Visibilidade predefinida das novas viagens</label>
            <VisibilitySelect value={tripVisibility} onChange={setTripVisibility} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Visibilidade predefinida dos novos projectos</label>
            <VisibilitySelect value={projectVisibility} onChange={setProjectVisibility} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Visibilidade da lista de lugares visitados</label>
            <VisibilitySelect value={placesVisibility} onChange={setPlacesVisibility} />
          </div>
        </div>

        {mutation.error && (
          <p className="text-sm text-destructive">{mutation.error.message}</p>
        )}

        <Button type="submit" disabled={mutation.isPending} className="w-full">
          {mutation.isPending ? <Loader2 className="animate-spin" /> : saved ? <><Check className="size-4" /> Guardado</> : "Guardar alterações"}
        </Button>
      </form>
    </div>
  )
}
