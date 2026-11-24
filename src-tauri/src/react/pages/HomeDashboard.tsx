import { useEffect, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { Link } from 'react-router-dom'
import { supa } from '../lib/supabase'
import { useAuth } from '../hooks/use-auth'
import '../App.css'
import { getUpcomingServiceDate } from '../lib/workflow'
import type { AnnouncementRecord, PersonalPracticeRecord, SongRecord } from '../lib/models'
import EmptyState from '../components/EmptyState'
import LoadingSkeleton from '../components/LoadingSkeleton'
import StatusMessage from '../components/StatusMessage'


export default function HomeDashboard() {
  const { user, teamId } = useAuth()
  type UpcomingLineupItem = {
    id: string
    position: number
    song_id: string
    key_override: string | null
    tempo_override: number | null
    song: { id: string; title: string; key_signature: string | null; tempo_bpm: number | null } | Array<{ id: string; title: string; key_signature: string | null; tempo_bpm: number | null }> | null
    selected_arrangement: { id: string; arrangement_name: string } | Array<{ id: string; arrangement_name: string }> | null
  }
  const [upcomingService, setUpcomingService] = useState<{ lineupId: string | null; serviceDate: string; serviceTitle: string; songs: UpcomingLineupItem[] } | null>(null)
  const [serviceAssignments, setServiceAssignments] = useState<Array<{ role_name: string; preparation_status: string; display_name: string }>>([])
  const [recentSongs, setRecentSongs] = useState<SongRecord[]>([])
  const [recentAnnouncements, setRecentAnnouncements] = useState<AnnouncementRecord[]>([])
  const [personalPractice, setPersonalPractice] = useState<PersonalPracticeRecord[]>([])
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending' | 'private' | 'offline' | 'error'>('synced')
  const [syncCheckedAt, setSyncCheckedAt] = useState<string>(new Date().toISOString())
  const [dashboardError, setDashboardError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    const activeTeamId = teamId
    if (!activeTeamId) {
      setLoading(false)
      return
    }

    const userId = user.id

    async function loadDashboardData(activeTeamId: string) {
      setLoading(true)
      setDashboardError(null)

      try {
        const { data: settings, error: settingsError } = await supa
          .from('team_settings')
          .select('iana_timezone, service_day_of_week, service_cutoff_time')
          .eq('team_id', activeTeamId)
          .maybeSingle()
        if (settingsError) throw settingsError

        const timezone = settings?.iana_timezone ?? 'Asia/Manila'
        const serviceDay = settings?.service_day_of_week ?? 7
        const cutoffTime = settings?.service_cutoff_time ?? '09:00:00'
        const serviceDate = getUpcomingServiceDate(new Date(), timezone, serviceDay, cutoffTime)
        const formattedDate = new Intl.DateTimeFormat('en-US', {
          timeZone: 'UTC',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }).format(new Date(`${serviceDate}T00:00:00Z`))

        const { data: publishedLineup, error: lineupError } = await supa
          .from('lineups')
          .select(`
            id,
            service_title,
            lineup_items(
              id,
              position,
              song_id,
              key_override,
              tempo_override,
              transition_notes,
              song:songs(id, title, key_signature, tempo_bpm),
              selected_arrangement:song_arrangements(id, arrangement_name)
            )
          `)
          .eq('team_id', activeTeamId)
          .eq('service_date', serviceDate)
          .eq('status', 'published')
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (lineupError) throw lineupError

        const lineupSongs = [...(publishedLineup?.lineup_items ?? [])].sort(
          (left, right) => left.position - right.position,
        )
        setUpcomingService({
          lineupId: publishedLineup?.id ?? null,
          serviceDate: formattedDate,
          serviceTitle: publishedLineup?.service_title ?? `Service - ${formattedDate}`,
          songs: lineupSongs,
        })

        if (publishedLineup?.id) {
          const { data: assignmentRows } = await supa
            .from('lineup_assignments')
            .select('user_id, role_name, preparation_status')
            .eq('team_id', activeTeamId)
            .eq('lineup_id', publishedLineup.id)
          const userIds = [...new Set((assignmentRows ?? []).map((assignment) => assignment.user_id))]
          const { data: assignmentProfiles } = userIds.length
            ? await supa.from('profiles').select('id, display_name').in('id', userIds)
            : { data: [] as Array<{ id: string; display_name: string | null }> }
          setServiceAssignments((assignmentRows ?? []).map((assignment) => ({
            role_name: assignment.role_name,
            preparation_status: assignment.preparation_status,
            display_name: assignmentProfiles?.find((profile) => profile.id === assignment.user_id)?.display_name ?? 'Team member',
          })))
        } else {
          setServiceAssignments([])
        }

        // Fetch recent songs
        const { data: songs, error: songsError } = await supa
          .from('songs')
          .select('*')
          .eq('team_id', activeTeamId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(5)

        if (!songsError && songs) {
          setRecentSongs(songs)
        }

        // Fetch recent announcements
        const { data: posts, error: postsError } = await supa
          .from('team_posts')
          .select('*, author:profiles!team_posts_author_id_fkey (display_name)')
          .eq('team_id', activeTeamId)
          .order('created_at', { ascending: false })
          .limit(5)

        if (!postsError && posts) {
          setRecentAnnouncements(posts)
        }

        // Fetch personal practice history
        const { data: practice, error: practiceError } = await supa
          .from('practice_sessions')
          .select('*')
          .eq('user_id', userId)
          .order('started_at', { ascending: false })
          .limit(5)

        if (practiceError) {
          console.error('Error loading shared practice history:', practiceError)
        }
        let localPractice: Array<{
          session_id: string
          started_at: string
          actual_practice_duration_seconds: number
          sync_state?: 'pending' | 'synced' | 'private' | 'error'
        }> = []
        if (isTauri()) {
          try {
            localPractice = await invoke('get_local_practice_history', {
              userId,
              teamId: activeTeamId,
            })
          } catch (localError) {
            console.error('Error loading local practice history:', localError)
            setSyncStatus('error')
          }
        }

        const sessionsById = new Map<string, PersonalPracticeRecord>(
          (practice ?? []).map((session) => [session.session_id, { ...session, sync_state: 'synced' }])
        )
        for (const session of localPractice) {
          sessionsById.set(session.session_id, session)
        }
        setPersonalPractice(
          [...sessionsById.values()]
            .sort((left, right) => Date.parse(right.started_at) - Date.parse(left.started_at))
            .slice(0, 5)
        )
        setSyncCheckedAt(new Date().toISOString())
        if (!navigator.onLine) {
          setSyncStatus('offline')
        } else if (practiceError) {
          setSyncStatus('error')
        } else {
          const hasPending = localPractice.some((session) =>
            ['pending', 'error'].includes(session.sync_state ?? '')
          )
          const hasPrivate = localPractice.some((session) => session.sync_state === 'private')
          setSyncStatus(hasPending ? 'pending' : hasPrivate ? 'private' : 'synced')
        }

      } catch (err) {
        console.error('Error loading dashboard:', err)
        setSyncStatus('error')
        setDashboardError('Some dashboard data could not be loaded. Verify your team settings and database permissions.')
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData(activeTeamId)
  }, [user?.id, teamId])

  if (loading) {
    return <div className="page-container"><h2>Home Dashboard</h2><LoadingSkeleton rows={5} label="Loading dashboard" /></div>
  }

  return (
    <div className="page-container">
      <h2>Home Dashboard</h2>
      {dashboardError && <StatusMessage tone="error">{dashboardError}</StatusMessage>}

      <div className="dashboard-grid">
        {upcomingService && (
          <div className="card dashboard-card-featured">
            <div className="dashboard-service-heading">
              <div>
                <h3>Upcoming Service</h3>
                <p className="dashboard-service-date">{upcomingService.serviceDate}</p>
              </div>
              <div className="dashboard-actions">
                {upcomingService.lineupId && (
                  <Link className="btn-secondary" to={`/lineup?lineupId=${upcomingService.lineupId}`}>
                    Open lineup
                  </Link>
                )}
                {upcomingService.songs[0]?.song_id && (
                  <Link className="btn-primary" to={`/practice-board/${upcomingService.songs[0].song_id}`}>
                    Practice next song
                  </Link>
                )}
              </div>
            </div>
            <h4>{upcomingService.serviceTitle}</h4>
            {upcomingService.songs.length > 0 ? (
              <ol className="dashboard-service-songs">
                {upcomingService.songs.map((item) => {
                  const song = Array.isArray(item.song) ? item.song[0] : item.song
                  const arrangement = Array.isArray(item.selected_arrangement)
                    ? item.selected_arrangement[0]
                    : item.selected_arrangement
                  return (
                    <li key={item.id}>
                      <Link to={`/song/${item.song_id}`}>
                        <strong>{song?.title ?? 'Unknown song'}</strong>
                      </Link>
                      <span>
                        {item.key_override ?? song?.key_signature ?? '—'}
                        {' · '}
                        {item.tempo_override ?? song?.tempo_bpm ?? '—'}{song?.tempo_bpm ? ' BPM' : ''}
                        {arrangement?.arrangement_name ? ` · ${arrangement.arrangement_name}` : ''}
                      </span>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <EmptyState title="No songs in this lineup yet">
                Open the lineup to review service preparation.
              </EmptyState>
            )}
            {serviceAssignments.length > 0 && (
              <div className="dashboard-service-assignments">
                <h4>Team assignments</h4>
                <ul>
                  {serviceAssignments.map((assignment, index) => (
                    <li key={`${assignment.display_name}-${assignment.role_name}-${index}`}>
                      <strong>{assignment.display_name}</strong>
                      {' · '}{assignment.role_name}
                      {' · '}<span>{assignment.preparation_status.replace('_', ' ')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {recentSongs.length > 0 && (
          <div className="card">
            <h3>Recently Added Songs</h3>
            <ul>
              {recentSongs.map((song) => (
                <li key={song.id}>
                  <strong>{song.title}</strong> {song.artist || ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {recentAnnouncements.length > 0 && (
          <div className="card">
            <h3>Recent Announcements</h3>
            <ul>
              {recentAnnouncements.map((post) => (
                <li key={post.id}>
                  <strong>{post.author?.display_name || 'Unknown'}:</strong> {post.message_body}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="card">
          <h3>Your Practice Summary</h3>
          <p>{personalPractice.length} practice sessions recorded</p>
          <ul>
            {personalPractice.map((session) => (
              <li key={session.session_id}>
                {new Date(session.started_at).toLocaleDateString()} - {session.actual_practice_duration_seconds}s
                {' · '}{session.sync_state === 'private' ? 'Private' : session.sync_state === 'pending' || session.sync_state === 'error' ? 'Pending' : 'Synced'}
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3>Synchronization Status</h3>
          <p>Status: {syncStatus}</p>
          <p>Last checked: {new Date(syncCheckedAt).toLocaleString()}</p>
          <small>
            Practice records are synchronized when online and consent is enabled.
          </small>
        </div>
      </div>
    </div>
  )
}