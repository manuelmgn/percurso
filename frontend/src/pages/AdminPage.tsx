import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { adminApi, usersApi } from "@/lib/api"
import { useAuthStore } from "@/stores/auth"
import { Loader2, Users, Map, Briefcase, FolderOpen, CheckCircle, XCircle, Plus, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import type { User } from "@/types"

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number | string }) {
  return (
    <div className="glass-card p-5 flex items-center gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
        <Icon className="size-6 text-primary" />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
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
      <h2 className="font-semibold">Criar utilizador</h2>
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
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="utilizador" required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Palavra-passe</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Função</label>
            <div className="glass flex rounded-xl p-1 gap-1 h-10">
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
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Painel de administração</h1>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Utilizadores" value={stats.users} />
          <StatCard icon={Briefcase} label="Viagens" value={stats.trips} />
          <StatCard icon={FolderOpen} label="Projetos" value={stats.projects} />
          <StatCard icon={Map} label="Lugares únicos" value={stats.unique_places} />
        </div>
      )}

      {/* Health */}
      {health && (
        <div className="glass-card p-5">
          <h2 className="font-semibold mb-3">Estado do sistema</h2>
          <div className="flex gap-6">
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
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="size-4 text-muted-foreground" />
            <h2 className="font-semibold">Configurações do site</h2>
          </div>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
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

      {/* Users table */}
      <div className="glass-card overflow-hidden">
        <div className="p-5 border-b border-border/50">
          <h2 className="font-semibold">Utilizadores</h2>
        </div>
        {usersLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
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
        )}
      </div>
    </div>
  )
}
