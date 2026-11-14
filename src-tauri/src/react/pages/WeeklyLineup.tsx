import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supa } from '../lib/supabase'
import { useAuth } from '../hooks/use-auth'
import { useParams } from 'react-router-dom'
import '../App.css'

type LineupSong = {
  id: string
  lineup_id: string
  song_id: string
  position: number
  selected_arrangement_id: string | null
  key_override: string | null
  tempo_override: number | null
  transition_notes: string | null
  song: { id: string; title: string; key_signature: string | null; tempo_bpm: number | null } | Array<{ id: string; title: string; key_signature: string | null; tempo_bpm: number | null }> | null
  selected_arrangement: { id: string; arrangement_name: string } | Array<{ id: string; arrangement_name: string }> | null
}

type Lineup = {
  id: string
  service_date: string
  title: string
  status: 'draft' | 'published' | 'archived'
  version: number
  songs: LineupSong[]
}

type CatalogSong = {
  id: string
  title: string
  key_signature: string | null
  tempo_bpm: number | null
  arrangements: Array<{ id: string; arrangement_name: string }>
}

export default function WeeklyLineup() {
  const { user, teamId, accessRole } = useAuth()
  const { lineupId: routeLineupId } = useParams<{ lineupId: string }>()
  const isLeader = accessRole === 'worship_leader'
  const [lineups, setLineups] = useState<Array<{ id: string; service_date: string; service_title: string | null; status: Lineup['status'] }>>([])
  const [selectedId, setSelectedId] = useState<string | null>(routeLineupId ?? null)
  const [lineup, setLineup] = useState<Lineup | null>(null)
  const [catalogSongs, setCatalogSongs] = useState<CatalogSong[]>([])
  const [selectedSongId, setSelectedSongId] = useState('')
  const [selectedArrangementId, setSelectedArrangementId] = useState('')
  const [keyOverride, setKeyOverride] = useState('')
  const [tempoOverride, setTempoOverride] = useState('')
  const [transitionNotes, setTransitionNotes] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().slice(0, 10))
  const [serviceTitle, setServiceTitle] = useState('Sunday Worship')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadLineup = useCallback(async (id: string) => {
    if (!teamId) return
    const { data, error: loadError } = await supa
      .from('lineups')
      .select(`
        id, service_date, service_title, status, version,
        lineup_items (
          id, lineup_id, song_id, position, selected_arrangement_id,
          key_override, tempo_override, transition_notes,
          song:songs(id, title, key_signature, tempo_bpm),
          selected_arrangement:song_arrangements(id, arrangement_name)
        )
      `)
      .eq('team_id', teamId)
      .eq('id', id)
      .maybeSingle()
    if (loadError) throw loadError
    if (!data) {
      setLineup(null)
      return
    }

    setLineup({
      id: data.id,
      service_date: data.service_date,
      title: data.service_title ?? 'Worship Service',
      status: data.status,
      version: data.version,
      songs: [...(data.lineup_items ?? [])].sort((a, b) => a.position - b.position) as LineupSong[],
    })
  }, [teamId])

  useEffect(() => {
    if (!user?.id || !teamId) {
      setLoading(false)
      setLineups([])
      setLineup(null)
      return
    }

    let active = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [{ data: lineupRows, error: lineupError }, { data: songs, error: songsError }] =
          await Promise.all([
            supa
              .from('lineups')
              .select('id, service_date, service_title, status, version')
              .eq('team_id', teamId)
              .order('service_date', { ascending: false })
              .order('version', { ascending: false })
              .limit(30),
            supa
              .from('songs')
              .select('id, title, key_signature, tempo_bpm, arrangements:song_arrangements(id, arrangement_name)')
              .eq('team_id', teamId)
              .eq('is_active', true)
              .order('title'),
          ])
        if (lineupError) throw lineupError
        if (songsError) throw songsError
        if (!active) return

        const rows = lineupRows ?? []
        setLineups(rows)
        setCatalogSongs((songs ?? []) as CatalogSong[])
        const defaultId =
          routeLineupId && rows.some((row) => row.id === routeLineupId)
            ? routeLineupId
            : rows.find((row) => row.status === 'published')?.id ??
              (isLeader ? rows.find((row) => row.status === 'draft')?.id : undefined) ??
              null
        setSelectedId(defaultId)
        if (defaultId) {
          const { data, error: detailError } = await supa
            .from('lineups')
            .select(`
              id, service_date, service_title, status, version,
              lineup_items (
                id, lineup_id, song_id, position, selected_arrangement_id,
                key_override, tempo_override, transition_notes,
                song:songs(id, title, key_signature, tempo_bpm),
                selected_arrangement:song_arrangements(id, arrangement_name)
              )
            `)
            .eq('team_id', teamId)
            .eq('id', defaultId)
            .maybeSingle()
          if (detailError) throw detailError
          if (active && data) {
            setLineup({
              id: data.id,
              service_date: data.service_date,
              title: data.service_title ?? 'Worship Service',
              status: data.status,
              version: data.version,
              songs: [...(data.lineup_items ?? [])].sort((a, b) => a.position - b.position) as LineupSong[],
            })
          } else if (active) {
            setLineup(null)
          }
        } else if (active) {
          setLineup(null)
        }
      } catch (loadError) {
        console.error('Error loading lineups:', loadError)
        if (active) setError('Unable to load lineups or catalog songs.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [user?.id, teamId, routeLineupId, isLeader])

  const selectedSong = catalogSongs.find((song) => song.id === selectedSongId)

  function resetItemForm() {
    setEditingItemId(null)
    setSelectedSongId('')
    setSelectedArrangementId('')
    setKeyOverride('')
    setTempoOverride('')
    setTransitionNotes('')
  }

  async function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user?.id || !teamId || !isLeader) return
    setSaving(true)
    setError(null)
    try {
      const { data, error: createError } = await supa
        .from('lineups')
        .insert({
          team_id: teamId,
          service_date: serviceDate,
          service_title: serviceTitle.trim() || null,
          status: 'draft',
          created_by: user.id,
        })
        .select('id, service_date, service_title, status, version')
        .single()
      if (createError) throw createError
      setLineups((current) => [
        { id: data.id, service_date: data.service_date, service_title: data.service_title, status: data.status },
        ...current,
      ])
      setSelectedId(data.id)
      setLineup({
        id: data.id,
        service_date: data.service_date,
        title: data.service_title ?? 'Worship Service',
        status: data.status,
        version: data.version,
        songs: [],
      })
      setNotice('Draft lineup created.')
    } catch (createError) {
      console.error('Error creating draft lineup:', createError)
      setError('Unable to create draft lineup. Check leader permissions and try again.')
    } finally {
      setSaving(false)
    }
  }

  async function createRevision() {
    if (!lineup || !teamId || !user?.id || !isLeader) return
    setSaving(true)
    setError(null)
    try {
      const { data, error: createError } = await supa
        .from('lineups')
        .insert({
          team_id: teamId,
          service_date: lineup.service_date,
          service_title: `${lineup.title} (Revision)`,
          status: 'draft',
          version: lineup.version + 1,
          created_by: user.id,
        })
        .select('id, service_date, service_title, status, version')
        .single()
      if (createError) throw createError

      if (lineup.songs.length) {
        const { error: itemsError } = await supa.from('lineup_items').insert(
          lineup.songs.map((item, index) => ({
            team_id: teamId,
            lineup_id: data.id,
            song_id: item.song_id,
            position: index + 1,
            selected_arrangement_id: item.selected_arrangement_id,
            key_override: item.key_override,
            tempo_override: item.tempo_override,
            transition_notes: item.transition_notes,
          }))
        )
        if (itemsError) {
          const { error: cleanupError } = await supa
            .from('lineups')
            .delete()
            .eq('id', data.id)
            .eq('team_id', teamId)
          if (cleanupError) {
            console.error('Unable to remove incomplete lineup revision:', cleanupError)
          }
          throw itemsError
        }
      }

      setSelectedId(data.id)
      await loadLineup(data.id)
      setLineups((current) => [
        { id: data.id, service_date: data.service_date, service_title: data.service_title, status: data.status },
        ...current,
      ])
      setNotice('Revision draft created. The published lineup remains unchanged.')
    } catch (createError) {
      console.error('Error creating lineup revision:', createError)
      setError('Unable to create the replacement draft. The previous published lineup is unchanged.')
    } finally {
      setSaving(false)
    }
  }

  async function saveLineupItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!lineup || !teamId || !isLeader || lineup.status !== 'draft') return
    const bpm = tempoOverride.trim() ? Number(tempoOverride) : null
    if (bpm !== null && (!Number.isInteger(bpm) || bpm <= 0)) {
      setError('Tempo must be a positive whole number.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const values = {
        selected_arrangement_id: selectedArrangementId || null,
        key_override: keyOverride.trim() || null,
        tempo_override: bpm,
        transition_notes: transitionNotes.trim() || null,
        updated_at: new Date().toISOString(),
      }
      const result = editingItemId
        ? await supa
            .from('lineup_items')
            .update(values)
            .eq('id', editingItemId)
            .eq('team_id', teamId)
            .select('id')
            .maybeSingle()
        : await supa.from('lineup_items').insert({
            ...values,
            team_id: teamId,
            lineup_id: lineup.id,
            song_id: selectedSongId,
            position: lineup.songs.length + 1,
          }).select('id').single()
      if (result.error) throw result.error
      if (!result.data) throw new Error('The lineup item was not saved.')
      await loadLineup(lineup.id)
      resetItemForm()
      setNotice(editingItemId ? 'Lineup item updated.' : 'Song added to draft lineup.')
    } catch (saveError) {
      console.error('Error saving lineup item:', saveError)
      setError('Unable to save the lineup item.')
    } finally {
      setSaving(false)
    }
  }

  async function removeItem(item: LineupSong) {
    if (!lineup || lineup.status !== 'draft' || !isLeader) return
    setError(null)
    const { data: removedItem, error: removeError } = await supa
      .from('lineup_items')
      .delete()
      .eq('id', item.id)
      .eq('team_id', teamId)
      .select('id')
      .maybeSingle()
    if (removeError) {
      console.error('Error removing lineup item:', removeError)
      setError('Unable to remove the song from the lineup.')
      return
    }
    if (!removedItem) {
      setError('The lineup item was not removed.')
      return
    }
    await reorderItems(lineup.songs.filter((song) => song.id !== item.id))
  }

  async function reorderItems(items: LineupSong[]) {
    if (!lineup) return
    for (const [index, item] of items.entries()) {
      const { data: updatedItem, error: updateError } = await supa
        .from('lineup_items')
        .update({ position: index + 1, updated_at: new Date().toISOString() })
        .eq('id', item.id)
        .eq('team_id', teamId)
        .select('id')
        .maybeSingle()
      if (updateError) {
        console.error('Error reordering lineup:', updateError)
        setError('The lineup order could not be fully saved. Reload the lineup and review its order.')
        await loadLineup(lineup.id)
        return
      }
      if (!updatedItem) {
        setError('The lineup order could not be fully saved. Reload the lineup and review its order.')
        await loadLineup(lineup.id)
        return
      }
    }
    await loadLineup(lineup.id)
  }

  async function moveItem(itemIndex: number, direction: -1 | 1) {
    if (!lineup) return
    const targetIndex = itemIndex + direction
    if (targetIndex < 0 || targetIndex >= lineup.songs.length) return
    const items = [...lineup.songs]
    const currentItem = items[itemIndex]
    const targetItem = items[targetIndex]
    if (!currentItem || !targetItem) return
    items[itemIndex] = targetItem
    items[targetIndex] = currentItem
    await reorderItems(items)
  }

  async function publishLineup() {
    if (!lineup || !teamId || !isLeader || lineup.status !== 'draft') return
    if (!window.confirm('Publish this lineup? Published lineups become read-only. Make a replacement draft to correct it later.')) return
    setSaving(true)
    setError(null)
    try {
      const { data: published, error: publishError } = await supa
        .from('lineups')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', lineup.id)
        .eq('team_id', teamId)
        .eq('status', 'draft')
        .select('id')
        .maybeSingle()
      if (publishError) throw publishError
      if (!published) throw new Error('The draft was not published.')

      const { error: archiveError } = await supa
        .from('lineups')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('team_id', teamId)
        .eq('service_date', lineup.service_date)
        .eq('status', 'published')
        .neq('id', lineup.id)

      setLineup({ ...lineup, status: 'published' })
      setLineups((current) => current.map((item) =>
        item.id === lineup.id
          ? { ...item, status: 'published' }
          : item.service_date === lineup.service_date && item.status === 'published'
            ? { ...item, status: 'archived' }
            : item
      ))
      if (archiveError) {
        console.error('Unable to archive the previous published lineup:', archiveError)
        setNotice('Lineup published, but the prior published lineup could not be archived.')
      } else {
        setNotice('Lineup published. Published items are read-only; use a replacement draft for corrections.')
      }
    } catch (publishError) {
      console.error('Error publishing lineup:', publishError)
      setError('Unable to publish the lineup.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="page-container">Loading lineup...</div>

  return (
    <div className="page-container">
      <h2>Weekly Lineup</h2>
      {error && <p className="error-message" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}

      {lineups.length > 0 && (
        <label>
          Select lineup
          <select
            value={selectedId ?? ''}
            onChange={(event) => {
              const nextId = event.target.value || null
              setSelectedId(nextId)
              setLineup(null)
              if (nextId) {
                void loadLineup(nextId).catch((loadError: unknown) => {
                  console.error('Error loading selected lineup:', loadError)
                  setError('Unable to load the selected lineup.')
                })
              }
            }}
          >
            {lineups.map((item) => (
              <option key={item.id} value={item.id}>
                {item.service_date} — {item.service_title ?? 'Worship Service'} ({item.status})
              </option>
            ))}
          </select>
        </label>
      )}

      {isLeader && !lineup && (
        <form className="card" onSubmit={(event) => void createDraft(event)}>
          <h3>Create draft lineup</h3>
          <label>
            Service date
            <input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} required />
          </label>
          <label>
            Service title
            <input value={serviceTitle} onChange={(event) => setServiceTitle(event.target.value)} maxLength={255} />
          </label>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create Draft'}
          </button>
        </form>
      )}

      {!lineup && !isLeader && <p>No published lineup found for this team yet.</p>}

      {lineup && (
        <>
          <h3>{lineup.title} — {lineup.service_date}</h3>
          <p>Status: {lineup.status} · Revision {lineup.version}</p>
          <table className="table">
            <thead>
              <tr><th>#</th><th>Song</th><th>Key</th><th>Tempo</th><th>Arrangement</th>{isLeader && lineup.status === 'draft' && <th>Actions</th>}</tr>
            </thead>
            <tbody>
              {lineup.songs.map((item, index) => (
                <tr key={item.id}>
                  <td>{index + 1}</td>
                  <td>{(Array.isArray(item.song) ? item.song[0] : item.song)?.title ?? 'Unknown'}</td>
                  <td>{item.key_override ?? (Array.isArray(item.song) ? item.song[0] : item.song)?.key_signature ?? '—'}</td>
                  <td>{item.tempo_override ?? (Array.isArray(item.song) ? item.song[0] : item.song)?.tempo_bpm ?? '—'}</td>
                  <td>{(Array.isArray(item.selected_arrangement) ? item.selected_arrangement[0] : item.selected_arrangement)?.arrangement_name ?? '—'}</td>
                  {isLeader && lineup.status === 'draft' && (
                    <td>
                      <button type="button" onClick={() => void moveItem(index, -1)} disabled={index === 0}>↑</button>
                      <button type="button" onClick={() => void moveItem(index, 1)} disabled={index === lineup.songs.length - 1}>↓</button>
                      <button
                        type="button"
                        onClick={() => {
                          const song = catalogSongs.find((candidate) => candidate.id === item.song_id)
                          setEditingItemId(item.id)
                          setSelectedSongId(item.song_id)
                          setSelectedArrangementId(item.selected_arrangement_id ?? '')
                          setKeyOverride(item.key_override ?? '')
                          setTempoOverride(item.tempo_override?.toString() ?? '')
                          setTransitionNotes(item.transition_notes ?? '')
                          if (!song) setError('The song for this lineup item is no longer active.')
                        }}
                      >
                        Edit
                      </button>
                      <button type="button" onClick={() => void removeItem(item)}>Remove</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {isLeader && lineup.status === 'draft' && (
            <form className="card" onSubmit={(event) => void saveLineupItem(event)}>
              <h3>{editingItemId ? 'Edit lineup item' : 'Add a song'}</h3>
              {!editingItemId && (
                <label>
                  Song
                  <select value={selectedSongId} onChange={(event) => {
                    setSelectedSongId(event.target.value)
                    setSelectedArrangementId('')
                  }} required>
                    <option value="">Choose a song</option>
                    {catalogSongs.map((song) => <option key={song.id} value={song.id}>{song.title}</option>)}
                  </select>
                </label>
              )}
              {editingItemId && <p>{catalogSongs.find((song) => song.id === selectedSongId)?.title}</p>}
              <label>
                Arrangement
                <select
                  value={selectedArrangementId}
                  onChange={(event) => setSelectedArrangementId(event.target.value)}
                >
                  <option value="">Default</option>
                  {(selectedSong?.arrangements ?? []).map((arrangement) => (
                    <option key={arrangement.id} value={arrangement.id}>{arrangement.arrangement_name}</option>
                  ))}
                </select>
              </label>
              <label>
                Key override
                <input value={keyOverride} onChange={(event) => setKeyOverride(event.target.value)} maxLength={50} />
              </label>
              <label>
                Tempo override (BPM)
                <input type="number" min="1" step="1" value={tempoOverride} onChange={(event) => setTempoOverride(event.target.value)} />
              </label>
              <label>
                Transition notes
                <textarea value={transitionNotes} onChange={(event) => setTransitionNotes(event.target.value)} rows={3} />
              </label>
              <button type="submit" className="btn-primary" disabled={saving || (!editingItemId && !selectedSongId)}>
                {saving ? 'Saving…' : editingItemId ? 'Save Item' : 'Add Song'}
              </button>
              {editingItemId && <button type="button" onClick={resetItemForm}>Cancel edit</button>}
            </form>
          )}

          {isLeader && lineup.status === 'draft' && (
            <button type="button" className="btn-primary" onClick={() => void publishLineup()} disabled={saving}>
              {saving ? 'Publishing…' : 'Publish Lineup'}
            </button>
          )}
          {isLeader && lineup.status === 'published' && (
            <button type="button" className="btn-primary" onClick={() => void createRevision()} disabled={saving}>
              {saving ? 'Creating…' : 'Create Replacement Draft'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
