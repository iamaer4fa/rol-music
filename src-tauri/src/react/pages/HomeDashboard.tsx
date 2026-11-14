import { useEffect, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { supa } from '../lib/supabase'
import { useAuth } from '../hooks/use-auth'
import '../App.css'

const weekdayNumbers: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
}

function getUpcomingServiceDate(
  now: Date,
  timeZone: string,
  serviceDay: number,
  cutoffTime: string,
): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value
  const year = Number(part('year'))
  const month = Number(part('month'))
  const day = Number(part('day'))
  const hour = Number(part('hour'))
  const minute = Number(part('minute'))
  const currentDay = weekdayNumbers[part('weekday') ?? '']
  if (!year || !month || !day || !currentDay) {
    throw new Error('Could not determine the current date in the team timezone.')
  }

  const cutoffParts = cutoffTime.split(':').map(Number)
  const cutoffHour = cutoffParts[0] ?? Number.NaN
  const cutoffMinute = cutoffParts[1] ?? Number.NaN
  if (
    !Number.isInteger(serviceDay) ||
    serviceDay < 1 ||
    serviceDay > 7 ||
    !Number.isInteger(cutoffHour) ||
    cutoffHour < 0 ||
    cutoffHour > 23 ||
    !Number.isInteger(cutoffMinute) ||
    cutoffMinute < 0 ||
    cutoffMinute > 59
  ) {
    throw new Error('Team service settings contain an invalid day or cutoff time.')
  }
  const minutesUntilCutoff = cutoffHour * 60 + cutoffMinute
  const currentMinuteOfDay = hour * 60 + minute
  let daysAhead = (serviceDay - currentDay + 7) % 7
  if (daysAhead === 0 && currentMinuteOfDay >= minutesUntilCutoff) daysAhead = 7

  const serviceDate = new Date(Date.UTC(year, month - 1, day + daysAhead))
  return [
    serviceDate.getUTCFullYear(),
    String(serviceDate.getUTCMonth() + 1).padStart(2, '0'),
    String(serviceDate.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

export default function HomeDashboard() {
  const { user, teamId } = useAuth()
  const [upcomingService, setUpcomingService] = useState<{ serviceDate: string; serviceTitle: string; songs: any[] } | null>(null)
  const [recentSongs, setRecentSongs] = useState<any[]>([])
  const [recentAnnouncements, setRecentAnnouncements] = useState<any[]>([])
  const [personalPractice, setPersonalPractice] = useState<any[]>([])
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending' | 'private' | 'offline' | 'error'>('synced')
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
          .select('service_title, lineup_items(id)')
          .eq('team_id', activeTeamId)
          .eq('service_date', serviceDate)
          .eq('status', 'published')
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (lineupError) throw lineupError

        setUpcomingService({
          serviceDate: formattedDate,
          serviceTitle: publishedLineup?.service_title ?? `Service - ${formattedDate}`,
          songs: publishedLineup?.lineup_items ?? [],
        })

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
          sync_state?: string
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

        const sessionsById = new Map<string, any>(
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
    return <div>Loading dashboard...</div>
  }

  return (
    <div className="page-container">
      <h2>Home Dashboard</h2>
      {dashboardError && <p className="error-message" role="alert">{dashboardError}</p>}

      <div className="dashboard-grid">
        {upcomingService && (
          <div className="card dashboard-card-featured">
            <h3>Upcoming Service</h3>
            <p>{upcomingService.serviceTitle}</p>
            <p>Songs: {upcomingService.songs.length > 0 ? `${upcomingService.songs.length} scheduled` : 'No songs assigned yet'}</p>
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
          <p>Last checked: just now</p>
          <small>
            Practice records are synchronized when online and consent is enabled.
          </small>
        </div>
      </div>
    </div>
  )
}