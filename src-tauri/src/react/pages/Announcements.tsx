import { useEffect, useMemo, useState } from 'react'
import { supa } from '../lib/supabase'
import { useAuth } from '../hooks/use-auth'
import '../App.css'
import { readApplicationCache, saveApplicationCache } from '../lib/offline'
import type { AnnouncementRecord } from '../lib/models'
import EmptyState from '../components/EmptyState'
import LoadingSkeleton from '../components/LoadingSkeleton'
import StatusMessage from '../components/StatusMessage'

export default function Announcements() {
  const { user, teamId } = useAuth()
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [cacheUpdatedAt, setCacheUpdatedAt] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id) return
    if (!teamId) {
      setLoading(false)
      return
    }

    loadAnnouncements(teamId)
  }, [user?.id, teamId])

  async function loadAnnouncements(teamId: string) {
    setLoading(true)
    setError(null)
    const cached = await readApplicationCache<AnnouncementRecord[]>(teamId, 'announcements').catch(() => null)
    if (cached) {
      setAnnouncements(cached.data)
      setCacheUpdatedAt(cached.updatedAt)
    }
    try {
      const { data, error } = await supa
        .from('team_posts')
        .select('*, author:profiles!team_posts_author_id_fkey (display_name)')
        .eq('team_id', teamId)
        .eq('post_type', 'announcement')
        .order('created_at', { ascending: false })

      if (error) throw error
      const results = data ?? []
      setAnnouncements(results)
      setCacheUpdatedAt(new Date().toISOString())
      await saveApplicationCache(teamId, 'announcements', results)
    } catch (err) {
      console.error('Error loading announcements:', err)
      setError('Unable to load announcements. Try again when your connection is available.')
    } finally {
      setLoading(false)
    }
  }

  const filteredAnnouncements = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase()
    if (!query) return announcements
    return announcements.filter((post) =>
      [post.message_body, post.author?.display_name]
        .some((value) => value?.toLocaleLowerCase().includes(query))
    )
  }, [announcements, searchQuery])

  return (
    <div className="page-container">
      <h2>Announcements</h2>
      {error && <StatusMessage tone={cacheUpdatedAt ? 'warning' : 'error'}>{error}</StatusMessage>}
      {cacheUpdatedAt && (
        <p className="cache-status" role="status">
          Announcements cached {new Date(cacheUpdatedAt).toLocaleString()}
          {!navigator.onLine ? ' · Showing offline cache' : ''}
        </p>
      )}

      <section className="card announcement-search">
        <label>
          Search announcements
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search message or author"
          />
        </label>
      </section>

      {loading && announcements.length === 0 ? (
        <LoadingSkeleton rows={4} label="Loading announcements" />
      ) : filteredAnnouncements.length === 0 ? (
        <EmptyState
          title={error && announcements.length === 0
            ? 'Announcements unavailable'
            : announcements.length
              ? 'No announcements match your search'
              : 'No announcements yet'}
        >
          {error && announcements.length === 0
            ? 'Check your connection or team access, then try again.'
            : announcements.length
              ? 'Try searching for another word or author.'
              : 'Team updates and service notes will appear here.'}
        </EmptyState>
      ) : (
        <ul className="announcement-list">
          {filteredAnnouncements.map((post) => (
            <li key={post.id} className="card announcement-card">
              <div className="announcement-heading">
                <strong>{post.author?.display_name || 'Unknown'}</strong>
                <time dateTime={post.created_at}>{new Date(post.created_at).toLocaleString()}</time>
              </div>
              <p>{post.message_body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}