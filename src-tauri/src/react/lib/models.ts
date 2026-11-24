export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type SongRecord = {
  id: string
  team_id: string
  title: string
  artist: string | null
  key_signature: string | null
  tempo_bpm: number | null
  time_signature: string | null
  chordpro_lyrics: string
  song_notes: string | null
  revision: number
  is_active: boolean
  created_at: string
  updated_at: string
  tag_links?: Array<{ tag?: { id: string; tag_name: string } | Array<{ id: string; tag_name: string }> }>
  tags?: Array<{ id?: string; tag_name: string }>
  arrangements?: Array<{
    id: string
    arrangement_name: string
    key: string | null
    capo_position: number
    tempo_override: number | null
    performance_notes: string | null
  }>
}

export type PracticeSessionRecord = {
  session_id: string
  team_id: string
  user_id: string
  song_id: string
  arrangement_id: string | null
  started_at: string
  ended_at: string | null
  actual_practice_duration_seconds: number
  playback_speed: number
  loop_start_ms: number | null
  loop_end_ms: number | null
  loop_repetitions: number
  sync_state?: 'pending' | 'synced' | 'private' | 'error'
}

export type AnnouncementRecord = {
  id: string
  team_id: string
  author_id: string | null
  post_type: string
  message_body: string
  created_at: string
  author?: { display_name: string | null } | null
}

export type PersonalPracticeRecord = {
  session_id: string
  started_at: string
  actual_practice_duration_seconds: number
  sync_state?: 'pending' | 'synced' | 'private' | 'error'
}

export type MemberPracticeSummary = {
  userId: string
  displayName: string
  role: string
  totalSeconds: number
  sessionCount: number
}

export type SongPracticeSummary = {
  songId: string
  title: string
  totalSeconds: number
  sessionCount: number
}
