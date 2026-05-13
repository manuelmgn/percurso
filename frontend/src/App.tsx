import { useState, useEffect } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import AppShell from "@/components/layout/AppShell"
import ProtectedRoute from "@/components/shared/ProtectedRoute"
import LoginPage from "@/pages/LoginPage"
import MapPage from "@/pages/MapPage"
import TripsPage from "@/pages/TripsPage"
import ProjectsPage from "@/pages/ProjectsPage"
import NotificationsPage from "@/pages/NotificationsPage"
import SettingsPage from "@/pages/SettingsPage"
import AdminPage from "@/pages/AdminPage"
import { useAuthStore } from "@/stores/auth"
import { usersApi } from "@/lib/api"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

// Dark mode: apply class based on system preference or stored preference
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
if (prefersDark) document.documentElement.classList.add("dark")
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
  e.matches
    ? document.documentElement.classList.add("dark")
    : document.documentElement.classList.remove("dark")
})

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { token, user, setUser, logout } = useAuthStore()
  // If the user is already in the persisted store we can render immediately.
  // Otherwise (first load after clearing cache) we must wait for the fetch.
  const [ready, setReady] = useState(!token || !!user)

  useEffect(() => {
    if (!token) {
      setReady(true)
      return
    }
    if (user) {
      // Render immediately with cached user; refresh in the background to
      // keep data fresh and to detect expired tokens.
      setReady(true)
      usersApi.me().then(setUser).catch(() => logout())
      return
    }
    // No cached user — block render until the fetch completes.
    usersApi.me()
      .then(setUser)
      .catch(() => logout())
      .finally(() => setReady(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthInitializer>
      <BrowserRouter>
        <Routes>
          <Route path="/entrar" element={<LoginPage />} />

          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/mapa" replace />} />
            <Route path="/mapa" element={<MapPage />} />
            <Route path="/viagens" element={<TripsPage />} />
            <Route path="/projetos" element={<ProjectsPage />} />
            <Route path="/notificacoes" element={<NotificationsPage />} />
            <Route path="/definicoes" element={<SettingsPage />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminPage />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/mapa" replace />} />
        </Routes>
      </BrowserRouter>
      </AuthInitializer>
    </QueryClientProvider>
  )
}
