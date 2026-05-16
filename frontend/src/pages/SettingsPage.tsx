import { useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { usersApi } from "@/lib/api"
import { useAuthStore } from "@/stores/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { VISIBILITY_LABELS } from "@/lib/utils"
import { Loader2, Check, Camera, X } from "lucide-react"
import type { Visibility, User } from "@/types"

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
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [displayName, setDisplayName] = useState(user?.display_name ?? "")
  const [biography, setBiography] = useState(user?.biography ?? "")
  const [websiteUrl, setWebsiteUrl] = useState(user?.website_url ?? "")
  const [tripVisibility, setTripVisibility] = useState<Visibility>(user?.default_trip_visibility ?? "private")
  const [projectVisibility, setProjectVisibility] = useState<Visibility>(user?.default_project_visibility ?? "private")
  const [placesVisibility, setPlacesVisibility] = useState<Visibility>(user?.visited_places_visibility ?? "private")
  const [saved, setSaved] = useState(false)

  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const avatarMutation = useMutation({
    mutationFn: (file: File) => usersApi.uploadAvatar(file),
    onSuccess: (updatedUser) => setUser(updatedUser),
  })

  const mutation = useMutation({
    mutationFn: (data: unknown) => usersApi.update(data as Partial<User>),
    onSuccess: (updatedUser) => {
      setUser(updatedUser)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const passwordMutation = useMutation({
    mutationFn: () => usersApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setPasswordError(null)
      setPasswordSaved(true)
      setTimeout(() => {
        setPasswordSaved(false)
        setShowPasswordModal(false)
      }, 1500)
    },
    onError: (err: Error) => setPasswordError(err.message),
  })

  function openPasswordModal() {
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setPasswordError(null)
    setPasswordSaved(false)
    setShowPasswordModal(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({
      display_name: displayName,
      biography,
      website_url: websiteUrl.trim() || null,
      default_trip_visibility: tripVisibility,
      default_project_visibility: projectVisibility,
      visited_places_visibility: placesVisibility,
    })
  }

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    if (newPassword !== confirmPassword) {
      setPasswordError("As palavras-passe não coincidem")
      return
    }
    passwordMutation.mutate()
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Definições</h1>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Profile */}
        <div className="glass-card p-6 space-y-4">
          <h2 className="font-semibold text-base">Perfil</h2>

          {/* Avatar */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarMutation.isPending}
              className="group relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-2xl font-bold overflow-hidden ring-2 ring-transparent hover:ring-primary/40 transition-all"
            >
              {user?.avatar_url
                ? <img src={user.avatar_url} alt={user.display_name} className="h-full w-full object-cover" />
                : user?.display_name[0]?.toUpperCase()
              }
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                {avatarMutation.isPending
                  ? <Loader2 className="size-5 text-white animate-spin" />
                  : <Camera className="size-5 text-white" />
                }
              </div>
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) avatarMutation.mutate(file)
                e.target.value = ""
              }}
            />
            <div>
              <p className="text-sm font-medium">Foto de perfil</p>
              <p className="text-xs text-muted-foreground">JPEG, PNG, WebP ou GIF · máx. 5 MB</p>
              {avatarMutation.error && (
                <p className="text-xs text-destructive mt-0.5">{(avatarMutation.error as Error).message}</p>
              )}
            </div>
          </div>

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
            <Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://…" type="text" />
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
            <label className="mb-2 block text-sm font-medium">Visibilidade predefinida dos novos projetos</label>
            <VisibilitySelect value={projectVisibility} onChange={setProjectVisibility} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Visibilidade da lista de lugares visitados</label>
            <VisibilitySelect value={placesVisibility} onChange={setPlacesVisibility} />
            {placesVisibility === "link" && user?.visited_places_sharing_token && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                <span className="text-muted-foreground truncate flex-1">
                  {window.location.origin}/perfil/{user.username}/lugares?token={user.visited_places_sharing_token}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-primary hover:underline"
                  onClick={() => navigator.clipboard.writeText(
                    `${window.location.origin}/perfil/${user.username}/lugares?token=${user.visited_places_sharing_token}`
                  )}
                >
                  Copiar
                </button>
              </div>
            )}
            {placesVisibility === "link" && !user?.visited_places_sharing_token && (
              <p className="mt-1.5 text-xs text-muted-foreground">Guarda as alterações para gerar o link de partilha.</p>
            )}
          </div>
        </div>

        {mutation.error && (
          <p className="text-sm text-destructive">{mutation.error.message}</p>
        )}

        <Button type="submit" disabled={mutation.isPending} className="w-full">
          {mutation.isPending ? <Loader2 className="animate-spin" /> : saved ? <><Check className="size-4" /> Guardado</> : "Guardar alterações"}
        </Button>
      </form>

      {/* Password */}
      <div className="glass-card p-6 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-base">Palavra-passe</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Altera a tua palavra-passe de acesso</p>
        </div>
        <Button type="button" variant="outline" onClick={openPasswordModal}>
          Alterar palavra-passe
        </Button>
      </div>

      {/* Password modal */}
      {showPasswordModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowPasswordModal(false) }}
        >
          <div className="glass-card w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base">Alterar palavra-passe</h2>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={handlePasswordSubmit} className="space-y-4" noValidate>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Palavra-passe atual</label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Nova palavra-passe</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Confirmar nova palavra-passe</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
              <Button
                type="submit"
                disabled={passwordMutation.isPending || !currentPassword || !newPassword || !confirmPassword}
                className="w-full"
              >
                {passwordMutation.isPending
                  ? <Loader2 className="animate-spin" />
                  : passwordSaved
                  ? <><Check className="size-4" /> Palavra-passe alterada</>
                  : "Guardar nova palavra-passe"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
