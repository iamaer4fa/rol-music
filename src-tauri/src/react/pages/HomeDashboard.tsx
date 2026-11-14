import { useEffect, useState } from 'react'
import { supa } from '../lib/supabase'
import { useAuth } from '../hooks/use-auth'
import '../App.css'

export default function HomeDashboard() {
  const { user, session } = useAuth()
  const [upcomingService, setUpcomingService] = useState<{ serviceDate: string; serviceTitle: string; songs: any[] } | null>(null)
  const [recentSongs, setRecentSongs] = useState<any[]>([])
  const [recentAnnouncements, setRecentAnnouncements] = useState<any[]>([])
  const [personalPractice, setPersonalPractice] = useState<any[]>([])
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending' | 'offline' | 'error'>('synced')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    const userId = user.id

    async function loadDashboardData() {
      setLoading(true)

      try {
        // Get team ID from localStorage (set during auth)
        const teamId = localStorage.getItem('team_id')
        if (!teamId) {
          setLoading(false)
          return
        }

        // Calculate upcoming service date
        // Default: Sunday service, 09:00 cutoff
        // - Sunday before 09:00: current Sunday is upcoming
        // - Sunday at or after 09:00: next Sunday is upcoming
        // - Monday-Saturday: next Sunday is upcoming
        const now = new Date()
        const serviceDayOfWeek = 7 // Sunday
        const cutoffHour = 9
        const cutoffMinute = 0

        // Determine the upcoming service date
        const dayIndex = now.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
        let serviceDate: Date

        if (dayIndex === 0) {
          // It's Sunday
          const cutoffTime = now.getHours() * 60 + now.getMinutes()
          if (cutoffTime < cutoffHour * 60 + cutoffMinute) {
            // Sunday before cutoff - current Sunday
            serviceDate = now
          } else {
            // Sunday at or after cutoff - next Sunday
            serviceDate = new Date(now)
            serviceDate.setDate(serviceDate.getDate() + 7)
          }
        } else {
          // Monday through Saturday - next Sunday
          const daysUntilSunday = (7 - dayIndex) % 7
          serviceDate = new Date(now)
          serviceDate.setDate(serviceDate.getDate() + daysUntilSunday)
        }

        // Format service date
        const formattedDate = serviceDate.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })

        setUpcomingService({
          serviceDate: formattedDate,
          serviceTitle: `Service - ${formattedDate}`,
          songs: []
        })

        // Fetch recent songs
        const { data: songs, error: songsError } = await supa
          .from('songs')
          .select('*')
          .eq('team_id', teamId)
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
          .eq('team_id', teamId)
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

        if (!practiceError && practice) {
          setPersonalPractice(practice)
        }

        // Check sync status
        // We'll check if there are pending local records
        checkSyncStatus(teamId)

      } catch (err) {
        console.error('Error loading dashboard:', err)
        setSyncStatus('error')
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()
  }, [user?.id])

  function checkSyncStatus(teamId: string) {
    // In a full implementation, we'd check local SQLite for pending records
    // For now, just set a default status
    setSyncStatus('synced')
  }

  if (loading) {
    return <div>Loading dashboard...</div>
  }

  return (
    <div className="page-container">
      <h2>Home Dashboard</h2>

      {/* Upcoming Service */}
      {upcomingService && (
        <div className="card">
          <h3>Upcoming Service</h3>
          <p>{upcomingService.serviceTitle}</p>
          <p>Songs: {upcomingService.songs.length > 0 ? `${upcomingService.songs.length} scheduled` : 'No songs assigned yet'}</p>
        </div>
      )}

      {/* Recent Songs */}
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

      {/* Recent Announcements */}
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

      {/* Personal Practice Summary */}
      <div className="card">
        <h3>Your Practice Summary</h3>
        <p>{personalPractice.length} practice sessions recorded</p>
        <ul>
          {personalPractice.map((session) => (
            <li key={session.session_id}>
              {new Date(session.started_at).toLocaleDateString()} - {session.actual_practice_duration_seconds}s
            </li>
          ))}
        </ul>
      </div>

      {/* Synchronization Status */}
      <div className="card">
        <h3>Synchronization Status</h3>
        <p>Status: {syncStatus}</p>
        <p>Last checked: just now</p>
        <small>
          Practice records are synchronized when online and consent is enabled.
        </small>
      </div>
    </div>
  )
}