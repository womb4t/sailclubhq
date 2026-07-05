// Auto-maintained TypeScript types matching the Supabase schema
// Run `supabase gen types typescript` to regenerate from a live project

export type Role = 'admin' | 'race_officer' | 'ood' | 'competitor'
export type MarkType = 'virtual' | 'physical'
export type MarkSource = 'catalogue' | 'race'
export type RoundingSide = 'port' | 'starboard'
export type RaceStatus = 'draft' | 'planned' | 'confirmed' | 'live' | 'cancelled' | 'completed' | 'archived'
export type PrepFlag = 'P' | 'I' | 'U' | 'Black'
export type EntryStatus = 'entered' | 'racing' | 'withdrawn' | 'DNF' | 'OCS' | 'protest'
export type StartStatus = 'clean' | 'ocs-confident' | 'too-close-to-call'
export type ResultStatus = 'finished' | 'OCS' | 'DNF' | 'protest'

export interface Club {
  id: string
  name: string
  vhf_channel: string | null
  created_at: string
}

export interface Profile {
  id: string
  full_name: string | null
  club_id: string | null
  role: Role
  phone: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_relation: string | null
  medical_notes: string | null
  rya_number: string | null
  experience_level: string | null
  profile_complete: boolean
  hide_intro: boolean
  created_at: string
}

export interface Boat {
  id: string
  club_id: string
  owner_id: string | null
  owner_name: string | null
  boat_name: string
  class: string | null
  hull_colour: string | null
  length_m: number | null
  sail_number: string | null
  py_handicap: number | null
  status: string | null
  created_at: string
}

export interface Mark {
  id: string
  club_id: string
  race_id: string | null
  name: string
  short_id: string
  lat: number
  lon: number
  type: MarkType
  source: MarkSource
  default_rounding: RoundingSide
  photo_url: string | null
  notes: string | null
  created_at: string
}

export interface CourseTemplate {
  id: string
  club_id: string
  name: string
  laps: number | null
  expected_wind_dir: number | null
  notes: string | null
  start_line_lat1: number | null
  start_line_lng1: number | null
  start_line_lat2: number | null
  start_line_lng2: number | null
  finish_line_lat1: number | null
  finish_line_lng1: number | null
  finish_line_lat2: number | null
  finish_line_lng2: number | null
  finish_at_start: boolean | null
  created_at: string
}

export interface CourseTemplateLeg {
  id: string
  template_id: string
  sequence_index: number
  mark_id: string
  rounding_side: RoundingSide
}

export interface Race {
  id: string
  club_id: string
  name: string
  race_number: number | null
  series: string | null
  race_date: string
  notes: string | null
  safety_info: string | null
  vhf_channel: string | null
  status: RaceStatus
  entry_token: string
  course_template_id: string | null
  created_at: string
  // Live racing columns
  race_controller_id: string | null
  race_started_at: string | null
  race_finished_at: string | null
}

export interface StartClass {
  id: string
  race_id: string
  name: string
  class_flag: string | null
  prep_flag: PrepFlag
  start_time: string
  sequence_warning_mins: number
  general_recall: boolean
  recalled_at: string | null
}

export interface RaceEntry {
  id: string
  race_id: string
  boat_id: string | null
  class_id: string | null
  user_id: string | null
  phone_offset_from_bow_m: number | null
  status: EntryStatus
  helm_name: string | null
  phone: string | null
  role: 'helm' | 'crew'
  created_at: string
  // Live racing columns
  start_time: string | null
  finish_time: string | null
  elapsed_seconds: number | null
  laps_completed: number
  last_mark_index: number
  tracking_active: boolean
  handicap_system: string | null
  handicap_value: number | null
  corrected_seconds: number | null
}

export interface GpsTrack {
  id: string
  race_entry_id: string
  uploaded_at: string
}

export interface GpsTrackPoint {
  id: number
  track_id: string
  t: string
  lat: number
  lon: number
  speed_ms: number | null
  cog_deg: number | null
  accuracy_m: number | null
}

export interface RaceResult {
  id: string
  race_entry_id: string
  start_status: StartStatus | null
  start_time: string | null
  finish_time: string | null
  elapsed_seconds: number | null
  rank: number | null
  status: ResultStatus
  is_provisional: boolean
  protest: boolean
  detection_flags: Record<string, unknown> | null
  created_at: string
}

export interface LivePosition {
  id: number
  race_id: string
  entry_id: string
  user_id: string
  lat: number
  lon: number
  speed_kts: number | null
  heading_deg: number | null
  accuracy_m: number | null
  recorded_at: string
  synced_at: string
}

export interface RaceEnvironment {
  id: string
  race_id: string
  recorded_at: string
  wind_speed_kts: number | null
  wind_dir_deg: number | null
  tide_height_m: number | null
  tide_state: string | null
  current_speed_kts: number | null
  current_dir_deg: number | null
  hw_time: string | null
  lw_time: string | null
  source: string | null
}

// Joined types for common queries
export interface RaceWithEntries extends Race {
  entries: RaceEntry[]
  start_classes: StartClass[]
  course_template: CourseTemplate | null
}

export interface MarkWithLeg extends Mark {
  rounding_side?: RoundingSide // from course_template_legs when used in a course
}
