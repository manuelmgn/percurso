import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/api'
import { useTheme } from '@/components/ThemeProvider'
import type { User, MeResponse } from '@/types'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()
  const { setTheme } = useTheme()

  useEffect(() => {
    async function bootstrap() {
      try {
        const me = await api.auth.me()
        setAuth(me)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setUser(null)
          localStorage.removeItem('csrf_token')
        }
      } finally {
        setIsLoading(false)
      }
    }
    bootstrap()
  }, [])

  const setAuth = (me: MeResponse) => {
    setUser(me.user)
    localStorage.setItem('csrf_token', me.csrf_token)
    if (me.user.theme) setTheme(me.user.theme)
  }

  const login = async (username: string, password: string) => {
    const me = await api.auth.login({ username, password })
    setAuth(me)
    navigate('/')
  }

  const logout = async () => {
    try {
      await api.auth.logout()
    } finally {
      setUser(null)
      localStorage.removeItem('csrf_token')
      navigate('/login')
    }
  }

  const refreshUser = async () => {
    const me = await api.auth.me()
    setAuth(me)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
