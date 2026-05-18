export type Visibility = "public" | "private" | "link" | "users"
export type UserRole = "admin" | "user"
export type InviteStatus = "pending" | "accepted" | "declined"
import type { PlaceType } from "@/lib/placeTypes"
export type { PlaceType }

export interface User {
  id: number
  username: string
  email: string
  display_name: string
  avatar_url: string | null
  biography: string | null
  website_url: string | null
  role: UserRole
  is_active: boolean
  default_trip_visibility: Visibility
  default_project_visibility: Visibility
  visited_places_visibility: Visibility
  visited_places_sharing_token: string | null
}

export interface VisitedPlacePublic {
  id: number
  name: string
  name_pt: string | null
  place_type: PlaceType
  country_code: string | null
  region_name: string | null
  centroid_lng: number | null
  centroid_lat: number | null
  geometry_geojson: Record<string, unknown> | null
}

export interface UserPublic {
  id: number
  username: string
  display_name: string
  avatar_url: string | null
  biography: string | null
  website_url: string | null
}

export interface TripPublicSummary {
  id: number
  title: string
  start_date: string | null
  end_date: string | null
  cover_image_url: string | null
  cover_colour: string | null
  place_count: number
  is_pinned: boolean
}

export interface ProjectPublicSummary {
  id: number
  title: string
  cover_image_url: string | null
  cover_colour: string | null
  target_place_count: number
  visited_place_count: number
  is_pinned: boolean
  is_archived: boolean
}

export interface ProfileStats {
  total_places: number
  total_countries: number
  avg_project_completion: number
}

export interface UserProfile extends UserPublic {
  pinned_trips: TripPublicSummary[]
  recent_trips: TripPublicSummary[]
  total_public_trip_count: number
  pinned_projects: ProjectPublicSummary[]
  active_projects: ProjectPublicSummary[]
  total_public_project_count: number
  stats: ProfileStats | null
  visited_place_count: number | null
  visited_places: VisitedPlacePublic[]
}

export interface SiteSettings {
  allow_public_profiles_without_auth: boolean
}

export interface PlaceSummary {
  id: number
  osm_id: number
  name: string
  name_pt: string | null
  place_type: PlaceType
  country_code: string | null
  region_name: string | null
  centroid_lng: number | null
  centroid_lat: number | null
  geometry_geojson: Record<string, unknown> | null
}

export interface TripLink {
  id: number
  title: string
}

export interface VisitedPlace extends Place {
  visit_count: number
  first_visited: string | null
  trips: TripLink[]
}

export interface TripDateSummary {
  id: number
  title: string
  start_date: string | null
  end_date: string | null
}

export interface Place {
  id: number
  osm_id: number
  osm_type: string
  name: string
  name_pt: string | null
  place_type: PlaceType
  country_code: string | null
  region_name: string | null
  wikipedia_summary: string | null
  wikipedia_language: string | null
  wikipedia_title: string | null
  centroid_lng: number | null
  centroid_lat: number | null
  has_polygon: boolean
  geometry_geojson: Record<string, unknown> | null
  place_trips: TripDateSummary[]
}

export interface PlaceSearchResult {
  osm_id: number
  osm_type: string
  osm_class: string
  name: string
  display_name: string
  place_type: PlaceType
  place_type_label: string
  place_category: string
  country_code: string | null
  centroid_lng: number
  centroid_lat: number
  importance: number | null
}

export interface Companion {
  id: number
  user_id: number
  username: string
  display_name: string
  avatar_url: string | null
  status: InviteStatus
}

export interface SharedUser {
  id: number
  user_id: number
  username: string
  display_name: string
  avatar_url: string | null
}

export interface MediaLink {
  id: number
  url: string
  og_title: string | null
  og_description: string | null
  og_image_url: string | null
  og_site_name: string | null
}

export interface TripSummaryForPlace {
  id: number
  title: string
  start_date: string | null
}

export interface ProjectTargetPlace {
  id: number
  osm_id: number
  name: string
  name_pt: string | null
  place_type: PlaceType
  country_code: string | null
  region_name: string | null
  centroid_lng: number | null
  centroid_lat: number | null
  geometry_geojson: Record<string, unknown> | null
  visited: boolean
  direct_visit: boolean
  visit_trips: TripSummaryForPlace[]
}

export interface AssociatedProject {
  id: number
  title: string
  cover_colour: string | null
  cover_image_url: string | null
}

export interface AssociatedTrip {
  id: number
  title: string
  start_date: string | null
  end_date: string | null
  covered_place_ids: number[]
}

export interface MissingMember {
  user_id: number
  display_name: string
  username: string
}

export interface Trip {
  id: number
  title: string
  description: string | null
  start_date: string | null
  end_date: string | null
  cover_image_url: string | null
  cover_image_generating: boolean
  cover_colour: string | null
  visibility: Visibility
  sharing_token: string | null
  creator_id: number
  creator_username: string
  creator_display_name: string
  companions: Companion[]
  place_count: number
  is_pinned: boolean
  places?: PlaceSummary[]
  media_links?: MediaLink[]
  shared_with?: SharedUser[]
  associated_projects?: AssociatedProject[]
}

export interface Project {
  id: number
  title: string
  description: string | null
  goal_description: string | null
  cover_image_url: string | null
  cover_image_generating: boolean
  cover_colour: string | null
  visibility: Visibility
  sharing_token: string | null
  creator_id: number
  creator_username: string
  creator_display_name: string
  collaborators: Companion[]
  target_place_count: number
  visited_place_count: number
  is_pinned: boolean
  is_archived: boolean
  target_places?: ProjectTargetPlace[]
  shared_with?: SharedUser[]
  media_links?: MediaLink[]
  associated_trips?: AssociatedTrip[]
  new_trip_id?: number
}

export interface Notification {
  id: number
  type: string
  message: string
  is_read: boolean
  entity_type: "trip" | "project" | null
  entity_id: number | null
  created_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}
