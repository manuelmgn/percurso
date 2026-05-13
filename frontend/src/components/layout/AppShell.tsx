import { Outlet, NavLink, useNavigate } from "react-router-dom"
import { Map, Briefcase, FolderOpen, Bell, Settings, LogOut, User } from "lucide-react"
import { useAuthStore } from "@/stores/auth"
import { authApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { notificationsApi } from "@/lib/api"

const navItems = [
  { to: "/mapa", icon: Map, label: "Mapa" },
  { to: "/viagens", icon: Briefcase, label: "Viagens" },
  { to: "/projetos", icon: FolderOpen, label: "Projetos" },
]

export default function AppShell() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: notificationsApi.list,
    refetchInterval: 30_000,
  })

  const unreadCount = notifications?.filter((n) => !n.is_read).length ?? 0

  async function handleLogout() {
    try { await authApi.logout() } catch {}
    logout()
    navigate("/entrar")
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="glass flex w-64 flex-col border-r border-border/50 p-4">
        {/* Logo */}
        <div className="mb-8 px-2">
          <h1 className="text-2xl font-bold gradient-text tracking-tight">Percurso</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Os teus lugares</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary/10 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="space-y-1 border-t border-border/50 pt-4">
          <NavLink
            to="/notificacoes"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )
            }
          >
            <div className="relative">
              <Bell className="size-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>
            Notificações
          </NavLink>

          <NavLink
            to="/definicoes"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )
            }
          >
            <Settings className="size-4" />
            Definições
          </NavLink>

          {user?.role === "admin" && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )
              }
            >
              <User className="size-4" />
              Admin
            </NavLink>
          )}

          {/* User info + logout */}
          <div className="glass-card mt-2 flex items-center gap-3 p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-semibold">
              {user?.display_name[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.display_name}</p>
              <p className="truncate text-xs text-muted-foreground">@{user?.username}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-muted-foreground hover:text-destructive transition-colors"
              title="Terminar sessão"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
