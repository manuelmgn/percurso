import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/components/ThemeProvider'
import { api } from '@/api'
import { getErrorMessage } from '@/hooks/useApiResource'
import { useModalA11y } from '@/hooks/useModalA11y'
import { formatDate, formatDateTime } from '@/utils/format'
import { isPushEnabled, subscribePush, unsubscribePush } from '@/utils/push'
import type { ActivityItem, ThemePreference } from '@/types'
import { Sun, Moon, Monitor, CircleUser, ArrowRight, Camera, LogOut, Trash2 } from 'lucide-react'

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

function DeleteAccountModal({
  error,
  isDeleting,
  onClose,
  onConfirm,
}: {
  error: string
  isDeleting: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  // Esc, focus trap, scroll lock and focus restore are all in the hook.
  const containerRef = useModalA11y<HTMLDivElement>(onClose)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="card w-full max-w-md p-6 shadow-pop focus:outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="delete-modal-title" className="font-display text-lg font-bold text-red-600 dark:text-red-400">
          {t('settings.deleteModalTitle')}
        </h3>
        <p className="mt-2 text-sm text-muted">
          {t('settings.deleteModalWarning')}
        </p>

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="btn-outline"
          >
            {t('actions.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="btn-danger"
          >
            {isDeleting ? t('settings.deleting') : t('settings.deleteConfirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

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
    } catch (err) {
      setAvatarError(getErrorMessage(err, t('profile.avatarError')))
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
    } catch (err) {
      setUsernameError(getErrorMessage(err, t('settings.usernameError')))
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
    } catch (err) {
      setPrefsError(getErrorMessage(err))
    }
  }

  // The yearly goal commits on blur/Enter, not per keystroke: typing 500 used
  // to fire a PATCH + full refreshUser for every digit.
  const [goalDraft, setGoalDraft] = useState(user?.yearly_trip_goal?.toString() ?? '')
  useEffect(() => {
    setGoalDraft(user?.yearly_trip_goal?.toString() ?? '')
  }, [user?.yearly_trip_goal])
  const commitGoalDraft = () => {
    if (!user) return
    const raw = goalDraft.trim()
    const value = raw === '' ? 0 : Number(raw)
    const invalid = !Number.isFinite(value) || value < 0 || value > 1000
    if (invalid) {
      // Restore the currently saved value; empty means "no goal" (0).
      setGoalDraft((user.yearly_trip_goal ?? '').toString())
      return
    }
    if (value === (user.yearly_trip_goal ?? 0)) return // unchanged → no request
    handlePreferenceChange({ yearly_trip_goal: value })
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
    } catch (err) {
      setPasswordError(getErrorMessage(err, t('profile.passwordError')))
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
    } catch (err) {
      setDeleteError(getErrorMessage(err, t('settings.deleteError')))
      setIsDeletingAccount(false)
    }
  }

  const themeOptions: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
    {
      value: 'light',
      label: t('profile.themeLight'),
      icon: (
        <Sun size={20} />
      ),
    },
    {
      value: 'dark',
      label: t('profile.themeDark'),
      icon: (
        <Moon size={20} />
      ),
    },
    {
      value: 'system',
      label: t('profile.themeSystem'),
      icon: (
        <Monitor size={20} />
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
        <h2 className="font-display text-xl font-bold text-ink">{t('profile.title')}</h2>
        <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
          {/* Div 1 (left): link to view the profile */}
          <div className="card flex flex-col justify-between">
            <div>
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300">
                <CircleUser size={24} />
              </div>
              <h3 className="font-display text-lg font-semibold text-ink">
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
                <ArrowRight size={16} />
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
                  <Camera size={24} />
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
              <label className="mb-1 block text-sm font-medium text-ink">
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
        <h2 className="font-display text-xl font-bold text-ink">{t('profile.preferences')}</h2>
        <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
          {/* Div 1: theme choice */}
          <div className="card space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-ink">
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
                      : 'bg-line/40 text-ink hover:bg-line dark:hover:bg-fill'
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
              <h3 className="font-display text-base font-semibold text-ink">
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
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="settings-tz">
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
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="settings-df">
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
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="settings-goal">
                  {t('settings.yearlyGoalLabel')}
                </label>
                <input
                  id="settings-goal"
                  type="number"
                  min={0}
                  max={1000}
                  value={goalDraft}
                  placeholder={t('settings.yearlyGoalPlaceholder')}
                  onChange={(e) => setGoalDraft(e.target.value)}
                  onBlur={commitGoalDraft}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
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
                <h3 className="font-display text-base font-semibold text-ink">
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
        <h2 className="font-display text-xl font-bold text-ink">
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
                    <p className="text-ink">
                      <span className="font-medium text-ink">
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
        <h2 className="font-display text-xl font-bold text-ink">{t('settings.accountSection')}</h2>
        <div className="card space-y-6">
          {/* Subsection: change password */}
          <div>
            <h3 className="font-display text-base font-semibold text-ink">
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
                  <label htmlFor="settings-current-password" className="mb-1 block text-sm font-medium text-ink">
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
                  <label htmlFor="settings-new-password" className="mb-1 block text-sm font-medium text-ink">
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
          <div className="border-t border-line/50 pt-6">
            <h3 className="font-display text-base font-semibold text-ink">
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
                <LogOut size={16} />
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
                <Trash2 size={16} />
                <span>{t('settings.deleteAccount')}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteModal && (
        <DeleteAccountModal
          error={deleteError}
          isDeleting={isDeletingAccount}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleDeleteAccount}
        />
      )}
    </div>
  )
}
