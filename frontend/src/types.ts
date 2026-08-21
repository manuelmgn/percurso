export type UserRole = 'admin' | 'user'
export type ThemePreference = 'light' | 'dark' | 'system'
export type Visibility = 'all' | 'specific' | 'private'
export type MapMode = 'points' | 'polygons' | 'auto'

// Canonical, closed taxonomy of place types (pt-PT labels, mirrors the
// backend PlaceType enum). Import PLACE_TYPES wherever the full list is
// needed instead of re-declaring it.
export const PLACE_TYPES = [
  'edifício/monumento',
  'rua/praça',
  'aldeia/lugar',
  'freguesia',
  'vila/cidade',
  'concelho/município',
  'comarca',
  'província',
  'região/comunidade',
  'país',
  'continente',
  'outro',
] as const
export type PlaceType = (typeof PLACE_TYPES)[number]

// Types considered "large" — polygon-friendly by default in map mode logic.
export const BIG_PLACE_TYPES: PlaceType[] = ['país', 'região/comunidade', 'província', 'concelho/município', 'comarca']

export interface User {
  id: number
  username: string
  avatar_url: string | null
  role: UserRole
  is_active: boolean
  timezone: string
  date_format: string
  theme: ThemePreference
  created_at: string
  updated_at: string
}

export interface MeResponse {
  user: User
  csrf_token: string
}

export interface PublicStatus {
  setup_required: boolean
}

export interface LoginRequest {
  username: string
  password: string
}

export interface SetupRequest {
  admin_username: string
  admin_password: string
  second_username?: string
  second_password?: string
}

export interface UserCreate {
  username: string
  password: string
  role?: UserRole
}

export interface UserUpdate {
  username?: string
  role?: UserRole
  is_active?: boolean
}

export interface UserPasswordChange {
  current_password: string
  new_password: string
}

export interface UserPreferencesUpdate {
  timezone?: string
  date_format?: string
  theme?: ThemePreference
}

// Place types
export interface Place {
  id: number
  osm_type: string
  osm_id: number
  name: string
  place_type: PlaceType
  hierarchy: Record<string, string> | null
  lat: number
  lon: number
  polygon: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface PlaceSearchResult {
  osm_type: string
  osm_id: number
  name: string
  place_type: PlaceType
  hierarchy: Record<string, string> | null
  lat: number
  lon: number
  is_cached: boolean
}

// Project types
export interface ProjectPlace {
  id: number
  place_id: number
  place_name: string
  place_type: PlaceType
  place_hierarchy: Record<string, string> | null
  place_lat: number
  place_lon: number
  place_polygon: Record<string, unknown> | null
  is_visited: boolean
  is_unmarked: boolean
  visited_at: string | null
}

export interface Project {
  id: number
  name: string
  description: string | null
  visibility: Visibility
  map_mode: MapMode
  creator_id: number
  creator_username: string
  participants: User[]
  visible_users: User[]
  places: ProjectPlace[]
  trips: TripListItem[]
  total_places: number
  visited_places: number
  progress_percent: number
  is_completed: boolean
  created_at: string
  updated_at: string
}

export interface ProjectListItem {
  id: number
  name: string
  description: string | null
  visibility: Visibility
  creator_username: string
  total_places: number
  visited_places: number
  progress_percent: number
  is_completed: boolean
  created_at: string
  updated_at: string
}

export interface ProjectCreate {
  name: string
  description?: string
  visibility?: Visibility
  map_mode?: MapMode
  participant_ids?: number[]
  visible_user_ids?: number[]
  place_ids?: number[]
}

export interface ProjectUpdate {
  name?: string
  description?: string
  visibility?: Visibility
  map_mode?: MapMode
  participant_ids?: number[]
  visible_user_ids?: number[]
}

export interface BulkImportLine {
  line: string
  status: 'resolved' | 'ambiguous' | 'not_found'
  candidates: PlaceSearchResult[]
  selected: PlaceSearchResult | null
}

export interface BulkImportResponse {
  lines: BulkImportLine[]
}

// Trip types
export interface TripPlace {
  id: number
  place_id: number
  place_name: string
  place_type: PlaceType
  place_hierarchy: Record<string, string> | null
  place_lat: number
  place_lon: number
}

export interface Trip {
  id: number
  start_date: string
  end_date: string
  notes: string | null
  visibility: Visibility
  companions_text: string | null
  creator_id: number
  creator_username: string
  participants: User[]
  visible_users: User[]
  places: TripPlace[]
  projects: ProjectListItem[]
  created_at: string
  updated_at: string
}

export interface TripListItem {
  id: number
  start_date: string
  end_date: string
  visibility: Visibility
  creator_username: string
  place_count: number
  project_count: number
  created_at: string
  updated_at: string
}

export interface TripCreate {
  start_date: string
  end_date?: string
  notes?: string
  visibility?: Visibility
  companions_text?: string
  place_ids?: number[]
  project_ids?: number[]
  participant_ids?: number[]
  visible_user_ids?: number[]
}

export interface TripUpdate {
  start_date?: string
  end_date?: string
  notes?: string
  visibility?: Visibility
  companions_text?: string
  place_ids?: number[]
  project_ids?: number[]
  participant_ids?: number[]
  visible_user_ids?: number[]
}

export interface TripDeleteWarning {
  affected_projects: ProjectListItem[]
}

// Activity types
export interface Activity {
  id: number
  user_id: number
  user_username: string
  action: string
  entity_type: string
  entity_id: number
  entity_name: string
  created_at: string
}

// Image types
export interface ImageUploadResponse {
  url: string
  width: number
  height: number
}

// Search types
export interface SearchResult {
  trips: TripListItem[]
  projects: ProjectListItem[]
  places: Place[]
}

// Stats types
export interface StatsSummary {
  trip_count: number
  place_count: number
  active_projects: number
  completed_projects: number
}

export interface ProjectStat {
  project_id: number
  project_name: string
  progress_percent: number
  visited_places: number
  total_places: number
}

export interface PlaceRanking {
  place_id: number
  place_name: string
  place_type: PlaceType
  visit_count: number
}

export interface RegionStat {
  region: string
  count: number
}

export interface StatsResponse {
  summary: StatsSummary
  project_stats: ProjectStat[]
  region_stats: RegionStat[]
  most_visited: PlaceRanking[]
}
