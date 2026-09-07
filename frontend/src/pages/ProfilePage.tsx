import { useRef, useState } from 'react'
import { useTranslation } from '@/i18n'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/components/ThemeProvider'
import { api } from '@/api'
import { formatDate } from '@/utils/format'
import type { ThemePreference } from '@/types'

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

export function ProfilePage() {
  const { t } = useTranslation()
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
      setAvatarError(err.message || t('profile.avatarError'))
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

  const [prefsError, setPrefsError] = useState('')

  const handlePreferenceChange = async (prefs: { timezone?: string; date_format?: string }) => {
    setPrefsError('')
    try {
      await api.me.update(prefs)
      await refreshUser()
    } catch (err: any) {
      setPrefsError(err.message || t('profile.preferencesError'))
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage('')
    setError('')
    try {
      await api.me.changePassword({ current_password: currentPassword, new_password: newPassword })
      setMessage(t('profile.passwordChanged'))
      setCurrentPassword('')
      setNewPassword('')
    } catch (err: any) {
      setError(err.message || t('profile.passwordError'))
    }
  }

  const themeLabels: Record<ThemePreference, string> = {
    light: t('profile.themeLight'),
    dark: t('profile.themeDark'),
    system: t('profile.themeSystem'),
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold">{t('profile.title')}</h2>

      <div className="glass rounded-2xl p-6">
        <h3 className="mb-4 font-display text-lg font-semibold">{t('profile.account')}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">{t('profile.usernameLabel')}</label>
            <div className="rounded-lg border border-neutral-200 bg-neutral-100 px-4 py-2 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
              {user?.username}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t('profile.roleLabel')}</label>
            <div className="rounded-lg border border-neutral-200 bg-neutral-100 px-4 py-2 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
              {user?.role === 'admin' ? t('profile.roleAdmin') : t('profile.roleUser')}
            </div>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-6">
        <h3 className="mb-4 font-display text-lg font-semibold">{t('profile.avatarTitle')}</h3>
        {avatarError && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
            {avatarError}
          </div>
        )}
        <div className="flex items-center gap-4">
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={t('profile.avatarAlt', { username: user.username })}
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
              {isUploadingAvatar ? t('profile.avatarUploading') : t('profile.avatarChange')}
            </button>
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              {t('profile.avatarFormats')}
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
        <h3 className="mb-4 font-display text-lg font-semibold">{t('profile.preferences')}</h3>
        {prefsError && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
            {prefsError}
          </div>
        )}
        <div>
          <label className="mb-2 block text-sm font-medium">{t('profile.theme')}</label>
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as ThemePreference[]).map((themeValue) => (
              <button
                key={themeValue}
                onClick={() => handleThemeChange(themeValue)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  theme === themeValue
                    ? 'bg-primary-600 text-white'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                }`}
              >
                {themeLabels[themeValue]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="timezone">{t('profile.timezone')}</label>
            <select
              id="timezone"
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
            <label className="mb-1 block text-sm font-medium" htmlFor="date-format">{t('profile.dateFormat')}</label>
            <select
              id="date-format"
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

      <div className="glass rounded-2xl p-6">
        <h3 className="mb-4 font-display text-lg font-semibold">{t('profile.changePassword')}</h3>
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
            <label className="mb-1 block text-sm font-medium">{t('profile.currentPassword')}</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t('profile.newPassword')}</label>
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
            {t('profile.passwordButton')}
          </button>
        </form>
      </div>
    </div>
  )
}
