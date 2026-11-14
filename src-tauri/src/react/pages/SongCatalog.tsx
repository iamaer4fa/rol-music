import { useEffect, useMemo, useState } from 'react'
import { supa } from '../lib/supabase'
import { useAuth } from '../hooks/use-auth'
import { useNavigate } from 'react-router-dom'
import '../App.css'

export default function SongCatalog() {
  const { user, teamId } = useAuth()
  const navigate = useNavigate()
  const [songs, setSongs] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id) {
      setLoading(false)
      return
    }

    if (!teamId) {
      setLoading(false)
      return
    }

    let cancelled = false
    async function loadSongs() {
      setLoading(true)
      setLoadError(null)
      try {
        let query = supa
          .from('songs')
          .select('*, tags:song_tags!inner (id, tag_name)')
          .eq('team_id', teamId)
          .eq('is_active', true)

        if (selectedTag) {
          query = query.eq('tags.tag_name', selectedTag)
        }
        if (selectedKey) {
          query = query.eq('key_signature', selectedKey)
        }

        const { data, error } = await query.order('title', { ascending: true })
        if (error) throw error
        if (!cancelled) setSongs(data ?? [])
      } catch (err) {
        console.error('Error loading songs:', err)
        if (!cancelled) {
          setSongs([])
          setLoadError('Unable to load songs. Check your team membership and database setup.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadSongs()
    return () => {
      cancelled = true
    }
  }, [user?.id, teamId, selectedTag, selectedKey])

  const filteredSongs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return songs
    return songs.filter((song) =>
      [song.title, song.artist].some((value) => value?.toLowerCase().includes(query))
    )
  }, [searchQuery, songs])

  return (
    <div className="page-container">
      <h2>Song Catalog</h2>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3>Search & Filter</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <input
              type="text"
              placeholder="Search songs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div>
            <select
              value={selectedTag ?? ''}
              onChange={(e) => setSelectedTag(e.target.value || null)}
            >
              <option value="">All Tags</option>
              <option>Worship</option>
              <option>Praise</option>
              <option>Christmas</option>
              <option>Easter</option>
              <option>Communion</option>
              <option>Opening</option>
              <option>Closing</option>
              <option>Special Service</option>
            </select>
          </div>
          <div>
            <select
              value={selectedKey ?? ''}
              onChange={(e) => setSelectedKey(e.target.value || null)}
            >
              <option value="">All Keys</option>
              <option>C</option>
              <option>G</option>
              <option>D</option>
              <option>A</option>
              <option>E</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <p>Loading songs...</p>
      ) : loadError ? (
        <p role="alert">{loadError}</p>
      ) : filteredSongs.length === 0 ? (
        <p>No songs found. Ask a Worship Leader to add songs to the catalog.</p>
      ) : (
        <ul>
          {filteredSongs.map((song) => (
            <li key={song.id} style={{ listStyle: 'none', marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid #eee' }}>
              <strong>{song.title}</strong>{song.artist ? ` - ${song.artist}` : ''}
              {song.key_signature ? ` (${song.key_signature})` : ''}
              <button
                style={{ marginLeft: '1rem', padding: '0.25rem 0.5rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                onClick={() => navigate(`/song/${song.id}`)}
              >
                View
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}