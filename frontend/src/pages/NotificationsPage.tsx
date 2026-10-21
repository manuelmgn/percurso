import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Briefcase, Compass } from 'lucide-react'
import { api } from '@/api'
import { useTranslation } from '@/i18n'
import { useUnreadCount } from '@/context/UnreadCountContext'
import type { Notification } from '@/types'

function timeAgo(iso: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return t('notifications.justNow')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('notifications.minutesAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('notifications.hoursAgo', { count: hours })
  return new Date(iso).toLocaleDateString('pt-PT')
}

function entityPath(notification: Notification): string {
  if (notification.entity_type === 'trip') return `/viagens/${notification.entity_id}`
  if (notification.entity_type === 'project') return `/projetos/${notification.entity_id}`
  return '/'
}

function messageKey(type: string): string {
  return `notifications.${type}`
}

export function NotificationsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { unreadCount, refresh } = useUnreadCount()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        const res = await api.notifications.list()
        setNotifications(res.notifications)
        if (res.unread_count !== unreadCount) refresh()
      } catch (err: any) {
        setError(err.message || t('notifications.loadError'))
      } finally {
        setIsLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t])

  const handleOpen = async (notification: Notification) => {
    if (!notification.is_read) {
      api.notifications.markRead([notification.id]).then(refresh).catch(() => {})
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
      )
    }
    navigate(entityPath(notification))
  }

  const handleMarkAll = async () => {
    try {
      await api.notifications.markRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      refresh()
    } catch {
      // Keep the list as-is; the next poll will reconcile.
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[28px] font-bold md:text-[40px]">{t('notifications.title')}</h1>
        {unreadCount > 0 && (
          <button onClick={handleMarkAll} className="btn-outline">
            {t('notifications.markAllRead')}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="card p-6 text-sm text-muted" role="status">{t('loadingGeneric')}</div>
      ) : error ? (
        <div className="card p-6 text-sm text-primary" role="alert">{error}</div>
      ) : notifications.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <Bell size={32} className="text-muted" aria-hidden="true" />
          <p className="text-muted">{t('notifications.empty')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((notification) => {
            const Icon = notification.entity_type === 'trip' ? Compass : Briefcase
            return (
              <li key={notification.id}>
                <button
                  onClick={() => handleOpen(notification)}
                  className={`card group flex w-full items-center gap-4 p-4 text-left transition-shadow hover:shadow-card-hover ${
                    notification.is_read ? 'opacity-70' : ''
                  }`}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-tint text-primary dark:bg-primary/20">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {t(messageKey(notification.type), {
                        name: notification.actor_username,
                        title: notification.entity_name,
                      })}
                    </span>
                    <span className="text-xs text-muted">{timeAgo(notification.created_at, t)}</span>
                  </span>
                  {!notification.is_read && (
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
