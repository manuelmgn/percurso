import { useAuthStore } from "@/stores/auth"
import type { TokenResponse, Trip, Project, Place, PlaceSearchResult, User, Notification } from "@/types"

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ""

function getToken(): string | null {
  return localStorage.getItem("access_token")
}

function handleUnauthorized(): never {
  // Update zustand in-memory state → ProtectedRoute re-renders → redirects to /entrar
  useAuthStore.getState().logout()
  throw new Error("Sessão expirada. Por favor, inicia sessão novamente.")
}

function extractErrorMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "Ocorreu um erro inesperado"
  const d = data as Record<string, unknown>

  if (Array.isArray(d.detail) && d.detail.length > 0) {
    const item = d.detail[0] as Record<string, unknown>
    // Pydantic v2 custom validators: real message lives in ctx.error
    const ctx = item?.ctx as Record<string, unknown> | undefined
    if (typeof ctx?.error === "string") return ctx.error
    // Pydantic v2 wraps custom ValueError as "Value error, <msg>"
    const msg = typeof item?.msg === "string" ? item.msg : null
    if (msg?.startsWith("Value error, ")) return msg.slice(13)
    // Map common Pydantic built-in types to pt-PT
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

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  isFormData = false,
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
  if (response.status === 401) return handleUnauthorized()

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
    request<TokenResponse>("POST", "/api/v1/auth/login", { username, password }),
  refresh: (refresh_token: string) =>
    request<TokenResponse>("POST", "/api/v1/auth/refresh", { refresh_token }),
  logout: () => request<void>("POST", "/api/v1/auth/logout"),
}

// Users
export const usersApi = {
  me: () => request<User>("GET", "/api/v1/users/me"),
  update: (data: Partial<User>) => request<User>("PATCH", "/api/v1/users/me", data),
  profile: (username: string) => request<User>("GET", `/api/v1/users/${username}`),
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
  create: (data: unknown) => request<Trip>("POST", "/api/v1/trips", data),
  update: (id: number, data: unknown) => request<Trip>("PATCH", `/api/v1/trips/${id}`, data),
  delete: (id: number) => request<void>("DELETE", `/api/v1/trips/${id}`),
  addPlace: (tripId: number, placeId: number) =>
    request<void>("POST", `/api/v1/trips/${tripId}/places/${placeId}`),
  removePlace: (tripId: number, placeId: number) =>
    request<void>("DELETE", `/api/v1/trips/${tripId}/places/${placeId}`),
  inviteCompanion: (tripId: number, username: string) =>
    request<unknown>("POST", `/api/v1/trips/${tripId}/companions/${username}`),
  acceptInvite: (tripId: number, token: string) =>
    request<unknown>("POST", `/api/v1/trips/${tripId}/companions/accept/${token}`),
  uploadCover: (tripId: number, file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    return request<Trip>("POST", `/api/v1/trips/${tripId}/cover`, fd, true)
  },
  addMedia: (tripId: number, url: string) =>
    request<unknown>("POST", `/api/v1/trips/${tripId}/media`, { url }),
}

// Projects
export const projectsApi = {
  list: () => request<Project[]>("GET", "/api/v1/projects"),
  get: (id: number) => request<Project>("GET", `/api/v1/projects/${id}`),
  create: (data: unknown) => request<Project>("POST", "/api/v1/projects", data),
  update: (id: number, data: unknown) => request<Project>("PATCH", `/api/v1/projects/${id}`, data),
  addPlace: (projectId: number, placeId: number) =>
    request<void>("POST", `/api/v1/projects/${projectId}/places/${placeId}`),
  inviteCollaborator: (projectId: number, username: string) =>
    request<unknown>("POST", `/api/v1/projects/${projectId}/collaborators/${username}`),
  importPlaces: (projectId: number, lines: string[]) =>
    request<unknown>("POST", `/api/v1/projects/${projectId}/import-places`, { lines }),
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
