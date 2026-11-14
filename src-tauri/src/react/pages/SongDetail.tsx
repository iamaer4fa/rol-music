import { useEffect, useState } from 'react'
import { supa } from '../lib/supabase'
import { useAuth } from '../hooks/use-auth'
import { useParams } from 'react-router-dom'
import '../App.css'

export default function SongDetail() {
  const { user } = useAuth()
  const { id } = useParams<{ id: string }>()
  const [song, setSong] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id || !id) return

    async function loadSong() {
      setLoading(true)
      try {
        const { data, error } = await supa
          .from('songs')
          .select('*, tags:tags!inner (tag_name), arrangements:arrangements (*)')
          .eq('id', id)
          .eq('team_id', localStorage.getItem('team_id'))
          .single()

        if (!error && data) {
          setSong(data)
        }
      } catch (err) {
        console.error('Error loading song:', err)
      } finally {
        setLoading(false)
      }
    }

    loadSong()
  }, [user?.id, id])

  if (loading || !song) {
    return <div>Loading song...</div>
  }

  return (
    <div className="page-container">
      <h2>{song.title}</h2>
      
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3>Metadata</h3>
        <p><strong>Artist:</strong> {song.artist || 'Unknown'}</p>
        <p><strong>Key:</strong> {song.key_signature}</p>
        <p><strong>Tempo:</strong> {song.tempo_bpm ? `${song.tempo_bpm} BPM` : 'Not set'}</p>
        <p><strong>Time Signature:</strong> {song.time_signature}</p>
        <p><strong>Revision:</strong> {song.revision}</p>
        <p><strong>Status:</strong> {song.is_active ? 'Active' : 'Archived'}</p>
      </div>

      <div className="card">
        <h3>ChordPro Lyrics and Chords</h3>
        <div style={{ 
          background: '#f8f9fa',
          padding: '1rem',
          borderRadius: 4, 
          height: '400px', 
          overflow: 'auto',
          fontFamily: 'inherit'
        }}>
          {song.chordpro_lyrics || 'No lyrics available'}
        </div>
      </div>

      {song.arrangements && song.arrangements.length > 0 && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h3>Arrangements</h3>
          <ul>
            {song.arrangements.map((arr: any) => (
              <li key={arr.id}>
                <strong>{arr.arrangement_name}</strong>{arr.key ? ` (${arr.key})` : ''}{arr.capo_position !== undefined ? ` Capo ${arr.capo_position}` : ''}{arr.tempo_override ? ` (${arr.tempo_override} BPM)` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {song.tags && song.tags.length > 0 && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h3>Tags</h3>
          <ul>
            {song.tags.map((tag: any) => (
              <li key={tag.id}>{tag.tag_name}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: '1.5rem' }}>
        <button onClick={() => window.history.back()} className="btn-primary">
          Back to Catalog
        </button>
      </div>
    </div>
  )
}