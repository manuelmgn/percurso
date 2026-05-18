import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { adminApi, usersApi } from "@/lib/api"
import { useAuthStore } from "@/stores/auth"
import { Loader2, Users, Map, Briefcase, FolderOpen, CheckCircle, XCircle, Plus, Settings, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import type { User } from "@/types"

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number | string }) {
  return (
    <div className="glass-card p-4 md:p-5 flex items-center gap-3 md:gap-4">
      <div className="flex h-10 w-10 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
        <Icon className="size-5 md:size-6 text-primary" />
      </div>
      <div>
        <p className="text-xl md:text-2xl font-bold">{value}</p>
        <p className="text-xs md:text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<"user" | "admin">("user")
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (data: unknown) => usersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] })
      setUsername("")
      setEmail("")
      setPassword("")
      setRole("user")
      setOpen(false)
      onCreated()
    },
  })

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="size-4" />
        Criar utilizador
      </Button>
    )
  }

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Criar utilizador</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
        >
          <X className="size-4" />
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate({ username, email, password, display_name: username, role })
        }}
        className="space-y-3"
        noValidate
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Nome de utilizador</label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="utilizador" required className="h-11 text-base md:h-9 md:text-sm" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" required className="h-11 text-base md:h-9 md:text-sm" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Palavra-passe</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required className="h-11 text-base md:h-9 md:text-sm" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Função</label>
            <div className="glass flex rounded-xl p-1 gap-1 h-11 md:h-10">
              {(["user", "admin"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 rounded-lg text-xs font-medium transition-all ${
                    role === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r === "admin" ? "Admin" : "Utilizador"}
                </button>
              ))}
            </div>
          </div>
        </div>
        {mutation.error && <p className="text-sm text-destructive">{mutation.error.message}</p>}
        <div className="flex gap-3 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="animate-spin" /> : "Criar"}
          </Button>
        </div>
      </form>
    </div>
  )
}

export default function AdminPage() {
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuthStore()
  const { data: stats } = useQuery({ queryKey: ["admin-stats"], queryFn: adminApi.stats })
  const { data: health } = useQuery({ queryKey: ["admin-health"], queryFn: adminApi.health, refetchInterval: 30_000 })
  const { data: users = [], isLoading: usersLoading } = useQuery({ queryKey: ["admin-users"], queryFn: usersApi.list })
  const { data: siteSettings } = useQuery({ queryKey: ["admin-settings"], queryFn: adminApi.getSettings })

  const deactivate = useMutation({
    mutationFn: usersApi.deactivate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  })
  const reactivate = useMutation({
    mutationFn: usersApi.reactivate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  })
  const updateSettings = useMutation({
    mutationFn: adminApi.updateSettings,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-settings"] }),
  })

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold">Painel de administração</h1>

      {/* Stats — 2 cols on mobile, 4 on desktop */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatCard icon={Users} label="Utilizadores" value={stats.users} />
          <StatCard icon={Briefcase} label="Viagens" value={stats.trips} />
          <StatCard icon={FolderOpen} label="Projetos" value={stats.projects} />
          <StatCard icon={Map} label="Lugares únicos" value={stats.unique_places} />
        </div>
      )}

      {/* Health */}
      {health && (
        <div className="glass-card p-4 md:p-5">
          <h2 className="font-semibold mb-3">Estado do sistema</h2>
          <div className="flex flex-wrap gap-4">
            {Object.entries(health).map(([key, status]) => (
              <div key={key} className="flex items-center gap-2">
                {status === "ok"
                  ? <CheckCircle className="size-4 text-green-500" />
                  : <XCircle className="size-4 text-destructive" />}
                <span className="text-sm capitalize">{key}</span>
                <Badge variant={status === "ok" ? "purple" : "destructive"}>{status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Site settings */}
      {siteSettings !== undefined && (
        <div className="glass-card p-4 md:p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="size-4 text-muted-foreground" />
            <h2 className="font-semibold">Configurações do site</h2>
          </div>
          <label className="flex items-start sm:items-center justify-between gap-4 cursor-pointer">
            <div>
              <p className="text-sm font-medium">Permitir acesso a perfis públicos sem sessão iniciada</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Quando desativado, utilizadores não autenticados são redirecionados para o login.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={siteSettings.allow_public_profiles_without_auth}
              onClick={() =>
                updateSettings.mutate({
                  allow_public_profiles_without_auth: !siteSettings.allow_public_profiles_without_auth,
                })
              }
              disabled={updateSettings.isPending}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                siteSettings.allow_public_profiles_without_auth ? "bg-primary" : "bg-input"
              }`}
            >
              <span
                className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                  siteSettings.allow_public_profiles_without_auth ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </label>
        </div>
      )}

      {/* Create user */}
      <CreateUserForm onCreated={() => {}} />

      {/* Users — table on desktop, cards on mobile */}
      <div className="glass-card overflow-hidden">
        <div className="p-4 md:p-5 border-b border-border/50">
          <h2 className="font-semibold">Utilizadores</h2>
        </div>
        {usersLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <div className="md:hidden divide-y divide-border/50">
              {users.map((user: User) => (
                <div key={user.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">{user.display_name}</p>
                      <p className="text-xs text-muted-foreground">@{user.username}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{user.email}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <Badge variant={user.role === "admin" ? "default" : "secondary"} className="text-xs">
                        {user.role === "admin" ? "Admin" : "Utilizador"}
                      </Badge>
                      <Badge variant={user.is_active ? "purple" : "outline"} className="text-xs">
                        {user.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                  </div>
                  {user.id !== currentUser?.id && (
                    <div className="flex justify-end">
                      {user.is_active ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => deactivate.mutate(user.id)}
                          disabled={deactivate.isPending}
                        >
                          Desativar
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => reactivate.mutate(user.id)}
                          disabled={reactivate.isPending}
                        >
                          Reativar
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr className="text-left">
                    <th className="px-5 py-3 font-medium text-muted-foreground">Utilizador</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">Email</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">Função</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">Estado</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user: User) => (
                    <tr key={user.id} className="border-t border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3">
                        <div>
                          <p className="font-medium">{user.display_name}</p>
                          <p className="text-xs text-muted-foreground">@{user.username}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{user.email}</td>
                      <td className="px-5 py-3">
                        <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                          {user.role === "admin" ? "Admin" : "Utilizador"}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={user.is_active ? "purple" : "outline"}>
                          {user.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        {user.id === currentUser?.id ? null : user.is_active ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deactivate.mutate(user.id)}
                            disabled={deactivate.isPending}
                          >
                            Desativar
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => reactivate.mutate(user.id)}
                            disabled={reactivate.isPending}
                          >
                            Reativar
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
