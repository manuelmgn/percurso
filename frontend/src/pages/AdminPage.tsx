import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { adminApi, usersApi } from "@/lib/api"
import { Loader2, Users, Map, Briefcase, FolderOpen, CheckCircle, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
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

export default function AdminPage() {
  const queryClient = useQueryClient()
  const { data: stats } = useQuery({ queryKey: ["admin-stats"], queryFn: adminApi.stats })
  const { data: health } = useQuery({ queryKey: ["admin-health"], queryFn: adminApi.health, refetchInterval: 30_000 })
  const { data: users = [], isLoading: usersLoading } = useQuery({ queryKey: ["admin-users"], queryFn: usersApi.list })

  const deactivate = useMutation({
    mutationFn: usersApi.deactivate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  })
  const reactivate = useMutation({
    mutationFn: usersApi.reactivate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  })

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Painel de Administração</h1>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Utilizadores" value={stats.users} />
          <StatCard icon={Briefcase} label="Viagens" value={stats.trips} />
          <StatCard icon={FolderOpen} label="Projectos" value={stats.projects} />
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
                <th className="px-5 py-3 font-medium text-muted-foreground">Acções</th>
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
                      {user.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    {user.is_active ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deactivate.mutate(user.id)}
                        disabled={deactivate.isPending}
                      >
                        Desactivar
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => reactivate.mutate(user.id)}
                        disabled={reactivate.isPending}
                      >
                        Reactivar
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
