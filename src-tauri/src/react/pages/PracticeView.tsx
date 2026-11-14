import { useEffect, useState } from 'react'
import { supa } from '../lib/supabase'
import { useAuth } from '../hooks/use-auth'
import { useParams } from 'react-router-dom'
import '../App.css'

export default function PracticeView() {
  const {
    user,
    practiceSharingEnabled,
    setPracticeSharingEnabled,
    syncPracticeSession,
    teamId
  } = useAuth()
  const { songId } = useParams<{ songId: string }>()
  const [song, setSong] = useState<any>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0)
  const [loopStart, setLoopStart] = useState(0)
  const [loopEnd, setLoopEnd] = useState(0)
  const [loopRepetitions, setLoopRepetitions] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending' | 'error'>('synced')
  const [syncError, setSyncError] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id || !songId) return

    async function loadSong() {
      setLoading(true)
      try {
        const { data, error } = await supa
          .from('songs')
          .select('*')
          .eq('id', songId)
          .eq('team_id', teamId || localStorage.getItem('team_id'))
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
  }, [user?.id, songId, teamId])

  useEffect(() => {
    if (!isPlaying) return

    const timer = window.setInterval(() => {
      setCurrentTime((time) => time + 1000)
    }, 1000)

    return () => window.clearInterval(timer)
  }, [isPlaying])

  if (loading || !song) {
    return <div>Loading practice view...</div>
  }

  const togglePlay = () => {
    setIsPlaying(prev => !prev)
  }

  // Loop handling
  const handleLoopChange = (start: number, end: number) => {
    setLoopStart(start)
    setLoopEnd(end)
    // In a full implementation, this would update the audio loop bounds
  }

  // Save practice session
  const savePracticeSession = async () => {
    if (!user?.id || !song) return

    const session: any = {
      session_id: crypto.randomUUID(),
      team_id: teamId || localStorage.getItem('team_id') || '',
      user_id: user.id,
      song_id: songId,
      arrangement_id: song.arrangements?.[0]?.id || null,
      lineup_item_id: null,
      device_id: localStorage.getItem('device_id') || crypto.randomUUID(),
      started_at: new Date().toISOString(),
      ended_at: isPlaying ? new Date().toISOString() : null,
      actual_practice_duration_seconds: Math.round(currentTime / 1000),
      playback_speed: playbackSpeed,
      loop_start_ms: loopStart,
      loop_end_ms: loopEnd,
      loop_repetitions: loopRepetitions,
      schema_version: '1.0'
    }

    // Show consent check
    if (!practiceSharingEnabled) {
      if (!window.confirm('Practice sharing is disabled. Enable sharing to sync practice records to the team?\n\nYour practice history remains local-only when sharing is disabled.')) {
        return
      }
      // User enabled sharing - toggle it
      await setPracticeSharingEnabled(true)
    }

    // Sync the practice session
    const result = await syncPracticeSession(session)
    setSyncStatus(result.success ? 'synced' : 'error')
    if (!result.success) setSyncError(result.alreadyExists ? 'Session already exists' : 'Failed to sync')
    if (result.alreadyExists) setSyncError('This practice session has already been recorded.')
  }

  return (
    <div className="page-container">
      <h2>Practice: {song.title}</h2>
      
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3>Song Info</h3>
        <p><strong>Key:</strong> {song.key_signature}</p>
        <p><strong>Tempo:</strong> {song.tempo_bpm} BPM</p>
        <p><strong>Capo:</strong> {song.capo_position || 0}</p>
      </div>

      <div className="card">
        <p>Practice Sharing: 
          <span style={practiceSharingEnabled ? { color: 'green' } : { color: 'red' }}>
            {practiceSharingEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </p>
        <br /><br />
        <button 
          onClick={() => setPracticeSharingEnabled(!practiceSharingEnabled)} 
          style={{ marginBottom: '0.5rem' }}
        >
          {practiceSharingEnabled ? 'Disable practice sharing' : 'Enable practice sharing'}
        </button>
        <small>
          When enabled, Worship Team Directors and Leaders can view shared team practice records.
          Sharing is optional and can be changed at any time.
        </small>
        {syncError && <p style={{ color: 'red' }}>{syncError}</p>}
        {syncStatus && <p>Sync status: {syncStatus}</p>}
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3>Playback Controls</h3>
        <div style={{
          background: '#333',
          width: '100%', 
          height: 50,
          borderRadius: 4, 
          overflow: 'hidden',
          margin: '0.5rem 0'
        }}>
          {/* Audio player canvas/controls would go here */}
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
          <button onClick={togglePlay} style={{ gridArea: '1 / 2 / 2 / 3' }}>
            {isPlaying ? '⏸️ Pause' : '▶️ Play'}
          </button>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
            style={{ gridArea: '2 / 2 / 3 / 3' }}
          />
          <button onClick={() => window.alert('Set A-B loop')} style={{ gridArea: '3 / 2 / 4 / 3' }}>
            A-B Loop
          </button>
        </div>
        
        <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
          <span>{Math.floor(currentTime / 60000)}:{String(Math.floor(currentTime / 1000) % 60).padStart(2, '0')}</span>
          <span>{playbackSpeed.toFixed(1)}x</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3>Lyrics and Chords</h3>
        <div style={{ 
          background: '#f8f9fa',
          padding: '1rem',
          borderRadius: 4, 
          height: '300px', 
          overflow: 'auto',
          fontFamily: 'inherit'
        }}>
          {song.chordpro_lyrics || 'No lyrics available'}
        </div>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <button onClick={savePracticeSession} className="btn-primary">
          {isPlaying ? 'End Practice' : 'Save Practice Session'}
        </button>
        <button onClick={() => window.alert('End practice session')} style={{ marginLeft: '0.5rem' }}>
          End
        </button>
      </div>

      {/* Show sync status without interrupting practice */}
      {syncStatus !== 'synced' && !isPlaying && (
        <div style={{ marginTop: '1rem', padding: '0.5rem', background: '#e8f4fd', borderRadius: 4 }}>
          <strong>Synchronization:</strong> {syncStatus}{syncError && <small style={{ color: 'red' }}>{syncError}</small>}
        </div>
      )}
    </div>
  )
}
