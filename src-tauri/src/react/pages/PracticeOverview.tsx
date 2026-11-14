import { useEffect, useState } from 'react'
import { supa } from '../lib/supabase'
import { useAuth } from '../hooks/use-auth'
import '../App.css'

export default function PracticeOverview() {
  const {
    user,
    teamId,
    accessRole,
  } = useAuth()

  // Check if user is authorized (Worship Leader or Worship Team Director)
  const isAuthorized = accessRole === 'worship_leader' || accessRole === 'worship_team_director'

  const [teamPracticeTotal, setTeamPracticeTotal] = useState(0)
  const [memberPracticeSummaries, setMemberPracticeSummaries] = useState<any[]>([])
  const [songPracticeSummaries, setSongPracticeSummaries] = useState<any[]>([])
  const [recentSessions, setRecentSessions] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [songs, setSongs] = useState<any[]>([])
  const [selectedMember, setSelectedMember] = useState<string | null>(null)
  const [selectedSong, setSelectedSong] = useState<string | null>(null)
  const [selectedWeek, setSelectedWeek] = useState<Date | null>(null)
  const [loadingState, setLoadingState] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      if (!user?.id || !teamId || !isAuthorized) return

      setLoadingState(true)
      try {
        // Get team members
        const { data: membersData, error: membersError } = await supa
          .from('team_members')
          .select('user_id, access_role, practice_sharing_enabled')
          .eq('team_id', teamId)

        if (membersError) throw membersError
        const teamMembers = membersData || []
        const memberIds = teamMembers.map((member) => member.user_id)
        const { data: profilesData, error: profilesError } = memberIds.length
          ? await supa.from('profiles').select('id, display_name').in('id', memberIds)
          : { data: [], error: null }

        if (profilesError) throw profilesError
        const membersWithProfiles = teamMembers.map((member) => ({
          ...member,
          display_name: profilesData?.find((profile) => profile.id === member.user_id)?.display_name,
        }))
        setMembers(membersWithProfiles)

        // Get songs
        const { data: songsData, error: songsError } = await supa
          .from('songs')
          .select('*')
          .eq('team_id', teamId)
          .eq('is_active', true)

        if (songsError) throw songsError
        setSongs(songsData || [])

        // Get practice sessions (only consenting members)
        const consentingUserIds = teamMembers
          .filter((member) => member.practice_sharing_enabled)
          .map((member) => member.user_id)
        let sessionsData: any[] = []
        if (consentingUserIds.length > 0) {
          let query = supa
            .from('practice_sessions')
            .select('*')
            .eq('team_id', teamId)
            .in('user_id', consentingUserIds)

          if (selectedMember) query = query.eq('user_id', selectedMember)
          if (selectedSong) query = query.eq('song_id', selectedSong)

          const { data, error: sessionsError } = await query
            .order('started_at', { ascending: false })
            .limit(50)

          if (sessionsError) throw sessionsError
          sessionsData = data || []
        }
        setRecentSessions(sessionsData)

        // Calculate team practice total (only consenting members)
        const consentingSessions = sessionsData || []
        const totalSeconds = consentingSessions.reduce(
          (sum, session) => sum + (session.actual_practice_duration_seconds || 0),
          0
        )
        setTeamPracticeTotal(totalSeconds)

        // Calculate per-member summaries (only consenting members)
        const memberMap = new Map<string, { totalSeconds: number; sessionCount: number }>()
        
        consentingSessions.forEach(session => {
          const userId = session.user_id
          const existing = memberMap.get(userId)
          if (existing) {
            memberMap.set(userId, {
              totalSeconds: existing.totalSeconds + (session.actual_practice_duration_seconds || 0),
              sessionCount: existing.sessionCount + 1
            })
          } else {
            memberMap.set(userId, {
              totalSeconds: session.actual_practice_duration_seconds || 0,
              sessionCount: 1
            })
          }
        })

        const memberSummaries = Array.from(memberMap.entries()).map(([userId, data]) => {
          const member = membersWithProfiles.find(m => m.user_id === userId)
          return {
            userId,
            displayName: member?.display_name || 'Unknown',
            role: member?.access_role,
            totalSeconds: data.totalSeconds,
            sessionCount: data.sessionCount
          }
        }).sort((a, b) => b.totalSeconds - a.totalSeconds)

        setMemberPracticeSummaries(memberSummaries)

        // Calculate per-song summaries
        const songMap = new Map<string, { totalSeconds: number; sessionCount: number }>()

        consentingSessions.forEach(session => {
          const songId = session.song_id
          const existing = songMap.get(songId)
          if (existing) {
            songMap.set(songId, {
              totalSeconds: existing.totalSeconds + (session.actual_practice_duration_seconds || 0),
              sessionCount: existing.sessionCount + 1
            })
          } else {
            songMap.set(songId, {
              totalSeconds: session.actual_practice_duration_seconds || 0,
              sessionCount: 1
            })
          }
        })

        const songSummaries = Array.from(songMap.entries())
          .map(([songId, data]) => {
            const song = songsData?.find(s => s.id === songId)
            return {
              songId,
              title: song?.title || 'Unknown',
              totalSeconds: data.totalSeconds,
              sessionCount: data.sessionCount
            }
          })
          .sort((a, b) => b.totalSeconds - a.totalSeconds)

        setSongPracticeSummaries(songSummaries)

        // Get recent sessions for display
        setRecentSessions(consentingSessions.slice(0, 10))

        setLoadingState(false)
      } catch (err) {
        console.error('Error loading practice overview:', err)
        setError('Failed to load practice overview')
        setLoadingState(false)
      }
    }

    loadData()
  }, [user?.id, teamId, selectedMember, selectedSong, isAuthorized])

  if (!isAuthorized && user?.id) {
    return <div className="alert alert-error">Access denied. This view is for Worship Leaders and Worship Team Directors only.</div>
  }

  if (loadingState) {
    return <div>Loading practice overview...</div>
  }

  if (error) {
    return <div style={{ color: 'red' }}>Error: {error}</div>
  }

  // Determine the selected week (default to current week)
  const weekStart = selectedWeek ? new Date(selectedWeek) : new Date()
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  return (
    <div className="page-container">
      <h2>Practice Overview</h2>
      
      {isAuthorized ? (
        <>
          {/* Team selector */}
          {members.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <strong>Team:</strong> {teamId || 'Unknown team'}
              <br />
              <small>Members with practice sharing enabled: {memberPracticeSummaries.filter(m => m.totalSeconds > 0).length}</small>
            </div>
          )}

          {/* Week selector */}
          <div style={{ marginBottom: '1rem' }}>
            <strong>Select Week:</strong> 
            <input 
              type="date" 
              value={selectedWeek?.toISOString().split('T')[0] || ''}
              onChange={(e) => setSelectedWeek(new Date(e.target.value))}
            />
          </div>
        </>
      ) : null}

      {/* Team Practice Total */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3>Team Practice Total</h3>
        <p>{(teamPracticeTotal / 3600).toFixed(1)} hours ({teamPracticeTotal} seconds)</p>
      </div>

      {/* Member Practice Summaries */}
      {isAuthorized && memberPracticeSummaries.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3>Practice by Member</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: '8px', border: '1px solid #ddd' }}>Member</th>
                <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}></th>
                <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>Total Time</th>
                <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {memberPracticeSummaries.slice(0, 10).map((member, index) => (
                <tr key={member.userId} style={{ 
                  background: index % 2 === 0 ? '#f8f9fa' : 'white',
                  borderBottom: '1px solid #ddd'
                }}>
                  <td style={{ padding: '8px' }}>{member.displayName}</td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>
                    {member.sessionCount} sessions
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>
                    {(member.totalSeconds / 60).toFixed(1)} min
                  </td>
                  <td style={{ padding: '8px' }}>
                    {member.role || ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Song Practice Summaries */}
      {isAuthorized && songPracticeSummaries.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3>Practice by Song</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: '8px', border: '1px solid #ddd' }}>Song</th>
                <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}></th>
                <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>Total Time</th>
                <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {songPracticeSummaries.slice(0, 10).map((song, index) => (
                <tr key={song.songId} style={{ 
                  background: index % 2 === 0 ? '#f8f9fa' : 'white',
                  borderBottom: '1px solid #ddd'
                }}>
                  <td style={{ padding: '8px' }}>{song.title}</td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>
                    {song.sessionCount} sessions
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>
                    {(song.totalSeconds / 60).toFixed(1)} min
                  </td>
                  <td style={{ padding: '8px' }}>{song.totalSeconds > 0 ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent Shared Practice Sessions */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3>Recent Shared Practice Sessions</h3>
        {recentSessions.length === 0 ? (
          <p>No practice sessions found.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: '8px', border: '1px solid #ddd' }}>Member</th>
                <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>Song</th>
                <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}></th>
                <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>Duration</th>
                <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentSessions.slice(0, 10).map((session, index) => {
                const member = members.find(m => m.user_id === session.user_id)
                const song = songs.find(s => s.id === session.song_id)
                const durationMinutes = (session.actual_practice_duration_seconds / 60).toFixed(1)
                return (
                  <tr key={index} style={{ borderBottom: '1px solid #ddd' }}>
                    <td style={{ padding: '8px' }}>
                      {member?.display_name || 'Unknown'}
                    </td>
                    <td style={{ padding: '8px' }}>
                      {song?.title || 'Unknown'}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      {session.actual_practice_duration_seconds > 0 ? 'Yes' : 'No'}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      {durationMinutes} min
                    </td>
                    <td style={{ padding: '8px' }}>
                      {new Date(session.started_at).toLocaleDateString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
