import { Navigate } from "react-router-dom"
import { useAuthStore } from "@/stores/auth"

interface Props {
  children: React.ReactNode
  requireAdmin?: boolean
}

export default function ProtectedRoute({ children, requireAdmin = false }: Props) {
  const { token, user } = useAuthStore()

  if (!token) return <Navigate to="/entrar" replace />
  if (requireAdmin && user?.role !== "admin") return <Navigate to="/mapa" replace />

  return <>{children}</>
}
