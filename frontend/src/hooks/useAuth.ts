import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "@/stores/auth"
import { usersApi } from "@/lib/api"

export function useRequireAuth() {
  const { token, user, setUser, logout } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (!token) {
      navigate("/entrar", { replace: true })
      return
    }
    if (!user) {
      usersApi
        .me()
        .then(setUser)
        .catch(() => {
          logout()
          navigate("/entrar", { replace: true })
        })
    }
  }, [token, user, navigate, setUser, logout])

  return { user, isAuthenticated: !!token }
}
