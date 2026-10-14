import { useEffect, useState } from 'react'
import { api } from '@/api'
import { useTranslation } from '@/i18n'
import type { User, UserCreate } from '@/types'

export function AdminPage() {
  const { t } = useTranslation()
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<UserCreate['role']>('user')
  const [backupState, setBackupState] = useState<{ status: 'idle' | 'running' | 'ok' | 'error'; message: string }>({
    status: 'idle',
    message: '',
  })

  const handleBackup = async () => {
    if (!confirm(t('admin.backupConfirm'))) return
    setBackupState({ status: 'running', message: '' })
    try {
      const result = await api.admin.backup()
      setBackupState({ status: 'ok', message: t('admin.backupCreated', { name: result.backup }) })
    } catch (err: any) {
      setBackupState({ status: 'error', message: err.message || t('admin.backupError') })
    }
  }

  const loadUsers = async () => {
    try {
      setIsLoading(true)
      const data = await api.users.list()
      setUsers(data)
    } catch (err: any) {
      setError(err.message || t('admin.loadError'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [t])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await api.users.create({ username: newUsername, password: newPassword, role: newRole })
      setNewUsername('')
      setNewPassword('')
      setNewRole('user')
      await loadUsers()
    } catch (err: any) {
      setError(err.message || t('admin.createError'))
    }
  }

  const handleToggleActive = async (user: User) => {
    try {
      await api.users.update(user.id, { is_active: !user.is_active })
      await loadUsers()
    } catch (err: any) {
      setError(err.message || t('admin.updateError'))
    }
  }

  const handleResetPassword = async (user: User) => {
    const password = prompt(t('admin.resetPasswordPrompt', { username: user.username }))
    if (!password) return
    if (password.length < 8) {
      setError(t('errors.minLength', { min: 8 }))
      return
    }
    try {
      await api.users.resetPassword(user.id, password)
      alert(t('admin.resetPasswordSuccess'))
    } catch (err: any) {
      setError(err.message || t('admin.resetPasswordError'))
    }
  }

  const handleDelete = async (user: User) => {
    if (!confirm(t('admin.deleteConfirm', { username: user.username }))) return
    try {
      await api.users.delete(user.id)
      await loadUsers()
    } catch (err: any) {
      setError(err.message || t('admin.deleteError'))
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label={t('loading')}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        <span className="sr-only">{t('loadingGeneric')}</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold">{t('admin.title')}</h2>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
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
              className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-700 dark:bg-neutral-900"
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
              className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-700 dark:bg-neutral-900"
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
              className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-700 dark:bg-neutral-900"
            >
              <option value="user">{t('admin.roleUser')}</option>
              <option value="admin">{t('admin.roleAdmin')}</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-lg bg-primary-600 px-4 py-2 font-medium text-white transition-colors hover:bg-primary-700"
            >
              {t('admin.createButton')}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3 className="mb-4 font-display text-lg font-semibold">{t('admin.userListTitle')}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left dark:border-neutral-800">
                <th className="pb-2 font-medium">{t('admin.tableUser')}</th>
                <th className="pb-2 font-medium">{t('admin.tableRole')}</th>
                <th className="pb-2 font-medium">{t('admin.tableStatus')}</th>
                <th className="pb-2 font-medium">{t('admin.tableActions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-neutral-100 dark:border-neutral-900">
                  <td className="py-3">{user.username}</td>
                  <td className="py-3">{user.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleUser')}</td>
                  <td className="py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        user.is_active
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                          : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                      }`}
                    >
                      {user.is_active ? t('admin.statusActive') : t('admin.statusInactive')}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleActive(user)}
                        className="rounded-lg bg-neutral-100 px-3 py-1 text-xs font-medium transition-colors hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                      >
                        {user.is_active ? t('admin.actionDeactivate') : t('admin.actionActivate')}
                      </button>
                      <button
                        onClick={() => handleResetPassword(user)}
                        className="rounded-lg bg-neutral-100 px-3 py-1 text-xs font-medium transition-colors hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                      >
                        {t('admin.actionResetPassword')}
                      </button>
                      <button
                        onClick={() => handleDelete(user)}
                        className="rounded-lg bg-red-100 px-3 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-200 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30"
                      >
                        {t('admin.actionDelete')}
                      </button>
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
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          {t('admin.backupDescription')}
        </p>
        <button
          onClick={handleBackup}
          disabled={backupState.status === 'running'}
          className="rounded-lg bg-primary-600 px-4 py-2 font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          {backupState.status === 'running' ? t('admin.backupRunning') : t('admin.backupButton')}
        </button>
        {backupState.message && (
          <p
            className={`mt-3 text-sm ${
              backupState.status === 'ok'
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
