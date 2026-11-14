import { useEffect, useState } from 'react'
import { supa } from '../lib/supabase'
import { useAuth } from '../hooks/use-auth'
import '../App.css'

export default function Announcements() {
  const { user } = useAuth()
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [teamId, setTeamId] = useState('')

  useEffect(() => {
    if (!user?.id) return

    const init = async () => {
      const tid = localStorage.getItem('team_id')
      if (tid) {
        setTeamId(tid)
        await loadAnnouncements()
      }
      setLoading(false)
    }

    init()
  }, [user?.id])

  async function loadAnnouncements() {
    setLoading(true)
    try {
      const { data, error } = await supa
        .from('team_posts')
        .select('*, author:auth.users!author_id (display_name)')
        .eq('team_id', teamId)
        .eq('post_type', 'announcement')
        .order('created_at', { ascending: false })

      if (!error && data) {
        setAnnouncements(data)
      }
    } catch (err) {
      console.error('Error loading announcements:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-container">
      <h2>Announcements</h2>

      {loading ? (
        <p>Loading announcements...</p>
      ) : announcements.length === 0 ? (
        <p>No announcements yet.</p>
      ) : (
        <ul>
          {announcements.map((post) => (
            <li key={post.id} style={{ listStyle: 'none', marginBottom: '0.5rem' }}>
              <strong>{post.author?.display_name || 'Unknown'}:</strong> {post.message_body}
              <br />
              <small>{new Date(post.created_at).toLocaleString()}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}