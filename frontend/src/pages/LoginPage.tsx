import { useState } from 'react'
import { useTranslation } from '@/i18n'
import { useAuth } from '@/context/AuthContext'
import { getErrorMessage } from '@/hooks/useApiResource'
import { ErrorBanner } from '@/components/ui/ErrorBanner'

export function LoginPage() {
  const { login } = useAuth()
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      await login(username, password)
    } catch (err) {
      setError(getErrorMessage(err, t('login.error')))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-primary-50 to-white p-4 dark:from-bg dark:to-surface">
      <div className="mb-6 flex flex-col items-center gap-4 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-3xl bg-primary-tint shadow-card dark:bg-primary/20">
          <img src="/images/percurso-icono.svg" alt="" className="h-10 w-10" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-primary">
            {t('login.appName')}
          </h1>
          <p className="mt-1 text-sm text-muted">{t('login.subtitle')}</p>
        </div>
      </div>

      <div className="card w-full max-w-sm p-8">
        <ErrorBanner className="mb-4" message={error} />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-username" className="mb-1 block text-sm font-medium">{t('login.username')}</label>
            <input
              id="login-username"
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1 block text-sm font-medium">{t('login.password')}</label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary w-full justify-center"
          >
            {isSubmitting ? t('login.submitting') : t('login.loginButton')}
          </button>
        </form>
      </div>
    </div>
  )
}
