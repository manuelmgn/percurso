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
import TripDetailPage from "@/pages/TripDetailPage"
import ProjectDetailPage from "@/pages/ProjectDetailPage"
import SharedTripPage from "@/pages/SharedTripPage"
import SharedProjectPage from "@/pages/SharedProjectPage"
import { useAuthStore } from "@/stores/auth"
import { usersApi } from "@/lib/api"
import type { User } from "@/types"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Never retry after a 401 — the user has been logged out already.
      retry: (failureCount, error) =>
        !(error instanceof Error && error.message.includes("Sessão expirada")) &&
        failureCount < 1,
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

// Background token refresh: retries once before logging out.
// handleUnauthorized() clears the token immediately on the first 401, so we
// check for it before retrying to avoid a pointless second request.
async function refreshUser(setUser: (user: User) => void, logout: () => void) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      setUser(await usersApi.me())
      return
    } catch {
      if (attempt === 0) {
        // Wait briefly, then check if the token was already cleared by
        // handleUnauthorized before deciding to retry.
        await new Promise<void>((r) => setTimeout(r, 1500))
        if (!useAuthStore.getState().token) return // already logged out
      } else {
        logout()
      }
    }
  }
}

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
      refreshUser(setUser, logout)
      return
    }
    // No cached user — block render until the fetch completes.
    refreshUser(setUser, logout).finally(() => setReady(true))
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
          {/* Public shared-link routes — no auth required */}
          <Route path="/viagens/partilhada/:token" element={<SharedTripPage />} />
          <Route path="/projetos/partilhada/:token" element={<SharedProjectPage />} />

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
            <Route path="/viagens/:id" element={<TripDetailPage />} />
            <Route path="/projetos" element={<ProjectsPage />} />
            <Route path="/projetos/:id" element={<ProjectDetailPage />} />
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
