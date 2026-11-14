import { useEffect, useState } from 'react'
import { supa } from '../lib/supabase'
import { useAuth } from '../hooks/use-auth'
import '../App.css'

export default function SongCatalog() {
  const { user } = useAuth()
  const [songs, setSongs] = useState<any[]>([])
  const [filteredSongs, setFilteredSongs] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [teamId, setTeamId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return

    const init = async () => {
      const tid = localStorage.getItem('team_id')
      if (tid) {
        setTeamId(tid)
        await loadSongs()
      }
      setLoading(false)
    }

    init()
  }, [user?.id])

  async function loadSongs() {
    setLoading(true)
    try {
      let query = supa.from('songs').select('*, tags:tags!inner (tag_name)').eq('team_id', teamId).eq('is_active', true)

      if (searchQuery) {
        query = query.or(`title.ilike.%${searchQuery}%,artist.ilike.%${searchQuery}%`)
      }
      if (selectedTag) {
        query = query.eq('tags.tag_name', selectedTag)
      }
      if (selectedKey) {
        query = query.eq('key_signature', selectedKey)
      }

      const { data, error } = await query.order('title', { ascending: true })

      if (!error && data) {
        setSongs(data)
        setFilteredSongs(data)
      }
    } catch (err) {
      console.error('Error loading songs:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value
    setSearchQuery(query)
    if (query.trim()) {
      // Filter songs by search query
      const filtered = songs.filter(
        (s) =>
          (s.title && s.title.toLowerCase().includes(query.toLowerCase())) ||
          (s.artist && s.artist.toLowerCase().includes(query.toLowerCase()))
      )
      setFilteredSongs(filtered)
    } else {
      setFilteredSongs(songs)
    }
  }

  const handleTagFilter = (tag: string | null) => {
    setSelectedTag(tag)
    loadSongs()
  }

  const handleKeyFilter = (key: string | null) => {
    setSelectedKey(key)
    loadSongs()
  }

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
              onChange={handleSearch}
            />
          </div>
          <div>
            <select onChange={(e) => handleTagFilter(e.target.value)}>
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
            <select onChange={(e) => handleKeyFilter(e.target.value)}>
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
                onClick={() => window.alert(`View details for "${song.title}"`)}
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