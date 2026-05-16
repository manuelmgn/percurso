import { useAuthStore } from "@/stores/auth"
import type { TokenResponse, Trip, Project, Place, PlaceSearchResult, User, UserProfile, VisitedPlacePublic, Notification, VisitedPlace } from "@/types"

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ""

function getToken(): string | null {
  return localStorage.getItem("access_token")
}

function handleUnauthorized(): never {
  const token = getToken()
  if (token) {
    try {
      const parts = token.split(".")
      if (parts.length === 3) {
        // base64url → base64
        const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
        const payload = JSON.parse(atob(b64))
        const now = Math.floor(Date.now() / 1000)
        console.warn(
          `[auth] 401 — token exp: ${payload.exp}, now: ${now}, diff: ${payload.exp - now}s, sub: ${payload.sub}`,
        )
      }
    } catch {
      console.warn("[auth] 401 — could not decode token for diagnostics")
    }
  } else {
    console.warn("[auth] 401 — no token found in localStorage")
  }
  useAuthStore.getState().logout()
  throw new Error("Sessão expirada. Por favor, inicia sessão novamente.")
}

function extractErrorMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "Ocorreu um erro inesperado"
  const d = data as Record<string, unknown>

  if (Array.isArray(d.detail) && d.detail.length > 0) {
    const item = d.detail[0] as Record<string, unknown>
    const ctx = item?.ctx as Record<string, unknown> | undefined
    if (typeof ctx?.error === "string") return ctx.error
    const msg = typeof item?.msg === "string" ? item.msg : null
    if (msg?.startsWith("Value error, ")) return msg.slice(13)
    const type = typeof item?.type === "string" ? item.type : ""
    if (type === "missing") return "Campo obrigatório em falta"
    if (type === "string_type") return "O valor deve ser texto"
    if (type.includes("email") || msg?.includes("email address")) return "Endereço de email inválido"
    if (type.includes("url") || msg?.includes("URL")) return "URL inválido"
    if (msg) return msg
    return "Ocorreu um erro inesperado"
  }

  if (typeof d.detail === "string") return d.detail
  return "Ocorreu um erro inesperado"
}

// Singleton refresh promise — prevents multiple concurrent refresh attempts
let _refreshPromise: Promise<void> | null = null

async function tryRefresh(): Promise<void> {
  if (_refreshPromise) return _refreshPromise
  _refreshPromise = (async () => {
    const response = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
    if (!response.ok) throw new Error("refresh failed")
    const data: TokenResponse = await response.json()
    useAuthStore.getState().setToken(data.access_token)
  })()
  return _refreshPromise.finally(() => { _refreshPromise = null })
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  isFormData = false,
  _isRetry = false,
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {}

  if (token) headers["Authorization"] = `Bearer ${token}`
  if (body && !isFormData) headers["Content-Type"] = "application/json"

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
      credentials: "include",
    })
  } catch {
    throw new Error("Não foi possível contactar o servidor. Verifica a tua ligação à internet.")
  }

  if (response.status === 204) return undefined as T

  // Auth endpoints return 401 for wrong credentials — pass through to normal error extraction.
  if (response.status === 401 && !path.startsWith("/api/v1/auth/")) {
    if (!_isRetry) {
      try {
        await tryRefresh()
        return request<T>(method, path, body, isFormData, true)
      } catch {
        return handleUnauthorized()
      }
    }
    return handleUnauthorized()
  }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    if (!response.ok) throw new Error(`Erro de servidor (${response.status}). Por favor, tenta novamente.`)
    return undefined as T
  }

  if (!response.ok) {
    throw new Error(extractErrorMessage(data))
  }

  return data as T
}

// Auth
export const authApi = {
  login: (username: string, password: string) =>
    request<TokenResponse & { user: User }>("POST", "/api/v1/auth/login", { username, password }),
  refresh: () =>
    request<TokenResponse>("POST", "/api/v1/auth/refresh"),
  logout: () => request<void>("POST", "/api/v1/auth/logout"),
}

// Users
export const usersApi = {
  me: () => request<User>("GET", "/api/v1/users/me"),
  update: (data: Partial<User>) => request<User>("PATCH", "/api/v1/users/me", data),
  myPlaces: () => request<VisitedPlace[]>("GET", "/api/v1/users/me/places"),
  changePassword: (current_password: string, new_password: string) =>
    request<void>("POST", "/api/v1/users/me/password", { current_password, new_password }),
  uploadAvatar: (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    return request<User>("POST", "/api/v1/users/me/avatar", fd, true)
  },
  profile: (username: string) => request<UserProfile>("GET", `/api/v1/users/${username}`),
  userPlaces: (username: string, token?: string) => {
    const params = token ? `?token=${encodeURIComponent(token)}` : ""
    return request<VisitedPlacePublic[]>("GET", `/api/v1/users/${username}/places${params}`)
  },
  list: () => request<User[]>("GET", "/api/v1/users"),
  create: (data: unknown) => request<User>("POST", "/api/v1/users", data),
  deactivate: (id: number) => request<User>("POST", `/api/v1/users/${id}/deactivate`),
  reactivate: (id: number) => request<User>("POST", `/api/v1/users/${id}/reactivate`),
}

// Places
export const placesApi = {
  search: (q: string, country?: string) => {
    const params = new URLSearchParams({ q })
    if (country) params.set("country", country)
    return request<PlaceSearchResult[]>("GET", `/api/v1/places/search?${params}`)
  },
  get: (id: number) => request<Place>("GET", `/api/v1/places/${id}`),
  import: (osm_id: number, osm_type: string) =>
    request<Place>("POST", `/api/v1/places/import?osm_id=${osm_id}&osm_type=${osm_type}`),
}

