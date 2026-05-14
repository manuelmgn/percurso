import { Navigate, useLocation } from "react-router-dom"
import { useAuthStore } from "@/stores/auth"

interface Props {
  children: React.ReactNode
  requireAdmin?: boolean
}

export default function ProtectedRoute({ children, requireAdmin = false }: Props) {
  const { token, user } = useAuthStore()
  const location = useLocation()

  if (!token) return <Navigate to="/entrar" state={{ from: location.pathname }} replace />
  if (requireAdmin && user?.role !== "admin") return <Navigate to="/mapa" replace />

  return <>{children}</>
}
