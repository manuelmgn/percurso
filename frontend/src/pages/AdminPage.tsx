import { useState } from 'react'
import { api } from '@/api'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { useApiResource, getErrorMessage } from '@/hooks/useApiResource'
import { useTranslation } from '@/i18n'
import type { User, UserCreate } from '@/types'

export function AdminPage() {
  const { t } = useTranslation()
  // User list via the shared hook; mutations call `refetch`.
  const { data: users, error, refetch } = useApiResource<User[]>(
    () => api.users.list(),
    [],
    [],
  )
  const [actionError, setActionError] = useState('')
  const [successNotice, setSuccessNotice] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<UserCreate['role']>('user')
  // Inline (non-native) flows: arming rows and the reset-password panel.
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null)
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null)
  const [resetPasswordValue, setResetPasswordValue] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [backupState, setBackupState] = useState<{ status: 'idle' | 'running' | 'ok' | 'error' | 'confirm'; message: string }>({
    status: 'idle',
    message: '',
  })

  const handleBackup = async () => {
    // Two-step inline confirmation replaces the native confirm() used before.
    if (backupState.status !== 'confirm') {
      setBackupState({ status: 'confirm', message: t('admin.backupConfirm') })
      return
    }
    setBackupState({ status: 'running', message: '' })
    try {
      const result = await api.admin.backup()
      setBackupState({ status: 'ok', message: t('admin.backupCreated', { name: result.backup }) })
    } catch (err) {
      setBackupState({ status: 'error', message: getErrorMessage(err, t('admin.backupError')) })
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setActionError('')
    setIsBusy(true)
    try {
      await api.users.create({ username: newUsername, password: newPassword, role: newRole })
      setNewUsername('')
      setNewPassword('')
      setNewRole('user')
      refetch()
    } catch (err) {
      setActionError(getErrorMessage(err, t('admin.createError')))
    } finally {
      setIsBusy(false)
    }
  }

  const handleToggleActive = async (user: User) => {
    setActionError('')
    setIsBusy(true)
    try {
      await api.users.update(user.id, { is_active: !user.is_active })
      refetch()
    } catch (err) {
      setActionError(getErrorMessage(err, t('admin.updateError')))
    } finally {
      setIsBusy(false)
    }
  }

  const handleResetPassword = async () => {
    if (!resetPasswordUser) return
    if (resetPasswordValue.length < 8) {
      setActionError(t('errors.minLength', { min: 8 }))
      return
    }
    setActionError('')
    setIsBusy(true)
    try {
      await api.users.resetPassword(resetPasswordUser.id, resetPasswordValue)
      // Session revoke on the backend also invalidates that user's logins.
      setResetPasswordUser(null)
      setResetPasswordValue('')
      setSuccessNotice(t('admin.resetPasswordSuccess'))
    } catch (err) {
      setActionError(getErrorMessage(err, t('admin.resetPasswordError')))
    } finally {
      setIsBusy(false)
    }
  }

  const handleDelete = async (user: User) => {
    setActionError('')
    setIsBusy(true)
    try {
      await api.users.delete(user.id)
      setDeleteUserId(null)
      refetch()
    } catch (err) {
      setActionError(getErrorMessage(err, t('admin.deleteError')))
      setDeleteUserId(null)
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold">{t('admin.title')}</h2>
      <ErrorBanner message={error || actionError} />

      {successNotice && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300" role="status">
          {successNotice}
        </div>
      )}

      <div className="card">
        <h3 className="mb-4 font-display text-lg font-semibold">{t('admin.createUserTitle')}</h3>
        <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-4">
          <div>
            <label htmlFor="admin-new-username" className="mb-1 block text-sm font-medium">
              {t('admin.usernamePlaceholder')}
            </label>
            <input
              id="admin-new-username"
              type="text"
              placeholder={t('admin.usernamePlaceholder')}
              required
              autoComplete="username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="admin-new-password" className="mb-1 block text-sm font-medium">
              {t('admin.passwordPlaceholder')}
            </label>
            <input
              id="admin-new-password"
              type="password"
              placeholder={t('admin.passwordPlaceholder')}
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="admin-new-role" className="mb-1 block text-sm font-medium">
              {t('admin.roleLabel')}
            </label>
            <select
              id="admin-new-role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as UserCreate['role'])}
              className="input"
            >
              <option value="user">{t('admin.roleUser')}</option>
              <option value="admin">{t('admin.roleAdmin')}</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={isBusy}
              className="btn-primary w-full justify-center"
            >
              {t('admin.createButton')}
            </button>
          </div>
        </form>
      </div>

      {resetPasswordUser && (
        <div className="card border-primary-300 dark:border-primary-700">
          <h3 className="font-display text-lg font-semibold">
            {t('admin.resetPasswordPrompt', { username: resetPasswordUser.username })}
          </h3>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder={t('admin.passwordPlaceholder')}
              aria-label={t('admin.passwordPlaceholder')}
              value={resetPasswordValue}
              onChange={(e) => setResetPasswordValue(e.target.value)}
              className="input max-w-xs"
              autoFocus
            />
            <button onClick={handleResetPassword} disabled={isBusy} className="btn-primary">
              {t('admin.actionResetPassword')}
            </button>
            <button
              onClick={() => { setResetPasswordUser(null); setResetPasswordValue('') }}
              disabled={isBusy}
              className="btn-outline"
            >
              {t('actions.cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="mb-4 font-display text-lg font-semibold">{t('admin.userListTitle')}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="pb-2 font-medium">{t('admin.tableUser')}</th>
                <th className="pb-2 font-medium">{t('admin.tableRole')}</th>
                <th className="pb-2 font-medium">{t('admin.tableStatus')}</th>
                <th className="pb-2 font-medium">{t('admin.tableActions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-line/50">
                  <td className="py-3">{user.username}</td>
                  <td className="py-3">{user.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleUser')}</td>
                  <td className="py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        user.is_active
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                          : 'bg-line/40 text-muted dark:bg-fill'
                      }`}
                    >
                      {user.is_active ? t('admin.statusActive') : t('admin.statusInactive')}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleActive(user)}
                        disabled={isBusy}
                        className="rounded-lg bg-line/40 px-3 py-1 text-xs font-medium transition-colors hover:bg-line/70 dark:hover:bg-fill"
                      >
                        {user.is_active ? t('admin.actionDeactivate') : t('admin.actionActivate')}
                      </button>
                      <button
                        onClick={() => { setResetPasswordUser(user); setResetPasswordValue('') }}
                        disabled={isBusy}
                        className="rounded-lg bg-line/40 px-3 py-1 text-xs font-medium transition-colors hover:bg-line/70 dark:hover:bg-fill"
                      >
                        {t('admin.actionResetPassword')}
                      </button>
                      {deleteUserId === user.id ? (
                        <>
                          <button
                            onClick={() => handleDelete(user)}
                            disabled={isBusy}
                            className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700"
                          >
                            {t('admin.deleteConfirm', { username: user.username })}
                          </button>
                          <button
                            onClick={() => setDeleteUserId(null)}
                            disabled={isBusy}
                            className="rounded-lg bg-line/40 px-3 py-1 text-xs font-medium transition-colors hover:bg-line/70 dark:hover:bg-fill"
                          >
                            {t('actions.cancel')}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeleteUserId(user.id)}
                          disabled={isBusy}
                          className="rounded-lg bg-red-100 px-3 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-200 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30"
                        >
                          {t('admin.actionDelete')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-2 font-display text-lg font-semibold">{t('admin.backupTitle')}</h3>
        <p className="mb-4 text-sm text-muted">
          {t('admin.backupDescription')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleBackup}
            disabled={backupState.status === 'running'}
            className="btn-primary"
          >
            {backupState.status === 'running' ? t('admin.backupRunning') : t('admin.backupButton')}
          </button>
          {backupState.status === 'confirm' && (
            <button
              onClick={() => setBackupState({ status: 'idle', message: '' })}
              className="btn-outline"
            >
              {t('actions.cancel')}
            </button>
          )}
        </div>
        {backupState.message && (
          <p
            className={`mt-3 text-sm ${
              backupState.status === 'ok' || backupState.status === 'confirm'
                ? 'text-green-700 dark:text-green-300'
                : 'text-red-700 dark:text-red-300'
            }`}
            role="status"
          >
            {backupState.message}
          </p>
        )}
      </div>
    </div>
  )
}
