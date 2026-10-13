import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/components/ThemeProvider'
import { api } from '@/api'
import { formatDate, formatDateTime } from '@/utils/format'
import type { ActivityItem, ThemePreference } from '@/types'

const activityActionKeys: Record<ActivityItem['action'], string> = {
  created: 'dashboard.activityCreated',
  updated: 'dashboard.activityUpdated',
  deleted: 'dashboard.activityDeleted',
}

const activityEntityKeys: Record<ActivityItem['entity_type'], string> = {
  trip: 'dashboard.activityTrip',
  project: 'dashboard.activityProject',
  place: 'dashboard.activityPlace',
  user: 'dashboard.activityUser',
}

function activityEntityPath(activity: ActivityItem): string | null {
  if (activity.action === 'deleted') return null
  switch (activity.entity_type) {
    case 'trip':
      return `/viagens/${activity.entity_id}`
    case 'project':
      return `/projetos/${activity.entity_id}`
    case 'place':
      return `/lugares/${activity.entity_id}`
    default:
      return null
  }
}

// Curated IANA timezones offered in the preferences selector
const TIMEZONES = [
  'Europe/Lisbon',
  'Atlantic/Azores',
  'Atlantic/Madeira',
  'Europe/Madrid',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'America/Sao_Paulo',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/Argentina/Buenos_Aires',
  'Africa/Luanda',
  'Africa/Maputo',
  'Asia/Macau',
  'Asia/Dili',
  'UTC',
]

// Must match ALLOWED_DATE_FORMATS in backend/app/routers/me.py
const DATE_FORMATS = [
  { value: '%d/%m/%Y', label: 'dd/mm/aaaa' },
  { value: '%m/%d/%Y', label: 'mm/dd/aaaa' },
  { value: '%Y-%m-%d', label: 'aaaa-mm-dd' },
]

