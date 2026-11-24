import { useEffect, useState } from 'react'
import { supa } from '../lib/supabase'
import { useAuth } from '../hooks/use-auth'
import '../App.css'
import type { PracticeSessionRecord, MemberPracticeSummary, SongPracticeSummary } from '../lib/models'
import { escapeCsv, getWeekdayName, getWeekEndDate, getWeekStartDate } from '../lib/reporting'
import EmptyState from '../components/EmptyState'
import LoadingSkeleton from '../components/LoadingSkeleton'
import StatusMessage from '../components/StatusMessage'

export default function PracticeOverview() {
  const {
    user,
    teamId,
    accessRole,
  } = useAuth()

  // Check if user is authorized (Worship Leader or Worship Team Director)
  const isAuthorized = accessRole === 'worship_leader' || accessRole === 'worship_team_director'

  const [teamPracticeTotal, setTeamPracticeTotal] = useState(0)
  const [memberPracticeSummaries, setMemberPracticeSummaries] = useState<MemberPracticeSummary[]>([])
  const [songPracticeSummaries, setSongPracticeSummaries] = useState<SongPracticeSummary[]>([])
  const [recentSessions, setRecentSessions] = useState<PracticeSessionRecord[]>([])
  const [members, setMembers] = useState<Array<{ user_id: string; access_role: string; practice_sharing_enabled: boolean; display_name?: string }>>([])
  const [songs, setSongs] = useState<Array<{ id: string; title: string }>>([])
  const [selectedMember, setSelectedMember] = useState<string | null>(null)
  const [selectedSong, setSelectedSong] = useState<string | null>(null)
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null)
  const [teamTimezone, setTeamTimezone] = useState('Asia/Manila')
  const [weekStartsOn, setWeekStartsOn] = useState(1)
  const [loadingState, setLoadingState] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!teamId) return
    void supa
      .from('team_settings')
      .select('iana_timezone, week_starts_on')
      .eq('team_id', teamId)
      .maybeSingle()
      .then(({ data }) => {
        const timezone = data?.iana_timezone ?? 'Asia/Manila'
        const startsOn = data?.week_starts_on ?? 1
        setTeamTimezone(timezone)
        setWeekStartsOn(startsOn)
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(new Date())
        const part = (type: string) => parts.find((item) => item.type === type)?.value
        const today = `${part('year')}-${part('month')}-${part('day')}`
        setSelectedWeek(getWeekStartDate(today, startsOn))
      })
  }, [teamId])

  useEffect(() => {
    async function loadData() {
      if (!user?.id || !teamId || !isAuthorized || !selectedWeek) return

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
        let sessionsData: PracticeSessionRecord[] = []
        if (consentingUserIds.length > 0) {
          let query = supa
            .from('practice_sessions')
            .select('*')
            .eq('team_id', teamId)
            .in('user_id', consentingUserIds)

          if (selectedMember) query = query.eq('user_id', selectedMember)
          if (selectedSong) query = query.eq('song_id', selectedSong)
          const weekStart = new Date(`${selectedWeek}T00:00:00`)
          const weekEnd = new Date(weekStart)
          weekEnd.setDate(weekEnd.getDate() + 7)
          query = query
            .gte('started_at', weekStart.toISOString())
            .lt('started_at', weekEnd.toISOString())

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
  }, [user?.id, teamId, selectedMember, selectedSong, selectedWeek, isAuthorized])

  if (!isAuthorized && user?.id) {
    return <div className="alert alert-error">Access denied. This view is for Worship Leaders and Worship Team Directors only.</div>
  }

  if (loadingState) {
    return <div className="page-container"><h2>Practice Overview</h2><LoadingSkeleton rows={5} label="Loading practice report" /></div>
  }

  if (error) {
    return <div className="page-container"><h2>Practice Overview</h2><StatusMessage tone="error">{error}</StatusMessage></div>
  }

  function exportCsv() {
    const memberLookup = new Map(members.map((member) => [member.user_id, member.display_name ?? 'Unknown']))
    const songLookup = new Map(songs.map((song) => [song.id, song.title]))
    const rows = [
      ['Member', 'Song', 'Started at', 'Duration seconds', 'Playback speed', 'Loop repetitions'],
      ...recentSessions.map((session) => [
        memberLookup.get(session.user_id) ?? 'Unknown',
        songLookup.get(session.song_id) ?? 'Unknown',
        session.started_at,
        session.actual_practice_duration_seconds,
        session.playback_speed,
        session.loop_repetitions,
      ]),
    ]
    const csv = rows.map((row) => row.map((value) => escapeCsv(value)).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `practice-report-${selectedWeek ?? 'report'}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page-container">
      <h2>Practice Overview</h2>
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      
      {isAuthorized ? (
        <>
          {members.length > 0 && (
            <section className="report-context">
              <strong>Reporting context</strong>
              <p>
                Week starts on {getWeekdayName(weekStartsOn)} · Team timezone {teamTimezone}
              </p>
              {selectedWeek && (
                <p>
                  Data range: {selectedWeek} to {getWeekEndDate(selectedWeek)}
                  {' · '}Consenting members: {members.filter((member) => member.practice_sharing_enabled).length}
                  {' · '}Shared sessions in range: {recentSessions.length}
                  {' · '}Returned sample size limit: 50
                </p>
              )}
              <small>
                Rehearsal reports summarize voluntarily shared practice duration and frequency.
                They are not proof of attendance, readiness, or musical performance.
              </small>
            </section>
          )}

          <div className="report-toolbar">
            <label>
              Select week
              <input
                type="date"
                value={selectedWeek ?? ''}
                onChange={(event) => setSelectedWeek(getWeekStartDate(event.target.value, weekStartsOn))}
              />
            </label>
            <button type="button" className="btn-primary" onClick={exportCsv} disabled={recentSessions.length === 0}>
              Export CSV
            </button>
          </div>
        </>
      ) : null}

      {isAuthorized && (
        <div className="card">
          <h3>Privacy and retention</h3>
          <p>
            These summaries include only members who opted in to sharing for the selected range.
            Turning sharing off retains previously uploaded server records but removes leadership
            visibility through database policies; private local history remains on the device.
          </p>
        </div>
      )}

      <div className="card">
        <h3>Team Practice Total</h3>
        <p className="practice-total">{(teamPracticeTotal / 3600).toFixed(1)} hours <span>({teamPracticeTotal} seconds)</span></p>
      </div>

      {isAuthorized && (
        <div className="card">
          <h3>Practice by Member</h3>
          {memberPracticeSummaries.length === 0 ? (
            <EmptyState title="No shared member practice in this date range">
              Only members who opted in to sharing are included in these summaries.
            </EmptyState>
          ) : (
            <div className="table-scroll" role="region" aria-label="Practice by member" tabIndex={0}>
              <table className="responsive-table practice-table">
                <thead>
                  <tr><th>Member</th><th>Frequency</th><th>Total Time</th><th>Role</th></tr>
                </thead>
                <tbody>
                  {memberPracticeSummaries.slice(0, 10).map((member) => (
                    <tr key={member.userId}>
                      <td data-label="Member">{member.displayName}</td>
                      <td data-label="Frequency">{member.sessionCount} sessions</td>
                      <td data-label="Total time">{(member.totalSeconds / 60).toFixed(1)} min</td>
                      <td data-label="Role">{member.role || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {isAuthorized && (
        <div className="card">
          <h3>Practice by Song</h3>
          {songPracticeSummaries.length === 0 ? (
            <EmptyState title="No song activity for this date range">
              Shared practice totals will appear after members opt in and practice.
            </EmptyState>
          ) : (
            <div className="table-scroll" role="region" aria-label="Practice by song" tabIndex={0}>
              <table className="responsive-table practice-table">
                <thead>
                  <tr><th>Song</th><th>Frequency</th><th>Total Time</th></tr>
                </thead>
                <tbody>
                  {songPracticeSummaries.slice(0, 10).map((song) => (
                    <tr key={song.songId}>
                      <td data-label="Song">{song.title}</td>
                      <td data-label="Frequency">{song.sessionCount} sessions</td>
                      <td data-label="Total time">{(song.totalSeconds / 60).toFixed(1)} min</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3>Recent Shared Practice Sessions</h3>
        {recentSessions.length === 0 ? (
          <EmptyState title="No shared practice sessions for this date range">
            Try a different week or review the team’s sharing preferences.
          </EmptyState>
        ) : (
          <div className="table-scroll" role="region" aria-label="Recent shared practice sessions" tabIndex={0}>
            <table className="responsive-table practice-table">
              <thead>
                <tr><th>Member</th><th>Song</th><th>Duration</th><th>Date</th></tr>
              </thead>
              <tbody>
                {recentSessions.slice(0, 10).map((session) => {
                  const member = members.find((candidate) => candidate.user_id === session.user_id)
                  const song = songs.find((candidate) => candidate.id === session.song_id)
                  return (
                    <tr key={session.session_id}>
                      <td data-label="Member">{member?.display_name || 'Unknown'}</td>
                      <td data-label="Song">{song?.title || 'Unknown'}</td>
                      <td data-label="Duration">{(session.actual_practice_duration_seconds / 60).toFixed(1)} min</td>
                      <td data-label="Date">{new Date(session.started_at).toLocaleDateString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
