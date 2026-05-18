import { Outlet, NavLink, Link, useNavigate } from "react-router-dom"
import { Map, Briefcase, FolderOpen, Bell, Settings, LogOut, User } from "lucide-react"
import { useAuthStore } from "@/stores/auth"
import { authApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { notificationsApi } from "@/lib/api"
import { APP_VERSION } from "@/lib/constants"

const navItems = [
  { to: "/mapa", icon: Map, label: "Mapa" },
  { to: "/viagens", icon: Briefcase, label: "Viagens" },
  { to: "/projetos", icon: FolderOpen, label: "Projetos" },
]

const bottomNavItems = [
  { to: "/mapa", icon: Map, label: "Mapa" },
  { to: "/viagens", icon: Briefcase, label: "Viagens" },
  { to: "/projetos", icon: FolderOpen, label: "Projetos" },
  { to: "/notificacoes", icon: Bell, label: "Notificações" },
]

export default function AppShell() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: notificationsApi.list,
    refetchInterval: 30_000,
    staleTime: 30_000,
  })

  const unreadCount = notifications?.filter((n) => !n.is_read).length ?? 0

  async function handleLogout() {
    try { await authApi.logout() } catch {}
    logout()
    navigate("/entrar")
  }

  const sideNavClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 min-h-[44px]",
      isActive
        ? "bg-primary/10 text-primary shadow-sm"
        : "text-muted-foreground hover:bg-accent hover:text-foreground",
    )

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Sidebar — hidden on mobile, icon-only on tablet, full on desktop */}
      <aside className="hidden md:flex glass flex-col border-r border-border/50 transition-all duration-300 md:w-16 lg:w-64 shrink-0">
        {/* Logo */}
        <Link
          to="/mapa"
          className="mb-6 flex items-center gap-3 px-3 py-4 hover:opacity-80 transition-opacity overflow-hidden shrink-0"
        >
          {/* Icon always visible */}
          <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
            <span className="text-base font-black gradient-text leading-none">P</span>
          </div>
          {/* Label only on desktop */}
          <div className="hidden lg:block min-w-0">
            <h1 className="text-xl font-bold gradient-text tracking-tight leading-tight">Percurso</h1>
            <p className="text-xs text-muted-foreground">Os teus lugares</p>
          </div>
        </Link>

        {/* Main nav */}
        <nav className="flex-1 space-y-1 px-2 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className={sideNavClass}>
              <Icon className="size-4 shrink-0" />
              <span className="hidden lg:block">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="space-y-1 px-2 border-t border-border/50 pt-3 pb-3">
          <NavLink to="/notificacoes" className={sideNavClass}>
            <div className="relative shrink-0">
              <Bell className="size-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>
            <span className="hidden lg:block">Notificações</span>
          </NavLink>

          <NavLink to="/definicoes" className={sideNavClass}>
            <Settings className="size-4 shrink-0" />
            <span className="hidden lg:block">Definições</span>
          </NavLink>

          {user?.role === "admin" && (
            <NavLink to="/admin" className={sideNavClass}>
              <User className="size-4 shrink-0" />
              <span className="hidden lg:block">Admin</span>
            </NavLink>
          )}

          {user?.role === "admin" && (
            <p className="hidden lg:block px-3 py-1 text-xs opacity-30 select-none">v{APP_VERSION}</p>
          )}

          {/* User card */}
          <div className="glass-card mt-2 flex items-center gap-3 p-2.5 overflow-hidden">
            <NavLink
              to={`/perfil/${user?.username}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-semibold overflow-hidden hover:ring-2 hover:ring-primary/40 transition-all"
            >
              {user?.avatar_url
                ? <img src={user.avatar_url} alt={user.display_name} className="h-full w-full object-cover" />
                : user?.display_name[0]?.toUpperCase()
              }
            </NavLink>
            <div className="hidden lg:block min-w-0 flex-1">
              <NavLink
                to={`/perfil/${user?.username}`}
                className="block truncate text-sm font-medium hover:text-primary transition-colors"
              >
                {user?.display_name}
              </NavLink>
              <NavLink
                to={`/perfil/${user?.username}`}
                className="truncate text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                @{user?.username}
              </NavLink>
            </div>
            <button
              onClick={handleLogout}
              className="hidden lg:block text-muted-foreground hover:text-destructive transition-colors"
              title="Terminar sessão"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      {/* pb-16 reserves space for the bottom nav on mobile */}
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0 min-w-0">
        <Outlet />
      </main>

      {/* Bottom navigation bar — mobile only */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden glass-sheet"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-center justify-around px-1 pt-1 pb-1">
          {bottomNavItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 min-w-[56px] px-2 py-2 rounded-xl transition-all duration-200",
                  isActive ? "text-primary" : "text-muted-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className="relative">
                    <Icon className={cn("size-5 transition-transform duration-200", isActive && "scale-110")} />
                    {to === "/notificacoes" && unreadCount > 0 && (
                      <span className="absolute -right-1.5 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-white">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </div>
                  <span className={cn("text-[10px] font-medium leading-none", isActive ? "text-primary" : "text-muted-foreground")}>
                    {/* Shorten "Notificações" to fit */}
                    {label === "Notificações" ? "Notif." : label}
                  </span>
                </>
              )}
            </NavLink>
          ))}

          {/* Profile link */}
          <NavLink
            to={`/perfil/${user?.username}`}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-0.5 min-w-[56px] px-2 py-2 rounded-xl transition-all duration-200",
                isActive ? "text-primary" : "text-muted-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-bold overflow-hidden transition-all duration-200",
                    isActive && "ring-2 ring-primary/50 scale-110",
                  )}
                >
                  {user?.avatar_url
                    ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                    : user?.display_name[0]?.toUpperCase()
                  }
                </div>
                <span className={cn("text-[10px] font-medium leading-none", isActive ? "text-primary" : "text-muted-foreground")}>
                  Perfil
                </span>
              </>
            )}
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
