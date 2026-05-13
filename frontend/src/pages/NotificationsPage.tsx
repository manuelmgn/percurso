import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Bell, CheckCheck, Loader2 } from "lucide-react"
import { notificationsApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/utils"

export default function NotificationsPage() {
  const queryClient = useQueryClient()
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: notificationsApi.list,
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

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Notificações</h1>
          {unread.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">{unread.length} não lidas</p>
          )}
        </div>
        {unread.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            <CheckCheck className="size-4" />
            Marcar todas como lidas
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center h-48 items-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <Bell className="mx-auto mb-4 size-10 text-purple-300" />
          <p className="font-medium">Sem notificações</p>
          <p className="text-sm text-muted-foreground mt-1">Quando receberes convites ou respostas, aparecerão aqui.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`glass-card px-4 py-3.5 flex items-start gap-3 cursor-pointer transition-all ${!n.is_read ? "border-purple-300/50 dark:border-purple-600/30" : ""}`}
              onClick={() => !n.is_read && markOne.mutate(n.id)}
            >
              <div className={`mt-0.5 size-2 shrink-0 rounded-full ${n.is_read ? "bg-muted" : "bg-primary"}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${n.is_read ? "text-muted-foreground" : "font-medium"}`}>
                  {n.message}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{formatDate(n.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
