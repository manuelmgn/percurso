import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Bell, CheckCheck, Loader2, Check, X } from "lucide-react"
import { notificationsApi, tripsApi, projectsApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/utils"
import type { Notification } from "@/types"

function InviteActions({ notification }: { notification: Notification }) {
  const queryClient = useQueryClient()

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["notifications"] })
  }

  const acceptTrip = useMutation({
    mutationFn: () => tripsApi.acceptInviteAsMe(notification.entity_id!),
    onSuccess: () => {
      notificationsApi.markRead(notification.id)
      queryClient.invalidateQueries({ queryKey: ["trips"] })
      invalidate()
    },
  })
  const declineTrip = useMutation({
    mutationFn: () => tripsApi.declineInviteAsMe(notification.entity_id!),
    onSuccess: () => {
      notificationsApi.markRead(notification.id)
      invalidate()
    },
  })
  const acceptProject = useMutation({
    mutationFn: () => projectsApi.acceptInviteAsMe(notification.entity_id!),
    onSuccess: () => {
      notificationsApi.markRead(notification.id)
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      invalidate()
    },
  })
  const declineProject = useMutation({
    mutationFn: () => projectsApi.declineInviteAsMe(notification.entity_id!),
    onSuccess: () => {
      notificationsApi.markRead(notification.id)
      invalidate()
    },
  })

  const isPending =
    acceptTrip.isPending || declineTrip.isPending ||
    acceptProject.isPending || declineProject.isPending

  const error =
    acceptTrip.error || declineTrip.error ||
    acceptProject.error || declineProject.error

  const isTrip = notification.entity_type === "trip"

  return (
    <div className="mt-2 flex items-center gap-2">
      <Button
        size="sm"
        className="h-8 px-3 text-xs"
        disabled={isPending}
        onClick={() => isTrip ? acceptTrip.mutate() : acceptProject.mutate()}
      >
        {isPending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
        Aceitar
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-3 text-xs"
        disabled={isPending}
        onClick={() => isTrip ? declineTrip.mutate() : declineProject.mutate()}
      >
        <X className="size-3" />
        Recusar
      </Button>
      {error && (
        <span className="text-xs text-destructive">{(error as Error).message}</span>
      )}
    </div>
  )
}

export default function NotificationsPage() {
  const queryClient = useQueryClient()
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: notificationsApi.list,
    staleTime: 30_000,
  })

  const markAll = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  })

  const markOne = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  })

  const unread = notifications.filter((n) => !n.is_read)
  const isInvite = (n: Notification) =>
    (n.type === "trip_invite" || n.type === "project_invite") && n.entity_id != null

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Notificações</h1>
          {unread.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">{unread.length} não lidas</p>
          )}
        </div>
        {unread.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
            className="shrink-0"
          >
            <CheckCheck className="size-4" />
            <span className="hidden sm:inline">Marcar todas como lidas</span>
            <span className="sm:hidden">Limpar</span>
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center h-48 items-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="glass-card p-12 md:p-16 text-center">
          <Bell className="mx-auto mb-4 size-10 text-purple-300" />
          <p className="font-medium">Sem notificações</p>
          <p className="text-sm text-muted-foreground mt-1">
            Quando receberes convites ou respostas, aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`glass-card px-4 py-3.5 transition-all ${!n.is_read ? "border-purple-300/50 dark:border-purple-600/30" : ""}`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-1.5 size-2 shrink-0 rounded-full ${n.is_read ? "bg-muted" : "bg-primary"}`} />
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm ${n.is_read ? "text-muted-foreground" : "font-medium"} ${!isInvite(n) ? "cursor-pointer" : ""}`}
                    onClick={() => !isInvite(n) && !n.is_read && markOne.mutate(n.id)}
                  >
                    {n.message}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDate(n.created_at)}</p>

                  {isInvite(n) && !n.is_read && (
                    <InviteActions notification={n} />
                  )}
                  {isInvite(n) && n.is_read && (
                    <p className="mt-1 text-xs text-muted-foreground italic">Convite já respondido.</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
