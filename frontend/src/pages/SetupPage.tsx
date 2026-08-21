import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/api'

export function SetupPage() {
  const { isSetupRequired, login } = useAuth()
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [secondUsername, setSecondUsername] = useState('')
  const [secondPassword, setSecondPassword] = useState('')
  const [addSecond, setAddSecond] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isSetupRequired === false) {
    window.location.replace('/login')
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      await api.setup.complete({
        admin_username: adminUsername,
        admin_password: adminPassword,
        ...(addSecond && secondUsername && secondPassword
          ? { second_username: secondUsername, second_password: secondPassword }
          : {}),
      })
      await login(adminUsername, adminPassword)
    } catch (err: any) {
      setError(err.message || 'Erro ao configurar a aplicação')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 to-white p-4 dark:from-neutral-900 dark:to-neutral-950">
      <div className="glass w-full max-w-md rounded-2xl p-8">
        <h1 className="mb-2 text-center font-display text-3xl font-bold text-primary-700 dark:text-primary-300">
          Percursos
        </h1>
        <p className="mb-8 text-center text-neutral-600 dark:text-neutral-400">
          Bem-vindo! Cria a tua conta de administrador para começar.
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Nome de utilizador admin</label>
            <input
              type="text"
              required
              value={adminUsername}
              onChange={(e) => setAdminUsername(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Palavra-passe admin</label>
            <input
              type="password"
              required
              minLength={8}
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </div>

          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={addSecond}
                onChange={(e) => setAddSecond(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
              />
              Criar segundo utilizador agora
            </label>

            {addSecond && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="mb-1 block text-sm">Nome de utilizador</label>
                  <input
                    type="text"
                    value={secondUsername}
                    onChange={(e) => setSecondUsername(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-700 dark:bg-neutral-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm">Palavra-passe</label>
                  <input
                    type="password"
                    minLength={8}
                    value={secondPassword}
                    onChange={(e) => setSecondPassword(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-700 dark:bg-neutral-900"
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-primary-600 px-4 py-2 font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          >
            {isSubmitting ? 'A configurar...' : 'Começar'}
          </button>
        </form>
      </div>
    </div>
  )
}
