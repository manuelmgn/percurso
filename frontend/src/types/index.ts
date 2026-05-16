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
}

export interface ProjectPublicSummary {
  id: number
  title: string
  cover_image_url: string | null
  cover_colour: string | null
  target_place_count: number
  visited_place_count: number
}

export interface UserProfile extends UserPublic {
  trips: TripPublicSummary[]
  projects: ProjectPublicSummary[]
  visited_place_count: number | null
  visited_places: VisitedPlacePublic[]
}

export interface PlaceSummary {
  id: number
  name: string
  name_pt: string | null
  place_type: PlaceType
  country_code: string | null
  region_name: string | null
  centroid_lng: number | null
  centroid_lat: number | null
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
}

export interface PlaceSearchResult {
  osm_id: number
  osm_type: string
  name: string
  display_name: string
  place_type: PlaceType
  country_code: string | null
  centroid_lng: number
  centroid_lat: number
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
  places?: PlaceSummary[]
  media_links?: MediaLink[]
  shared_with?: SharedUser[]
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
  target_places?: PlaceSummary[]
  shared_with?: SharedUser[]
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
