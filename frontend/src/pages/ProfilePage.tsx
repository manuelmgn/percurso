import { useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/components/ThemeProvider'
import { api } from '@/api'
import type { ThemePreference } from '@/types'

export function ProfilePage() {
  const { user, refreshUser } = useAuth()
  const { theme, setTheme } = useTheme()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState('')

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setAvatarError('')
    setIsUploadingAvatar(true)
    try {
      await api.me.uploadAvatar(file)
      await refreshUser()
    } catch (err: any) {
      setAvatarError(err.message || 'Erro ao carregar fotografia')
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleThemeChange = async (newTheme: ThemePreference) => {
    setTheme(newTheme)
    try {
      await api.me.update({ theme: newTheme })
      await refreshUser()
    } catch {
      // ignore persistence errors for theme
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage('')
    setError('')
    try {
      await api.me.changePassword({ current_password: currentPassword, new_password: newPassword })
      setMessage('Palavra-passe alterada com sucesso')
      setCurrentPassword('')
      setNewPassword('')
    } catch (err: any) {
      setError(err.message || 'Erro ao alterar palavra-passe')
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold">Perfil</h2>

      <div className="glass rounded-2xl p-6">
        <h3 className="mb-4 font-display text-lg font-semibold">Informação da conta</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Nome de utilizador</label>
            <div className="rounded-lg border border-neutral-200 bg-neutral-100 px-4 py-2 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
              {user?.username}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Função</label>
            <div className="rounded-lg border border-neutral-200 bg-neutral-100 px-4 py-2 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
              {user?.role === 'admin' ? 'Administrador' : 'Utilizador'}
            </div>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-6">
        <h3 className="mb-4 font-display text-lg font-semibold">Fotografia de perfil</h3>
        {avatarError && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
            {avatarError}
          </div>
        )}
        <div className="flex items-center gap-4">
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={`Fotografia de ${user.username}`}
              loading="lazy"
              className="h-20 w-20 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-100 font-display text-3xl font-bold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={isUploadingAvatar}
              className="btn-outline"
            >
              {isUploadingAvatar ? 'A carregar...' : 'Alterar fotografia'}
            </button>
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              JPEG, PNG, WebP ou HEIC. A imagem é convertida para WebP.
            </p>
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="hidden"
            onChange={handleAvatarChange}
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="glass rounded-2xl p-6">
        <h3 className="mb-4 font-display text-lg font-semibold">Preferências</h3>
        <div>
          <label className="mb-2 block text-sm font-medium">Tema</label>
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as ThemePreference[]).map((t) => (
              <button
                key={t}
                onClick={() => handleThemeChange(t)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  theme === t
                    ? 'bg-primary-600 text-white'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                }`}
              >
                {t === 'light' && 'Claro'}
                {t === 'dark' && 'Escuro'}
                {t === 'system' && 'Sistema'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-6">
        <h3 className="mb-4 font-display text-lg font-semibold">Alterar palavra-passe</h3>
        {message && (
          <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Palavra-passe atual</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Nova palavra-passe</label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-primary-600 px-4 py-2 font-medium text-white transition-colors hover:bg-primary-700"
          >
            Alterar palavra-passe
          </button>
        </form>
      </div>
    </div>
  )
}
