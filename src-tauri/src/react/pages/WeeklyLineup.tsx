import { useEffect, useState } from 'react'
import { supa } from '../lib/supabase'
import { useAuth } from '../hooks/use-auth'
import { useParams } from 'react-router-dom'
import '../App.css'

export default function WeeklyLineup() {
  const { user, teamId } = useAuth()
  const { lineupId } = useParams<{ lineupId: string }>()
  const [lineup, setLineup] = useState<{ id: string; title: string; songs: any[]; status: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    if (!teamId) {
      setLineup(null)
      setLoading(false)
      return
    }

    async function loadLineup() {
      setLoading(true)
      try {
        const lid = lineupId || localStorage.getItem('current_lineup_id')

        const lineupQuery = () =>
          supa.from('lineups').select(`
            *,
            lineup_items (
              *,
              song: songs (*),
              selected_arrangement: song_arrangements (*)
            )
          `)
            .eq('team_id', teamId)

        let result = lid
          ? await lineupQuery().eq('id', lid).maybeSingle()
          : await lineupQuery()
              .eq('status', 'published')
              .order('service_date', { ascending: false })
              .limit(1)
              .maybeSingle()

        if (result.error) throw result.error
        if (!result.data && lid) {
          result = await lineupQuery()
            .eq('status', 'published')
            .order('service_date', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (result.error) throw result.error
        }

        if (result.data) {
          const data = result.data
          setLineup({
            id: data.id,
            title: data.service_title || 'Unnamed Lineup',
            songs: data.lineup_items || [],
            status: data.status
          })
          localStorage.setItem('current_lineup_id', data.id)
        } else {
          setLineup(null)
        }
      } catch (err) {
        console.error('Error loading lineup:', err)
        setLineup(null)
      } finally {
        setLoading(false)
      }
    }

    loadLineup()
  }, [user?.id, teamId, lineupId])

  if (loading) {
    return <div>Loading lineup...</div>
  }

  if (!lineup) {
    return (
      <div className="page-container">
        <h2>Weekly Lineup</h2>
        <p>No published lineup found for this team yet.</p>
      </div>
    )
  }

  return (
    <div className="page-container">
      <h2>Weekly Lineup: {lineup.title}</h2>
      
      <p>Status: {lineup.status === 'published' ? 'Published (official)' : lineup.status === 'draft' ? 'Draft' : 'Archived'}</p>

      <div style={{ marginTop: '1.5rem' }}>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Song</th>
              <th>Key</th>
              <th>Tempo</th>
              <th>Arrangement</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {lineup.songs.map((item: any, index: number) => {
              const song = item.song || {}
              const arrangement = item.selected_arrangement || {}
              return (
                <tr key={item.id}>
                  <td>{index + 1}</td>
                  <td>{song.title || 'Unknown'}</td>
                  <td>{item.key_override || song.key_signature || 'C'}</td>
                  <td>{item.tempo_override || song.tempo_bpm || '—'}</td>
                  <td>{arrangement.arrangement_name || '—'}</td>
                  <td>
                    <button style={{ marginRight: '0.5rem' }} onClick={() => window.alert('Edit lineup item')}>
                      Edit
                    </button>
                    <button onClick={() => window.alert('Remove item')}>
                      Remove
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {lineup.status !== 'published' && (
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#e8f4fd', borderRadius: 4 }}>
          <h4>Draft Lineup</h4>
          <p>This lineup is still in draft mode. Only published lineups are official for services.</p>
        </div>
      )}

      <div style={{ marginTop: '1.5rem' }}>
        <button onClick={() => window.alert('Publish lineup')} className="btn-primary">
          Publish Lineup
        </button>
        <button style={{ marginLeft: '0.5rem' }} onClick={() => window.alert('Close lineup')}>

          Close
        </button>
      </div>
    </div>
  )
}