// Auto-maintained TypeScript types matching the Supabase schema
// Run `supabase gen types typescript` to regenerate from a live project

export type Role = 'admin' | 'race_officer' | 'ood' | 'competitor'
export type MarkType = 'virtual' | 'physical'
export type MarkSource = 'catalogue' | 'race'
export type RoundingSide = 'port' | 'starboard'
export type RaceStatus = 'draft' | 'planned' | 'confirmed' | 'cancelled' | 'completed' | 'archived'
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
  created_at: string
}

export interface Boat {
  id: string
  club_id: string
  owner_name: string
  boat_name: string
  length_m: number | null
  sail_number: string | null
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
}

export interface StartClass {
  id: string
  race_id: string
  name: string
  class_flag: string | null
  prep_flag: PrepFlag
  start_time: string
  sequence_warning_mins: number
}

export interface RaceEntry {
  id: string
  race_id: string
  boat_id: string
  class_id: string
  phone_offset_from_bow_m: number
  status: EntryStatus
  created_at: string
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

// Joined types for common queries
export interface RaceWithEntries extends Race {
  entries: RaceEntry[]
  start_classes: StartClass[]
  course_template: CourseTemplate | null
}

export interface MarkWithLeg extends Mark {
  rounding_side?: RoundingSide // from course_template_legs when used in a course
}
