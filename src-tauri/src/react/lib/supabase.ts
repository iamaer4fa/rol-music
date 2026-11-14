import { createClient } from '@supabase/supabase-js'

// Check if we're in the browser
const isBrowser = typeof window !== 'undefined'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured in .env')
}

export const supa = createClient(supabaseUrl, supabaseKey)

// Types for auth
export type SupabaseUser = {
  id: string
  email: string | null
  app_metadata: any
  user_metadata: any
  aud: string
  role: string | null
}

// Session management
export type Session = {
  access_token: string
  refresh_token: string
  expires_at: number
  user: SupabaseUser
}

// Initialize session from localStorage
export function initializeSupabase() {
  if (!isBrowser) return supa

  // Try to get session from storage
  const storedSession = localStorage.getItem('supabase_session')
  if (storedSession) {
    // We could restore session here, but for simplicity
    // the client will handle token refresh
  }

  return supa
}

// Practice session types
export type PracticeSession = {
  session_id: string
  team_id: string
  user_id: string
  song_id: string
  arrangement_id: string | null
  lineup_item_id: string | null
  device_id: string
  started_at: string
  ended_at: string | null
  actual_practice_duration_seconds: number
  playback_speed: number
  loop_start_ms: number | null
  loop_end_ms: number | null
  loop_repetitions: number
  schema_version: string
  sync_state?: 'pending' | 'synced' | 'private' | 'error'
  sync_error?: string | null
}

export type PracticeSyncResult = {
  success: boolean
  alreadyExists: boolean
  error?: string
}

export async function syncPracticeSession(
  session: PracticeSession
): Promise<PracticeSyncResult> {
  const payload = {
    session_id: session.session_id,
    team_id: session.team_id,
    user_id: session.user_id,
    song_id: session.song_id,
    arrangement_id: session.arrangement_id,
    lineup_item_id: session.lineup_item_id,
    device_id: session.device_id,
    started_at: session.started_at,
    ended_at: session.ended_at,
    actual_practice_duration_seconds: session.actual_practice_duration_seconds,
    playback_speed: session.playback_speed,
    loop_start_ms: session.loop_start_ms,
    loop_end_ms: session.loop_end_ms,
    loop_repetitions: session.loop_repetitions,
    schema_version: session.schema_version,
  }
  const { error: insertError } = await supa.from('practice_sessions').insert(payload)
  if (!insertError) return { success: true, alreadyExists: false }
  if (insertError.code !== '23505') {
    return { success: false, alreadyExists: false, error: insertError.message }
  }

  const { data: existing, error: readError } = await supa
    .from('practice_sessions')
    .select(
      'session_id, team_id, user_id, song_id, arrangement_id, lineup_item_id, device_id, started_at, ended_at, actual_practice_duration_seconds, playback_speed, loop_start_ms, loop_end_ms, loop_repetitions, schema_version'
    )
    .eq('session_id', session.session_id)
    .maybeSingle()

  if (readError) return { success: false, alreadyExists: true, error: readError.message }
  if (!existing) {
    return {
      success: false,
      alreadyExists: true,
      error: 'The existing session could not be verified for this account.',
    }
  }

  const matches =
    existing.session_id === payload.session_id &&
    existing.team_id === payload.team_id &&
    existing.user_id === payload.user_id &&
    existing.song_id === payload.song_id &&
    existing.arrangement_id === payload.arrangement_id &&
    existing.lineup_item_id === payload.lineup_item_id &&
    existing.device_id === payload.device_id &&
    Date.parse(existing.started_at) === Date.parse(payload.started_at) &&
    (existing.ended_at === payload.ended_at ||
      (existing.ended_at !== null &&
        payload.ended_at !== null &&
        Date.parse(existing.ended_at) === Date.parse(payload.ended_at))) &&
    existing.actual_practice_duration_seconds === payload.actual_practice_duration_seconds &&
    Number(existing.playback_speed) === Number(payload.playback_speed) &&
    existing.loop_start_ms === payload.loop_start_ms &&
    existing.loop_end_ms === payload.loop_end_ms &&
    existing.loop_repetitions === payload.loop_repetitions &&
    existing.schema_version === payload.schema_version

  return matches
    ? { success: true, alreadyExists: true }
    : {
        success: false,
        alreadyExists: true,
        error: 'A different session already uses this ID. The local record was retained.',
      }
}
