import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import AppShell from "@/components/layout/AppShell"
import ProtectedRoute from "@/components/shared/ProtectedRoute"
import LoginPage from "@/pages/LoginPage"
import MapPage from "@/pages/MapPage"
import TripsPage from "@/pages/TripsPage"
import ProjectsPage from "@/pages/ProjectsPage"
import NotificationsPage from "@/pages/NotificationsPage"
import SettingsPage from "@/pages/SettingsPage"
import AdminPage from "@/pages/AdminPage"

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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  )
}