export function SettingsPage() {
  const { t } = useTranslation()
  const { user, refreshUser, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()

  // Profile - Username
  const [usernameInput, setUsernameInput] = useState(user?.username || '')
  const [isSavingUsername, setIsSavingUsername] = useState(false)
  const [usernameMessage, setUsernameMessage] = useState('')
  const [usernameError, setUsernameError] = useState('')

  useEffect(() => {
    if (user?.username) {
      setUsernameInput(user.username)
    }
  }, [user?.username])

  // Profile - Avatar
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState('')

  // Preferences
  const [prefsError, setPrefsError] = useState('')
  const [prefsSuccess, setPrefsSuccess] = useState('')

  // Account - Password
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  // Account - Delete
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Recent Activity
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [isLoadingActivities, setIsLoadingActivities] = useState(true)

  useEffect(() => {
    const loadActivities = async () => {
      try {
        setIsLoadingActivities(true)
        const data = await api.activities.list()
        setActivities(data)
      } catch {
        // Silently fail if activities cannot be fetched
      } finally {
        setIsLoadingActivities(false)
      }
    }
    loadActivities()
  }, [])

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
      setAvatarError(err.message || t('profile.avatarError'))
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = usernameInput.trim().toLowerCase()
    if (!trimmed || trimmed === user?.username) return

    setUsernameError('')
    setUsernameMessage('')
    setIsSavingUsername(true)

    try {
      await api.me.update({ username: trimmed })
      await refreshUser()
      setUsernameMessage('Nome atualizado com sucesso.')
      setTimeout(() => setUsernameMessage(''), 3000)
    } catch (err: any) {
      setUsernameError(err.message || 'Erro ao atualizar o nome público.')
    } finally {
      setIsSavingUsername(false)
    }
  }

  const handleThemeChange = async (newTheme: ThemePreference) => {
    setTheme(newTheme)
    try {
      await api.me.update({ theme: newTheme })
      await refreshUser()
    } catch {
      // ignore persistence error
    }
  }

  const handlePreferenceChange = async (prefs: { timezone?: string; date_format?: string }) => {
    setPrefsError('')
    setPrefsSuccess('')
    try {
      await api.me.update(prefs)
      await refreshUser()
      setPrefsSuccess('Preferências guardadas.')
      setTimeout(() => setPrefsSuccess(''), 2500)
    } catch (err: any) {
      setPrefsError(err.message || t('profile.preferencesError'))
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordMessage('')
    setPasswordError('')
    setIsChangingPassword(true)
    try {
      await api.me.changePassword({ current_password: currentPassword, new_password: newPassword })
      setPasswordMessage(t('profile.passwordChanged'))
      setCurrentPassword('')
      setNewPassword('')
      setTimeout(() => setPasswordMessage(''), 3000)
    } catch (err: any) {
      setPasswordError(err.message || t('profile.passwordError'))
    } finally {
      setIsChangingPassword(false)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleteError('')
    setIsDeletingAccount(true)
    try {
      await api.me.deleteAccount()
      setShowDeleteModal(false)
      await logout()
      navigate('/login')
    } catch (err: any) {
      setDeleteError(err.message || 'Erro ao eliminar a conta.')
      setIsDeletingAccount(false)
    }
  }

  const themeOptions: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
    {
      value: 'light',
      label: 'Claro',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      value: 'dark',
      label: 'Escuro',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      ),
    },
    {
      value: 'system',
      label: 'Sistema',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Ajustes</h1>
      </div>

      {/* SECÇÃO 1: PERFIL */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-neutral-900 dark:text-neutral-100">Perfil</h2>
        <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
          {/* Div 1 (Esquerda): Link para ver o perfil */}
          <div className="card flex flex-col justify-between">
            <div>
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                O teu perfil público
              </h3>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                Visualiza o teu perfil público exatamente como é visto por outros utilizadores na plataforma, com o resumo das tuas viagens e lugares visitados.
              </p>
            </div>

            <div className="pt-6">
              <Link
                to={`/utilizadores/${user?.username}`}
                className="btn-primary inline-flex w-full items-center justify-center gap-2 sm:w-auto"
              >
                <span>Ver perfil</span>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Div 2 (Direita): Imagem acima no centro com hover para mudar + campo de nome público */}
          <div className="card flex flex-col items-center p-6 text-center">
            {avatarError && (
              <div className="mb-4 w-full rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
                {avatarError}
              </div>
            )}

            {/* Imagem centrada com hover para alterar */}
            <div className="group relative">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={isUploadingAvatar}
                aria-label="Mudar fotografia de perfil"
                className="relative block h-28 w-28 overflow-hidden rounded-full shadow-md ring-2 ring-primary-500/20 transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 group-hover:scale-102"
              >
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.username}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-primary-100 font-display text-4xl font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                    {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
                  </div>
                )}

                {/* Overlay visível ao passar o rato */}
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 p-2 text-white opacity-0 backdrop-blur-xs transition-opacity duration-200 group-hover:opacity-100">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="mt-1 text-xs font-semibold">
                    {isUploadingAvatar ? 'A carregar...' : 'Mudar foto'}
                  </span>
                </div>
              </button>
            </div>

            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              Passa o rato para mudar a foto (JPEG, PNG, WebP ou HEIC)
            </p>

            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              className="hidden"
              onChange={handleAvatarChange}
              aria-hidden="true"
            />

            {/* Campo editável para o nome público */}
            <form onSubmit={handleSaveUsername} className="mt-5 w-full text-left">
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Nome público
              </label>

              {usernameMessage && (
                <div className="mb-2 rounded-lg bg-green-50 p-2.5 text-xs text-green-700 dark:bg-green-900/20 dark:text-green-300">
                  {usernameMessage}
                </div>
              )}
              {usernameError && (
                <div className="mb-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
                  {usernameError}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  required
                  minLength={2}
                  maxLength={64}
                  className="input flex-1"
                  placeholder="Nome público"
                />
                <button
                  type="submit"
                  disabled={isSavingUsername || usernameInput.trim().toLowerCase() === user?.username}
                  className="btn-primary shrink-0"
                >
                  {isSavingUsername ? 'A guardar...' : 'Guardar'}
                </button>
              </div>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Identificador visível na URL pública e no sistema.
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* SECÇÃO 2: PREFERÊNCIAS */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-neutral-900 dark:text-neutral-100">Preferências</h2>
        <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
          {/* Div 1: Escolha do tema */}
          <div className="card space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-neutral-900 dark:text-neutral-100">
                Tema da interface
              </h3>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                Escolhe o estilo visual da aplicação ou sincroniza com o sistema operativo.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {themeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleThemeChange(opt.value)}
                  className={`flex flex-col items-center justify-center gap-2 rounded-xl p-3.5 text-sm font-medium transition-all ${
                    theme === opt.value
                      ? 'bg-primary-600 text-white shadow-md ring-2 ring-primary-500/30'
                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                  }`}
                >
                  {opt.icon}
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Div 2: Timezone e formatos de data e hora */}
          <div className="card space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-neutral-900 dark:text-neutral-100">
                Fuso horário e datas
              </h3>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                Ajusta como os horários e as datas de viagens são calculados e exibidos.
              </p>
            </div>

            {prefsSuccess && (
              <div className="rounded-lg bg-green-50 p-2.5 text-xs text-green-700 dark:bg-green-900/20 dark:text-green-300">
                {prefsSuccess}
              </div>
            )}
            {prefsError && (
              <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
                {prefsError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300" htmlFor="settings-tz">
                  Fuso horário
                </label>
                <select
                  id="settings-tz"
                  value={user?.timezone || 'Europe/Lisbon'}
                  onChange={(e) => handlePreferenceChange({ timezone: e.target.value })}
                  className="input"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300" htmlFor="settings-df">
                  Formato de data
                </label>
                <select
                  id="settings-df"
                  value={user?.date_format || '%d/%m/%Y'}
                  onChange={(e) => handlePreferenceChange({ date_format: e.target.value })}
                  className="input"
                >
                  {DATE_FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label} ({formatDate(new Date(), { date_format: f.value, timezone: user?.timezone })})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECÇÃO: ATIVIDADE RECENTE */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-neutral-900 dark:text-neutral-100">
          Atividade recente
        </h2>
        <div className="card">
          {isLoadingActivities ? (
            <div className="flex items-center justify-center py-6" role="status">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            </div>
          ) : activities.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Sem atividade recente registada.
            </p>
          ) : (
            <ul className="space-y-3">
              {activities.map((activity) => {
                const path = activityEntityPath(activity)
                return (
                  <li key={activity.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <p className="text-neutral-700 dark:text-neutral-300">
                      <span className="font-medium text-neutral-900 dark:text-neutral-50">
                        {activity.user_username}
                      </span>{' '}
                      {t(activityActionKeys[activity.action])} {t(activityEntityKeys[activity.entity_type])}{' '}
                      {path ? (
                        <Link
                          to={path}
                          className="font-medium text-primary-700 hover:underline dark:text-primary-300"
                        >
                          {activity.entity_name}
                        </Link>
                      ) : (
                        <span className="font-medium">{activity.entity_name}</span>
                      )}
                    </p>
                    <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
                      {formatDateTime(activity.created_at, user)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      {/* SECÇÃO 3: CONTA */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-neutral-900 dark:text-neutral-100">Conta</h2>
        <div className="card space-y-6">
          {/* Subseção: Alterar palavra-passe */}
          <div>
            <h3 className="font-display text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Palavra-passe
            </h3>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Atualiza a palavra-passe utilizada para aceder à tua conta.
            </p>

            {passwordMessage && (
              <div className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
                {passwordMessage}
              </div>
            )}
            {passwordError && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
                {passwordError}
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="settings-current-password" className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Palavra-passe atual
                  </label>
                  <input
                    id="settings-current-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label htmlFor="settings-new-password" className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Nova palavra-passe
                  </label>
                  <input
                    id="settings-new-password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="input"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isChangingPassword}
                className="btn-primary"
              >
                {isChangingPassword ? 'A alterar...' : 'Alterar palavra-passe'}
              </button>
            </form>
          </div>

          {/* Subseção: Terminar sessão & Eliminar conta */}
          <div className="border-t border-neutral-200/50 pt-6 dark:border-neutral-800/50">
            <h3 className="font-display text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Ações de sessão e conta
            </h3>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Gere a sessão ativa neste dispositivo ou remove a tua conta permanentemente.
            </p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={logout}
                className="btn-outline inline-flex items-center justify-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Terminar sessão</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDeleteError('')
                  setShowDeleteModal(true)
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/20 active:scale-[0.97] dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/20"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>Eliminar conta</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* MODAL DE CONFIRMAÇÃO DE ELIMINAÇÃO */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className="glass w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <h3 id="delete-modal-title" className="font-display text-lg font-bold text-red-600 dark:text-red-400">
              Eliminar conta definitivamente?
            </h3>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              Esta ação é permanente e irreversível. Todos os teus dados, preferências e histórico serão apagados.
            </p>

            {deleteError && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                {deleteError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeletingAccount}
                className="btn-outline"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount}
                className="rounded-xl bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {isDeletingAccount ? 'A eliminar...' : 'Sim, eliminar conta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
