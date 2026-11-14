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
}

// Insert a practice session with idempotent synchronization
// Uses INSERT ... ON CONFLICT (session_id) DO NOTHING
export async function syncPracticeSession(
  session: PracticeSession
): Promise<{ success: boolean; alreadyExists: boolean; error?: string }> {
  try {
    const { data, error } = await supa
      .from('practice_sessions')
      .upsert({
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
      }, { onConflict: 'session_id', ignoreDuplicates: true })
      .select()
      .maybeSingle()

    if (error) {
      console.error('Error syncing practice session:', error)
      return { success: false, alreadyExists: false, error: error.message }
    }

    // If data exists, the session was newly inserted
    // If no data (but no error), it means ON CONFLICT DO NOTHING was triggered
    return { success: true, alreadyExists: !data }
  } catch (err) {
    console.error('Exception syncing practice session:', err)
    return { success: false, alreadyExists: false, error: 'Unexpected error' }
  }
}

// Check if user has enabled practice sharing
export async function hasPracticeSharingEnabled(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supa
      .from('team_members')
      .select('practice_sharing_enabled')
      .eq('user_id', userId)
      .single()

    if (error) {
      console.error('Error checking practice sharing:', error)
      return false
    }

    return data?.practice_sharing_enabled === true
  } catch (err) {
    console.error('Exception checking practice sharing:', err)
    return false
  }
}
