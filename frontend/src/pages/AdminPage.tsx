import { useEffect, useState } from 'react'
import { api } from '@/api'
import type { User, UserCreate } from '@/types'

export function AdminPage() {
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<UserCreate['role']>('user')

  const loadUsers = async () => {
    try {
      setIsLoading(true)
      const data = await api.users.list()
      setUsers(data)
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar utilizadores')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

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
      setError(err.message || 'Erro ao criar utilizador')
    }
  }

  const handleToggleActive = async (user: User) => {
    try {
      await api.users.update(user.id, { is_active: !user.is_active })
      await loadUsers()
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar utilizador')
    }
  }

  const handleResetPassword = async (user: User) => {
    const password = prompt(`Nova palavra-passe para ${user.username} (mín. 8 caracteres):`)
    if (!password || password.length < 8) return
    try {
      await api.users.resetPassword(user.id, password)
      alert('Palavra-passe redefinida')
    } catch (err: any) {
      setError(err.message || 'Erro ao redefinir palavra-passe')
    }
  }

  const handleDelete = async (user: User) => {
    if (!confirm(`Tens a certeza que queres eliminar ${user.username}?`)) return
    try {
      await api.users.delete(user.id)
      await loadUsers()
    } catch (err: any) {
      setError(err.message || 'Erro ao eliminar utilizador')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold">Administração</h2>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="glass rounded-2xl p-6">
        <h3 className="mb-4 font-display text-lg font-semibold">Criar utilizador</h3>
        <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-4">
          <input
            type="text"
            placeholder="Nome de utilizador"
            required
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            type="password"
            placeholder="Palavra-passe"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as UserCreate['role'])}
            className="rounded-lg border border-neutral-300 bg-white px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="user">Utilizador</option>
            <option value="admin">Administrador</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-primary-600 px-4 py-2 font-medium text-white transition-colors hover:bg-primary-700"
          >
            Criar
          </button>
        </form>
      </div>

      <div className="glass rounded-2xl p-6">
        <h3 className="mb-4 font-display text-lg font-semibold">Utilizadores</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left dark:border-neutral-800">
                <th className="pb-2 font-medium">Utilizador</th>
                <th className="pb-2 font-medium">Função</th>
                <th className="pb-2 font-medium">Estado</th>
                <th className="pb-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-neutral-100 dark:border-neutral-900">
                  <td className="py-3">{user.username}</td>
                  <td className="py-3">{user.role === 'admin' ? 'Administrador' : 'Utilizador'}</td>
                  <td className="py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        user.is_active
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                          : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                      }`}
                    >
                      {user.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleActive(user)}
                        className="rounded-lg bg-neutral-100 px-3 py-1 text-xs font-medium transition-colors hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                      >
                        {user.is_active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        onClick={() => handleResetPassword(user)}
                        className="rounded-lg bg-neutral-100 px-3 py-1 text-xs font-medium transition-colors hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                      >
                        Reset pwd
                      </button>
                      <button
                        onClick={() => handleDelete(user)}
                        className="rounded-lg bg-red-100 px-3 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-200 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