// Trips
export const tripsApi = {
  list: () => request<Trip[]>("GET", "/api/v1/trips"),
  get: (id: number) => request<Trip>("GET", `/api/v1/trips/${id}`),
  getShared: (token: string) => request<Trip>("GET", `/api/v1/trips/shared/${token}`),
  create: (data: unknown) => request<Trip>("POST", "/api/v1/trips", data),
  update: (id: number, data: unknown) => request<Trip>("PATCH", `/api/v1/trips/${id}`, data),
  delete: (id: number) => request<void>("DELETE", `/api/v1/trips/${id}`),
  addPlace: (tripId: number, placeId: number) =>
    request<void>("POST", `/api/v1/trips/${tripId}/places/${placeId}`),
  removePlace: (tripId: number, placeId: number) =>
    request<void>("DELETE", `/api/v1/trips/${tripId}/places/${placeId}`),
  addSharedUser: (tripId: number, username: string) =>
    request<unknown>("POST", `/api/v1/trips/${tripId}/shared-users`, { username }),
  removeSharedUser: (tripId: number, userId: number) =>
    request<void>("DELETE", `/api/v1/trips/${tripId}/shared-users/${userId}`),
  inviteCompanion: (tripId: number, username: string) =>
    request<unknown>("POST", `/api/v1/trips/${tripId}/companions/${username}`),
  removeCompanion: (tripId: number, companionId: number) =>
    request<void>("DELETE", `/api/v1/trips/${tripId}/companions/${companionId}`),
  acceptInvite: (tripId: number, token: string) =>
    request<unknown>("POST", `/api/v1/trips/${tripId}/companions/accept/${token}`),
  acceptInviteAsMe: (tripId: number) =>
    request<unknown>("POST", `/api/v1/trips/${tripId}/companions/accept-me`),
  declineInviteAsMe: (tripId: number) =>
    request<unknown>("POST", `/api/v1/trips/${tripId}/companions/decline-me`),
  removeMedia: (tripId: number, mediaId: number) =>
    request<void>("DELETE", `/api/v1/trips/${tripId}/media/${mediaId}`),
  uploadCover: (tripId: number, file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    return request<Trip>("POST", `/api/v1/trips/${tripId}/cover`, fd, true)
  },
  generateCover: (tripId: number) =>
    request<Trip>("POST", `/api/v1/trips/${tripId}/generate-cover`),
  deleteCover: (tripId: number) =>
    request<Trip>("DELETE", `/api/v1/trips/${tripId}/cover`),
  addMedia: (tripId: number, url: string) =>
    request<unknown>("POST", `/api/v1/trips/${tripId}/media`, { url }),
}

// Projects
export const projectsApi = {
  list: () => request<Project[]>("GET", "/api/v1/projects"),
  get: (id: number) => request<Project>("GET", `/api/v1/projects/${id}`),
  getShared: (token: string) => request<Project>("GET", `/api/v1/projects/shared/${token}`),
  create: (data: unknown) => request<Project>("POST", "/api/v1/projects", data),
  update: (id: number, data: unknown) => request<Project>("PATCH", `/api/v1/projects/${id}`, data),
  delete: (id: number) => request<void>("DELETE", `/api/v1/projects/${id}`),
  addPlace: (projectId: number, placeId: number) =>
    request<void>("POST", `/api/v1/projects/${projectId}/places/${placeId}`),
  removePlace: (projectId: number, placeId: number) =>
    request<void>("DELETE", `/api/v1/projects/${projectId}/places/${placeId}`),
  addSharedUser: (projectId: number, username: string) =>
    request<unknown>("POST", `/api/v1/projects/${projectId}/shared-users`, { username }),
  removeSharedUser: (projectId: number, userId: number) =>
    request<void>("DELETE", `/api/v1/projects/${projectId}/shared-users/${userId}`),
  inviteCollaborator: (projectId: number, username: string) =>
    request<unknown>("POST", `/api/v1/projects/${projectId}/collaborators/${username}`),
  removeCollaborator: (projectId: number, collaboratorId: number) =>
    request<void>("DELETE", `/api/v1/projects/${projectId}/collaborators/${collaboratorId}`),
  acceptInviteAsMe: (projectId: number) =>
    request<unknown>("POST", `/api/v1/projects/${projectId}/collaborators/accept-me`),
  declineInviteAsMe: (projectId: number) =>
    request<unknown>("POST", `/api/v1/projects/${projectId}/collaborators/decline-me`),
  importPlaces: (projectId: number, lines: string[]) =>
    request<unknown>("POST", `/api/v1/projects/${projectId}/import-places`, { lines }),
  uploadCover: (projectId: number, file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    return request<Project>("POST", `/api/v1/projects/${projectId}/cover`, fd, true)
  },
  generateCover: (projectId: number) =>
    request<Project>("POST", `/api/v1/projects/${projectId}/generate-cover`),
  deleteCover: (projectId: number) =>
    request<Project>("DELETE", `/api/v1/projects/${projectId}/cover`),
}

// Notifications
export const notificationsApi = {
  list: () => request<Notification[]>("GET", "/api/v1/notifications"),
  markRead: (id: number) => request<void>("POST", `/api/v1/notifications/${id}/read`),
  markAllRead: () => request<void>("POST", "/api/v1/notifications/read-all"),
}

// Admin
export const adminApi = {
  stats: () => request<Record<string, number>>("GET", "/api/v1/admin/stats"),
  health: () => request<Record<string, string>>("GET", "/api/v1/admin/health"),
}
