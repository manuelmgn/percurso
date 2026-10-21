import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import type { PublicUserProfile } from '@/types'

function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
}

export function UserProfilePage() {
  const { t } = useTranslation()
  const { username } = useParams<{ username: string }>()
  const { user } = useAuth()
  const [profile, setProfile] = useState<PublicUserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const isOwnProfile = user?.username === username

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        setProfile(await api.users.publicProfile(username || ''))
      } catch (err: any) {
        setError(err.message || t('userProfile.notFound'))
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [username, t])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label={t('loading')}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="sr-only">{t('loadingGeneric')}</span>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="space-y-6">
        <div className="card">
          <p className="text-red-700 dark:text-red-300">{error || t('userProfile.notFound')}</p>
        </div>
      </div>
    )
  }

  const counters = [
    { label: t('userProfile.trips'), value: profile.trip_count },
    { label: t('userProfile.places'), value: profile.place_count },
  ]

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={t('profile.avatarAlt', { username: profile.username })}
              loading="lazy"
              className="h-24 w-24 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary-100 font-display text-4xl font-bold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
              {profile.username.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <h2 className="font-display text-2xl font-bold">{profile.username}</h2>
            <p className="mt-1 text-sm text-muted">
              {t('userProfile.memberSince', { date: formatMemberSince(profile.created_at) })}
            </p>
          </div>
          {isOwnProfile && (
            <Link to="/definicoes" className="btn-primary">
              {t('userProfile.editProfile')}
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {counters.map((counter) => (
          <div key={counter.label} className="card p-4">
            <p className="font-display text-3xl font-bold text-primary-700 dark:text-primary-300">
              {counter.value}
            </p>
            <p className="mt-1 text-sm text-muted">{counter.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
