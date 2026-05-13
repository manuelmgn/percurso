import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "@/stores/auth"
import { authApi, usersApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Eye, EyeOff, Loader2 } from "lucide-react"

export default function LoginPage() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { setToken, setUser } = useAuthStore()
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const token = await authApi.login(username, password)
      setToken(token.access_token)
      const user = await usersApi.me()
      setUser(user)
      navigate("/mapa")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao iniciar sessão")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-50 via-white to-purple-100 dark:from-purple-950/30 dark:via-background dark:to-purple-900/20 p-4">
      {/* Background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-purple-200/40 blur-3xl dark:bg-purple-800/20" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-purple-300/30 blur-3xl dark:bg-purple-900/20" />
      </div>

      <div className="glass-panel relative w-full max-w-md p-8">
        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold gradient-text tracking-tight">Percurso</h1>
          <p className="mt-2 text-muted-foreground">Os teus lugares, as tuas viagens</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Nome de utilizador
            </label>
            <Input
              type="text"
              placeholder="utilizador"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Palavra-passe
            </label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : "Entrar"}
          </Button>
        </form>


      </div>
    </div>
  )
}
