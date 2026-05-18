import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Bell, CheckCheck, Loader2, Check, X, MapPin, CheckCircle2, UserPlus } from "lucide-react"
import { Link } from "react-router-dom"
import { notificationsApi, activityApi, tripsApi, projectsApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/utils"
import type { Notification, ActivityEvent, ActivityEventType } from "@/types"

// ── Notifications section ──────────────────────────────────────────────────

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

// ── Activity feed section ──────────────────────────────────────────────────

const EVENT_ICONS: Record<ActivityEventType, React.ElementType> = {
  place_added_to_trip: MapPin,
  place_visited_in_project: CheckCircle2,
  companion_joined: UserPlus,
  collaborator_joined: UserPlus,
}

const EVENT_ICON_COLOURS: Record<ActivityEventType, string> = {
  place_added_to_trip: "text-blue-500",
  place_visited_in_project: "text-green-500",
  companion_joined: "text-purple-500",
  collaborator_joined: "text-purple-500",
}

function activityMessage(event: ActivityEvent): React.ReactNode {
  const actor = (
    <span className="font-semibold text-foreground">
      {event.actor?.display_name ?? "Alguém"}
    </span>
  )
  const entity = (
    <span className="font-medium text-foreground">
      {event.entity_name}
    </span>
  )
  const secondary = event.secondary_name ? (
    <span className="font-medium text-foreground">{event.secondary_name}</span>
  ) : null

  switch (event.event_type) {
    case "place_added_to_trip":
      return <>{actor} adicionou {secondary} à viagem {entity}</>
    case "place_visited_in_project":
      return <>{actor} visitou {secondary} no projeto {entity}</>
    case "companion_joined":
      return <>{actor} juntou-se à viagem {entity}</>
    case "collaborator_joined":
      return <>{actor} juntou-se ao projeto {entity}</>
  }
}

function entityLink(event: ActivityEvent): string {
  return event.entity_type === "trip"
    ? `/viagens/${event.entity_id}`
    : `/projetos/${event.entity_id}`
}

function ActivityCard({ event }: { event: ActivityEvent }) {
  const Icon = EVENT_ICONS[event.event_type]
  const iconColour = EVENT_ICON_COLOURS[event.event_type]
  const actor = event.actor

  return (
    <Link to={entityLink(event)} className="block">
      <div className="glass-card px-4 py-3.5 transition-all hover:border-primary/30 flex items-start gap-3">
        {/* Actor avatar */}
        <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary text-sm font-semibold overflow-hidden mt-0.5">
          {actor?.avatar_url
            ? <img src={actor.avatar_url} alt={actor.display_name} className="h-full w-full object-cover" />
            : (actor?.display_name[0]?.toUpperCase() ?? "?")
          }
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground leading-snug">
            {activityMessage(event)}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <Icon className={`size-3 shrink-0 ${iconColour}`} />
            <p className="text-xs text-muted-foreground">{formatDate(event.created_at)}</p>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const queryClient = useQueryClient()

  const { data: notifications = [], isLoading: loadingNotifs } = useQuery({
    queryKey: ["notifications"],
    queryFn: notificationsApi.list,
    staleTime: 30_000,
  })

  const { data: activityEvents = [], isLoading: loadingActivity } = useQuery({
    queryKey: ["activity"],
    queryFn: activityApi.list,
    staleTime: 60_000,
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
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-8">

      {/* ── Notifications section ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Atividade</h1>
            <p className="text-sm text-muted-foreground mt-0.5">As minhas notificações</p>
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

        {loadingNotifs ? (
          <div className="flex justify-center h-24 items-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="glass-card px-4 py-6 text-center">
            <Bell className="mx-auto mb-2 size-8 text-purple-300" />
            <p className="text-sm font-medium">Sem notificações</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Convites e respostas aparecerão aqui.
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
      </section>

      {/* ── Collaborator activity section ── */}
      <section>
        <h2 className="text-base font-semibold mb-4 text-muted-foreground">
          Atividade de colaboradores
        </h2>

        {loadingActivity ? (
          <div className="flex justify-center h-24 items-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : activityEvents.length === 0 ? (
          <div className="glass-card px-4 py-6 text-center">
            <UserPlus className="mx-auto mb-2 size-8 text-purple-300" />
            <p className="text-sm font-medium">Sem actividade recente</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Quando colaboradores ou companheiros de viagem fizerem alterações, aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {activityEvents.map((e) => (
              <ActivityCard key={e.id} event={e} />
            ))}
          </div>
        )}
      </section>

    </div>
  )
}
