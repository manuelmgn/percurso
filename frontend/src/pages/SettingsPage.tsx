import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/components/ThemeProvider'
import { api } from '@/api'
import { formatDate, formatDateTime } from '@/utils/format'
import { isPushEnabled, subscribePush, unsubscribePush } from '@/utils/push'
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

  // Push notifications
  const [pushState, setPushState] = useState<'checking' | 'enabled' | 'disabled' | 'denied' | 'unsupported'>('checking')
  const [isTogglingPush, setIsTogglingPush] = useState(false)

  useEffect(() => {
    const check = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setPushState('unsupported')
        return
      }
      if (Notification.permission === 'denied') {
        setPushState('denied')
        return
      }
      const enabled = await isPushEnabled()
      setPushState(enabled ? 'enabled' : 'disabled')
    }
    check()
  }, [])

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
      setUsernameMessage(t('settings.usernameUpdated'))
      setTimeout(() => setUsernameMessage(''), 3000)
    } catch (err: any) {
      setUsernameError(err.message || t('settings.usernameError'))
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

  const handlePreferenceChange = async (prefs: { timezone?: string; date_format?: string; yearly_trip_goal?: number }) => {
    setPrefsError('')
    setPrefsSuccess('')
    try {
      await api.me.update(prefs)
      await refreshUser()
      setPrefsSuccess(t('settings.preferencesSaved'))
      setTimeout(() => setPrefsSuccess(''), 2500)
    } catch (err: any) {
      setPrefsError(err.message || t('profile.preferencesError'))
    }
  }

  const handlePushToggle = async () => {
    setIsTogglingPush(true)
    try {
      if (pushState === 'enabled') {
        await unsubscribePush()
        setPushState('disabled')
      } else {
        await subscribePush()
        setPushState('enabled')
      }
    } catch {
      if (Notification.permission === 'denied') {
        setPushState('denied')
      }
    } finally {
      setIsTogglingPush(false)
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
      setDeleteError(err.message || t('settings.deleteError'))
      setIsDeletingAccount(false)
    }
  }

  const themeOptions: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
    {
      value: 'light',
      label: t('profile.themeLight'),
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      value: 'dark',
      label: t('profile.themeDark'),
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      ),
    },
    {
      value: 'system',
      label: t('profile.themeSystem'),
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
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{t('settings.title')}</h1>
      </div>

      {/* SECTION 1: PROFILE */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-ink dark:text-[#FAF7F2]">{t('profile.title')}</h2>
        <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
          {/* Div 1 (left): link to view the profile */}
          <div className="card flex flex-col justify-between">
            <div>
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="font-display text-lg font-semibold text-ink dark:text-[#FAF7F2]">
                {t('settings.profilePublicTitle')}
              </h3>
              <p className="mt-2 text-sm text-muted">
                {t('settings.profilePublicDescription')}
              </p>
            </div>

            <div className="pt-6">
              <Link
                to={`/utilizadores/${user?.username}`}
                className="btn-primary inline-flex w-full items-center justify-center gap-2 sm:w-auto"
              >
                <span>{t('settings.viewProfile')}</span>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Div 2 (right): centred image above with hover-to-change + public name field */}
          <div className="card flex flex-col items-center p-6 text-center">
            {avatarError && (
              <div className="mb-4 w-full rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
                {avatarError}
              </div>
            )}

            {/* Centred image with hover-to-change */}
            <div className="group relative">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={isUploadingAvatar}
                aria-label={t('settings.avatarAria')}
                className="relative block h-28 w-28 overflow-hidden rounded-full shadow-md ring-2 ring-primary/20 transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-primary group-hover:scale-102"
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

                {/* Overlay shown on hover */}
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 p-2 text-white opacity-0 backdrop-blur-xs transition-opacity duration-200 group-hover:opacity-100">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="mt-1 text-xs font-semibold">
                    {isUploadingAvatar ? t('profile.avatarUploading') : t('settings.changePhoto')}
                  </span>
                </div>
              </button>
            </div>

            <p className="mt-2 text-xs text-muted">
              {t('settings.avatarHint')}
            </p>

            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              className="hidden"
              onChange={handleAvatarChange}
              aria-hidden="true"
            />

            {/* Editable field for the public name */}
            <form onSubmit={handleSaveUsername} className="mt-5 w-full text-left">
              <label className="mb-1 block text-sm font-medium text-ink dark:text-[#FAF7F2]">
                {t('settings.publicNameLabel')}
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
                  placeholder={t('settings.publicNameLabel')}
                />
                <button
                  type="submit"
                  disabled={isSavingUsername || usernameInput.trim().toLowerCase() === user?.username}
                  className="btn-primary shrink-0"
                >
                  {isSavingUsername ? t('settings.saving') : t('actions.save')}
                </button>
              </div>
              <p className="mt-1 text-xs text-muted">
                {t('settings.publicNameHint')}
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* SECTION 2: PREFERENCES */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-ink dark:text-[#FAF7F2]">{t('profile.preferences')}</h2>
        <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
          {/* Div 1: theme choice */}
          <div className="card space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-ink dark:text-[#FAF7F2]">
                {t('settings.themeSection')}
              </h3>
              <p className="mt-1 text-sm text-muted">
                {t('settings.themeDescription')}
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
                      ? 'bg-primary-600 text-white shadow-md ring-2 ring-primary/30'
                      : 'bg-line/40 text-ink hover:bg-line dark:bg-[#322A23] dark:text-[#FAF7F2] dark:hover:bg-[#322A23]'
                  }`}
                >
                  {opt.icon}
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Div 2: timezone and date/time formats */}
          <div className="card space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-ink dark:text-[#FAF7F2]">
                {t('settings.timezoneDatesSection')}
              </h3>
              <p className="mt-1 text-sm text-muted">
                {t('settings.timezoneDatesDescription')}
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
                <label className="mb-1 block text-sm font-medium text-ink dark:text-[#FAF7F2]" htmlFor="settings-tz">
                  {t('settings.timezoneLabel')}
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
                <label className="mb-1 block text-sm font-medium text-ink dark:text-[#FAF7F2]" htmlFor="settings-df">
                  {t('profile.dateFormat')}
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

              <div>
                <label className="mb-1 block text-sm font-medium text-ink dark:text-[#FAF7F2]" htmlFor="settings-goal">
                  {t('settings.yearlyGoalLabel')}
                </label>
                <input
                  id="settings-goal"
                  type="number"
                  min={0}
                  max={1000}
                  value={user?.yearly_trip_goal ?? ''}
                  placeholder={t('settings.yearlyGoalPlaceholder')}
                  onChange={(e) => {
                    const value = e.target.value === '' ? 0 : Number(e.target.value)
                    if (Number.isFinite(value) && value >= 0 && value <= 1000) {
                      handlePreferenceChange({ yearly_trip_goal: value })
                    }
                  }}
                  className="input"
                />
                <p className="mt-1 text-xs text-muted">
                  {t('settings.yearlyGoalHint')}
                </p>
              </div>
            </div>
          </div>

          {/* Div 3 (full width): push notifications */}
          <div className="card space-y-4 md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-display text-base font-semibold text-ink dark:text-[#FAF7F2]">
                  {t('settings.pushTitle')}
                </h3>
                <p className="mt-1 text-sm text-muted">
                  {pushState === 'denied'
                    ? t('settings.pushDenied')
                    : pushState === 'unsupported'
                      ? t('settings.pushUnsupported')
                      : t('settings.pushDescription')}
                </p>
              </div>
              {pushState !== 'unsupported' && pushState !== 'denied' && pushState !== 'checking' && (
                <button
                  type="button"
                  onClick={handlePushToggle}
                  disabled={isTogglingPush}
                  className={pushState === 'enabled' ? 'btn-outline shrink-0' : 'btn-primary shrink-0'}
                >
                  {isTogglingPush
                    ? t('settings.saving')
                    : pushState === 'enabled'
                      ? t('settings.pushDisable')
                      : t('settings.pushEnable')}
                </button>
              )}
            </div>
            {pushState === 'enabled' && (
              <p className="text-xs text-green-700 dark:text-green-300">{t('settings.pushEnabled')}</p>
            )}
          </div>
        </div>
      </section>

      {/* SECTION: RECENT ACTIVITY */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-ink dark:text-[#FAF7F2]">
          {t('dashboard.recentActivity')}
        </h2>
        <div className="card">
          {isLoadingActivities ? (
            <div className="flex items-center justify-center py-6" role="status">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : activities.length === 0 ? (
            <p className="text-sm text-muted">
              {t('settings.noActivity')}
            </p>
          ) : (
            <ul className="space-y-3">
              {activities.map((activity) => {
                const path = activityEntityPath(activity)
                return (
                  <li key={activity.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <p className="text-ink dark:text-[#FAF7F2]">
                      <span className="font-medium text-ink dark:text-[#FAF7F2]">
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
                    <span className="shrink-0 text-xs text-muted">
                      {formatDateTime(activity.created_at, user)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      {/* SECTION 3: ACCOUNT */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-ink dark:text-[#FAF7F2]">{t('settings.accountSection')}</h2>
        <div className="card space-y-6">
          {/* Subsection: change password */}
          <div>
            <h3 className="font-display text-base font-semibold text-ink dark:text-[#FAF7F2]">
              {t('settings.passwordSection')}
            </h3>
            <p className="mt-1 text-sm text-muted">
              {t('settings.passwordDescription')}
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
                  <label htmlFor="settings-current-password" className="mb-1 block text-sm font-medium text-ink dark:text-[#FAF7F2]">
                    {t('profile.currentPassword')}
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
                  <label htmlFor="settings-new-password" className="mb-1 block text-sm font-medium text-ink dark:text-[#FAF7F2]">
                    {t('profile.newPassword')}
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
                {isChangingPassword ? t('settings.changingPassword') : t('profile.passwordButton')}
              </button>
            </form>
          </div>

          {/* Subsection: log out & delete account */}
          <div className="border-t border-line/50 pt-6 dark:border-[#322A23]/50">
            <h3 className="font-display text-base font-semibold text-ink dark:text-[#FAF7F2]">
              {t('settings.accountActionsSection')}
            </h3>
            <p className="mt-1 text-sm text-muted">
              {t('settings.accountActionsDescription')}
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
                <span>{t('settings.logoutButton')}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDeleteError('')
                  setShowDeleteModal(true)
                }}
                className="btn-danger"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>{t('settings.deleteAccount')}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className="card w-full max-w-md p-6 shadow-pop">
            <h3 id="delete-modal-title" className="font-display text-lg font-bold text-red-600 dark:text-red-400">
              {t('settings.deleteModalTitle')}
            </h3>
            <p className="mt-2 text-sm text-muted">
              {t('settings.deleteModalWarning')}
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
                {t('actions.cancel')}
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount}
                className="btn-danger"
              >
                {isDeletingAccount ? t('settings.deleting') : t('settings.deleteConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
