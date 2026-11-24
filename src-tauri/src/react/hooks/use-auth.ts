import { useEffect, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  supa,
  syncPracticeSession as syncPracticeSessionToRemote,
  type PracticeSession,
  type PracticeSyncResult,
} from '../lib/supabase'

export type UserContextType = {
  user: import('@supabase/supabase-js').User | null
  session: import('@supabase/supabase-js').Session | null
  loading: boolean
  teamId: string | null
  accessRole: string | null
  musicalRoles: string[]
  practiceSharingEnabled: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  setPracticeSharingEnabled: (enabled: boolean) => Promise<void>
  syncPracticeSession: (session: PracticeSession) => Promise<PracticeSyncResult>
  getTeamMembership: () => Promise<{ teamId: string; role: string } | null>
}

export function useAuth(): UserContextType {
  const [user, setUser] = useState<import('@supabase/supabase-js').User | null>(null)
  const [session, setSession] = useState<import('@supabase/supabase-js').Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [practiceSharingEnabled, setPracticeSharingEnabledState] = useState(false)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [accessRole, setAccessRole] = useState<string | null>(null)
  const [musicalRoles, setMusicalRoles] = useState<string[]>([])

  const fetchTeamMembership = useCallback(async () => {
    if (!user?.id) return null

    try {
      const { data, error } = await supa
        .from('team_members')
        .select('access_role, musical_roles, team_id, practice_sharing_enabled')
        .eq('user_id', user.id)
        .single()

      if (error) {
        console.error('Error fetching team membership:', error)
        return null
      }

      if (data) {
        setTeamId(data.team_id)
        setAccessRole(data.access_role)
        setMusicalRoles(data.musical_roles || [])
        setPracticeSharingEnabledState(data.practice_sharing_enabled === true)
        localStorage.setItem('team_id', data.team_id)
        localStorage.setItem('access_role', data.access_role)
        localStorage.setItem('musical_roles', JSON.stringify(data.musical_roles || []))
        return { teamId: data.team_id, role: data.access_role }
      }
    } catch (err) {
      console.error('Exception fetching team membership:', err)
    }
    return null
  }, [user?.id])

  useEffect(() => {
    let active = true
    const {
      data: { subscription },
    } = supa.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
    })

    supa.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) {
        console.error('Error getting initial session:', error)
      } else {
        setSession(data.session)
        setUser(data.session?.user ?? null)
      }
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user?.id) {
      setTeamId(null)
      setAccessRole(null)
      setMusicalRoles([])
      setPracticeSharingEnabledState(false)
      return
    }
    void fetchTeamMembership()
  }, [user?.id, fetchTeamMembership])

  // Sign in with email and password
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supa.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      throw new Error(error.message || 'Sign in failed')
    }
  }, [])

  // Sign out
  const signOut = useCallback(async () => {
    const { error } = await supa.auth.signOut()

    if (error) {
      throw new Error(error.message || 'Sign out failed')
    }
    // Clear local team membership data
    localStorage.removeItem('team_id')
    localStorage.removeItem('access_role')
    localStorage.removeItem('musical_roles')
  }, [])

  // Toggle practice sharing
  const togglePracticeSharing = useCallback(async (enabled: boolean) => {
    if (!user?.id || !teamId) {
      throw new Error('An active team membership is required to change practice sharing.')
    }

    if (!enabled) {
      await invoke('make_pending_practice_private')
    }

    const { data: updatedMembership, error } = await supa
      .from('team_members')
      .update({ practice_sharing_enabled: enabled })
      .eq('user_id', user.id)
      .eq('team_id', teamId)
      .select('practice_sharing_enabled')
      .maybeSingle()

    if (error) {
      console.error('Error updating practice sharing:', error)
      throw new Error('Unable to update practice-sharing preference.')
    }
    if (updatedMembership?.practice_sharing_enabled !== enabled) {
      throw new Error('Practice-sharing preference was not updated.')
    }

    setPracticeSharingEnabledState(enabled)
  }, [user?.id, teamId])

  // Sync a practice session
  const syncPracticeSession = useCallback(async (session: PracticeSession) => {
    if (!user?.id || !teamId || !practiceSharingEnabled) {
      return {
        success: false,
        alreadyExists: false,
        error: 'Practice sharing is disabled or team membership is unavailable.',
      }
    }
    if (session.user_id !== user.id || session.team_id !== teamId) {
      return {
        success: false,
        alreadyExists: false,
        error: 'Practice record does not match the signed-in user and active team.',
      }
    }

    const result = await syncPracticeSessionToRemote(session)
    await invoke('update_practice_sync_state', {
      sessionId: session.session_id,
      syncState: result.success ? 'synced' : 'error',
      syncError: result.error ?? null,
    })
    return result
  }, [user?.id, teamId, practiceSharingEnabled])

  useEffect(() => {
    if (!user?.id || !teamId || !practiceSharingEnabled) return

    const userId = user.id
    const activeTeamId = teamId
    let active = true
    async function syncPendingSessions() {
      const sessions = await invoke<PracticeSession[]>('get_pending_practice_sessions')
      for (const session of sessions) {
        if (!active) return
        if (session.user_id !== userId || session.team_id !== activeTeamId) {
          await invoke('update_practice_sync_state', {
            sessionId: session.session_id,
            syncState: 'private',
            syncError: null,
          })
          continue
        }

        const result = await syncPracticeSessionToRemote(session)
        await invoke('update_practice_sync_state', {
          sessionId: session.session_id,
          syncState: result.success ? 'synced' : 'error',
          syncError: result.error ?? null,
        })
      }
    }

    const onOnline = () => {
      void syncPendingSessions().catch((error: unknown) => {
        console.error('Unable to synchronize local practice records:', error)
      })
    }
    if (navigator.onLine) onOnline()
    window.addEventListener('online', onOnline)
    const retryTimer = window.setInterval(() => {
      if (navigator.onLine) onOnline()
    }, 60_000)
    return () => {
      active = false
      window.removeEventListener('online', onOnline)
      window.clearInterval(retryTimer)
    }
  }, [user?.id, teamId, practiceSharingEnabled])

  return {
    user,
    session,
    loading,
    teamId,
    accessRole,
    musicalRoles,
    practiceSharingEnabled,
    signIn,
    signOut,
    setPracticeSharingEnabled: togglePracticeSharing,
    syncPracticeSession,
    getTeamMembership: fetchTeamMembership,
  }
}
