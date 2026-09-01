import type {
  MeResponse,
  LoginRequest,
  SetupRequest,
  PublicStatus,
  PublicUserProfile,
  User,
  UserCreate,
  UserUpdate,
  UserPreferencesUpdate,
  UserPasswordChange,
  Trip,
  TripListItem,
  TripCreate,
  TripUpdate,
  Project,
  ProjectListItem,
  ProjectCreate,
  ProjectUpdate,
  StatsResponse,
  Place,
  PlaceDetail,
  PlaceOverviewItem,
  PlaceSearchResult,
  PlaceType,
  TripDeleteWarning,
  BulkImportLine,
  BulkImportResponse,
  ActivityItem,
  ImageUploadResponse,
  MilestoneCheckResponse,
  SearchResult,
} from './types'

async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const csrfToken = localStorage.getItem('csrf_token') || ''
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    ...(options.headers as Record<string, string> || {}),
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    // Session expired or invalidated mid-use: drop the stale CSRF token and
    // send the user back to the login screen (except on auth endpoints,
    // where a 401 just means "wrong credentials").
    if (
      response.status === 401 &&
      !path.startsWith('/api/auth/login') &&
      !path.startsWith('/api/setup')
    ) {
      localStorage.removeItem('csrf_token')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    throw new ApiError(response.status, body.detail || body.message || `Request failed: ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

// Multipart uploads must not send Content-Type: application/json — the browser
// sets the multipart boundary itself. Shares fetchJson's error handling.
async function uploadFile<T>(path: string, file: File): Promise<T> {
  const csrfToken = localStorage.getItem('csrf_token') || ''
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(path, {
    method: 'POST',
    body: formData,
    headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
    credentials: 'include',
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    if (response.status === 401) {
      localStorage.removeItem('csrf_token')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    throw new ApiError(response.status, body.detail || body.message || `Request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}

export const api = {
  health: () => fetchJson<{ status: string }>('/api/health'),

  setup: {
    status: () => fetchJson<PublicStatus>('/api/setup/status'),
    complete: (data: SetupRequest) => fetchJson<{ message: string; admin_id: number }>('/api/setup/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  },

  auth: {
    login: (data: LoginRequest) => fetchJson<MeResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    logout: () => fetchJson<{ message: string }>('/api/auth/logout', { method: 'POST' }),
    me: () => fetchJson<MeResponse>('/api/auth/me'),
  },

  me: {
    get: () => fetchJson<User>('/api/me/'),
    update: (data: UserPreferencesUpdate) => fetchJson<User>('/api/me/', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    changePassword: (data: UserPasswordChange) => fetchJson<{ message: string }>('/api/me/password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    uploadAvatar: (file: File) => uploadFile<User>('/api/me/avatar', file),
  },

  activities: {
    list: () => fetchJson<ActivityItem[]>('/api/activities/'),
  },

  images: {
    upload: (file: File) => uploadFile<ImageUploadResponse>('/api/images/', file),
  },

  milestones: {
    check: () => fetchJson<MilestoneCheckResponse>('/api/milestones/check', { method: 'POST' }),
  },

  users: {
    list: () => fetchJson<User[]>('/api/users/'),
    publicProfile: (username: string) => fetchJson<PublicUserProfile>(`/api/users/public/${encodeURIComponent(username)}`),
    create: (data: UserCreate) => fetchJson<User>('/api/users/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    update: (id: number, data: UserUpdate) => fetchJson<User>(`/api/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    resetPassword: (id: number, newPassword: string) => fetchJson<{ message: string }>(`/api/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ new_password: newPassword }),
    }),
    delete: (id: number) => fetchJson<void>(`/api/users/${id}`, { method: 'DELETE' }),
  },

  trips: {
    list: () => fetchJson<TripListItem[]>('/api/trips/'),
    get: (id: number) => fetchJson<Trip>(`/api/trips/${id}`),
    create: (data: TripCreate) => fetchJson<Trip>('/api/trips/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    update: (id: number, data: TripUpdate) => fetchJson<Trip>(`/api/trips/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    delete: (id: number) => fetchJson<void>(`/api/trips/${id}`, { method: 'DELETE' }),
    deleteWarning: (id: number) => fetchJson<TripDeleteWarning>(`/api/trips/${id}/delete-warning`),
  },

  projects: {
    list: () => fetchJson<ProjectListItem[]>('/api/projects/'),
    get: (id: number) => fetchJson<Project>(`/api/projects/${id}`),
    create: (data: ProjectCreate) => fetchJson<Project>('/api/projects/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    update: (id: number, data: ProjectUpdate) => fetchJson<Project>(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    delete: (id: number) => fetchJson<void>(`/api/projects/${id}`, { method: 'DELETE' }),
    addPlace: (projectId: number, placeId: number) =>
      fetchJson<Project>(`/api/projects/${projectId}/places?place_id=${placeId}`, { method: 'POST' }),
    removePlace: (projectId: number, placeId: number) =>
      fetchJson<Project>(`/api/projects/${projectId}/places/${placeId}`, { method: 'DELETE' }),
    toggleUnmark: (projectId: number, placeId: number) =>
      fetchJson<Project>(`/api/projects/${projectId}/places/${placeId}/unmark`, { method: 'POST' }),
    bulkImport: (projectId: number, lines: string[], placeType?: PlaceType | null) =>
      fetchJson<BulkImportResponse>(`/api/projects/${projectId}/bulk-import`, {
        method: 'POST',
        body: JSON.stringify({ lines, place_type: placeType ?? null }),
      }),
    bulkImportConfirm: (projectId: number, lines: BulkImportLine[]) =>
      fetchJson<Project>(`/api/projects/${projectId}/bulk-import/confirm`, {
        method: 'POST',
        body: JSON.stringify(lines),
      }),
  },

  stats: {
    get: () => fetchJson<StatsResponse>('/api/stats/'),
  },

  search: {
    query: (q: string) => fetchJson<SearchResult>(`/api/search/?q=${encodeURIComponent(q)}`),
  },

  places: {
    search: (q: string) => fetchJson<PlaceSearchResult[]>(`/api/places/search?q=${encodeURIComponent(q)}`),
    import: (result: PlaceSearchResult) => fetchJson<Place>('/api/places/import', {
      method: 'POST',
      body: JSON.stringify(result),
    }),
    get: (id: number) => fetchJson<PlaceDetail>(`/api/places/${id}`),
    visited: () => fetchJson<Place[]>('/api/places/visited'),
    overview: () => fetchJson<PlaceOverviewItem[]>('/api/places/overview'),
  },
}
