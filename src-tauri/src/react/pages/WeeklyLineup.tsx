import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supa } from '../lib/supabase'
import { useAuth } from '../hooks/use-auth'
import { useParams, useSearchParams } from 'react-router-dom'
import { readApplicationCache, saveApplicationCache } from '../lib/offline'
import EmptyState from '../components/EmptyState'
import LoadingSkeleton from '../components/LoadingSkeleton'
import StatusMessage from '../components/StatusMessage'
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
  artist: string | null
  key_signature: string | null
  tempo_bpm: number | null
  arrangements: Array<{ id: string; arrangement_name: string }>
}

type TeamMember = {
  user_id: string
  display_name: string
  access_role: string
  musical_roles: string[]
}

type LineupAssignment = {
  id: string
  lineup_item_id: string
  user_id: string
  role_name: string
  preparation_status: 'pending' | 'ready' | 'needs_help'
  notes: string | null
  display_name?: string
}

export default function WeeklyLineup() {
  const { user, teamId, accessRole } = useAuth()
  const { lineupId: routeLineupId } = useParams<{ lineupId: string }>()
  const [searchParams] = useSearchParams()
  const queryLineupId = searchParams.get('lineupId')
  const requestedLineupId = routeLineupId ?? queryLineupId
  const isLeader = accessRole === 'worship_leader'
  const [lineups, setLineups] = useState<Array<{ id: string; service_date: string; service_title: string | null; status: Lineup['status'] }>>([])
  const [selectedId, setSelectedId] = useState<string | null>(requestedLineupId)
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
  const [lineupSongSearch, setLineupSongSearch] = useState('')
  const [selectedBatchSongIds, setSelectedBatchSongIds] = useState<string[]>([])
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [lineupHistory, setLineupHistory] = useState<Array<{ id: string; action: string; details: Record<string, unknown>; created_at: string }>>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [lineupAssignments, setLineupAssignments] = useState<LineupAssignment[]>([])
  const [assignmentItemId, setAssignmentItemId] = useState('')
  const [assignmentUserId, setAssignmentUserId] = useState('')
  const [assignmentRole, setAssignmentRole] = useState('')
  const [assignmentStatus, setAssignmentStatus] = useState<'pending' | 'ready' | 'needs_help'>('pending')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadLineup = useCallback(async (id: string) => {
    if (!teamId) return
    const cached = await readApplicationCache<{
      lineup: Lineup
      history: Array<{ id: string; action: string; details: Record<string, unknown>; created_at: string }>
      assignments: LineupAssignment[]
    }>(teamId, `lineup:${id}`).catch(() => null)
    if (cached) {
      setLineup(cached.data.lineup)
      setLineupHistory(cached.data.history)
      setLineupAssignments(cached.data.assignments)
    }
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
      setLineupHistory([])
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
    const { data: history } = await supa
      .from('lineup_change_history')
      .select('id, action, details, created_at')
      .eq('team_id', teamId)
      .eq('lineup_id', id)
      .order('created_at', { ascending: false })
      .limit(20)
    setLineupHistory(history ?? [])
    const { data: assignments } = await supa
      .from('lineup_assignments')
      .select('id, lineup_item_id, user_id, role_name, preparation_status, notes')
      .eq('team_id', teamId)
      .eq('lineup_id', id)
      .order('role_name')
    setLineupAssignments(assignments ?? [])
    await saveApplicationCache(teamId, `lineup:${id}`, {
      lineup: {
        id: data.id,
        service_date: data.service_date,
        title: data.service_title ?? 'Worship Service',
        status: data.status,
        version: data.version,
        songs: [...(data.lineup_items ?? [])].sort((a, b) => a.position - b.position),
      },
      history: history ?? [],
      assignments: assignments ?? [],
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
      const activeTeamId = teamId
      if (!activeTeamId) return
      setLoading(true)
      setError(null)
      const cached = await readApplicationCache<Array<{ id: string; service_date: string; service_title: string | null; status: Lineup['status'] }>>(activeTeamId, 'lineups').catch(() => null)
      if (cached && active) setLineups(cached.data)
      try {
        const [{ data: lineupRows, error: lineupError }, { data: songs, error: songsError }, { data: memberRows, error: membersError }, { data: profileRows, error: profilesError }] =
          await Promise.all([
            supa
              .from('lineups')
              .select('id, service_date, service_title, status, version')
              .eq('team_id', activeTeamId)
              .order('service_date', { ascending: false })
              .order('version', { ascending: false })
              .limit(30),
            supa
              .from('songs')
              .select('id, title, artist, key_signature, tempo_bpm, arrangements:song_arrangements(id, arrangement_name)')
              .eq('team_id', activeTeamId)
              .eq('is_active', true)
              .order('title'),
            supa
              .from('team_members')
              .select('user_id, access_role, musical_roles')
              .eq('team_id', activeTeamId)
              .eq('membership_status', 'active'),
            supa
              .from('profiles')
              .select('id, display_name'),
          ])
        if (lineupError) throw lineupError
        if (songsError) throw songsError
        if (membersError) throw membersError
        if (profilesError) throw profilesError
        if (!active) return

        const rows = lineupRows ?? []
        setLineups(rows)
        await saveApplicationCache(activeTeamId, 'lineups', rows)
        setCatalogSongs((songs ?? []) as CatalogSong[])
        setTeamMembers((memberRows ?? []).map((member) => ({
          user_id: member.user_id,
          display_name: profileRows?.find((profile) => profile.id === member.user_id)?.display_name ?? 'Team member',
          access_role: member.access_role,
          musical_roles: Array.isArray(member.musical_roles) ? member.musical_roles : [],
        })))
        const defaultId =
          requestedLineupId && rows.some((row) => row.id === requestedLineupId)
            ? requestedLineupId
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
            await loadLineup(defaultId)
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
  }, [user?.id, teamId, requestedLineupId, isLeader, loadLineup])

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
    if (!window.confirm('Create a replacement draft? The currently published lineup will remain unchanged until this replacement is published.')) return
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
    if (!editingItemId && lineup.songs.some((item) => item.song_id === selectedSongId)) {
      setError('This song is already in the lineup.')
      return
    }
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

  async function recordLineupChange(action: string, details: Record<string, unknown>) {
    if (!lineup || !teamId || !user?.id) return
    await supa.from('lineup_change_history').insert({
      team_id: teamId,
      lineup_id: lineup.id,
      changed_by: user.id,
      action,
      details,
    })
  }

  async function addSelectedSongs() {
    if (!lineup || !teamId || !isLeader || lineup.status !== 'draft' || !selectedBatchSongIds.length) return
    const existingIds = new Set(lineup.songs.map((item) => item.song_id))
    const songIds = selectedBatchSongIds.filter((songId) => !existingIds.has(songId))
    if (!songIds.length) {
      setError('Those songs are already in this lineup.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const { error: insertError } = await supa.from('lineup_items').insert(
        songIds.map((songId, index) => ({
          team_id: teamId,
          lineup_id: lineup.id,
          song_id: songId,
          position: lineup.songs.length + index + 1,
        })),
      )
      if (insertError) throw insertError
      await recordLineupChange('songs_added', { song_ids: songIds })
      await loadLineup(lineup.id)
      setSelectedBatchSongIds([])
      setLineupSongSearch('')
      setNotice(`${songIds.length} song${songIds.length === 1 ? '' : 's'} added to the draft lineup.`)
    } catch (batchError) {
      console.error('Error adding lineup songs:', batchError)
      setError('Unable to add the selected songs.')
    } finally {
      setSaving(false)
    }
  }

  async function saveAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!lineup || !teamId || !isLeader) return
    if (!assignmentItemId || !assignmentUserId || !assignmentRole.trim()) {
      setError('Choose a song, member, and role for the assignment.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { error: saveError } = await supa
        .from('lineup_assignments')
        .upsert({
          team_id: teamId,
          lineup_id: lineup.id,
          lineup_item_id: assignmentItemId,
          user_id: assignmentUserId,
          role_name: assignmentRole.trim(),
          preparation_status: assignmentStatus,
        }, { onConflict: 'lineup_item_id,user_id,role_name' })
      if (saveError) throw saveError
      await recordLineupChange('assignment_updated', {
        lineup_item_id: assignmentItemId,
        user_id: assignmentUserId,
        role_name: assignmentRole.trim(),
        preparation_status: assignmentStatus,
      })
      await loadLineup(lineup.id)
      setAssignmentRole('')
      setNotice('Service assignment saved.')
    } catch (assignmentError) {
      console.error('Error saving lineup assignment:', assignmentError)
      setError('Unable to save the service assignment.')
    } finally {
      setSaving(false)
    }
  }

  async function updateAssignmentStatus(
    assignment: LineupAssignment,
    preparationStatus: LineupAssignment['preparation_status'],
  ) {
    if (!teamId || !lineup || (!isLeader && assignment.user_id !== user?.id)) return
    setSaving(true)
    setError(null)
    const { error: updateError } = await supa
      .from('lineup_assignments')
      .update({ preparation_status: preparationStatus, updated_at: new Date().toISOString() })
      .eq('id', assignment.id)
      .eq('team_id', teamId)
    if (updateError) {
      setError('Unable to update preparation status.')
      setSaving(false)
      return
    }
    await loadLineup(lineup.id)
    setSaving(false)
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
    if (!lineup || !teamId || !user?.id || !isLeader || lineup.status !== 'draft') return
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
      await supa.from('lineup_change_history').insert({
        team_id: teamId,
        lineup_id: lineup.id,
        changed_by: user.id,
        action: 'published',
        details: { service_date: lineup.service_date, version: lineup.version },
      })

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

  if (loading) {
    return <div className="page-container"><h2>Weekly Lineup</h2><LoadingSkeleton rows={5} label="Loading lineups" /></div>
  }

  return (
    <div className="page-container">
      <h2>Weekly Lineup</h2>
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      {notice && <StatusMessage tone="success">{notice}</StatusMessage>}

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

      {!lineup && !isLeader && (
        <EmptyState title="No published lineup found">
          Your team’s published service lineups will appear here.
        </EmptyState>
      )}

      {lineup && (
        <>
          <h3>{lineup.title} — {lineup.service_date}</h3>
          <p>Status: {lineup.status} · Revision {lineup.version}</p>
          {lineup.songs.length === 0 ? (
            <EmptyState title="This lineup has no songs yet">
              {isLeader && lineup.status === 'draft'
                ? 'Search the catalog below to add songs to this draft.'
                : 'The service team has not added songs to this lineup.'}
            </EmptyState>
          ) : (
          <div className="table-scroll" role="region" aria-label="Lineup songs" tabIndex={0}>
          <table className="table responsive-table lineup-table">
            <thead>
              <tr><th>#</th><th>Song</th><th>Key</th><th>Tempo</th><th>Arrangement</th><th>Transition</th>{isLeader && lineup.status === 'draft' && <th>Actions</th>}</tr>
            </thead>
            <tbody>
              {lineup.songs.map((item, index) => (
                <tr
                  key={item.id}
                  draggable={isLeader && lineup.status === 'draft'}
                  onDragStart={() => setDraggedItemId(item.id)}
                  onDragOver={(event) => {
                    if (isLeader && lineup.status === 'draft') event.preventDefault()
                  }}
                  onDrop={() => {
                    if (!draggedItemId || draggedItemId === item.id) return
                    const draggedIndex = lineup.songs.findIndex((candidate) => candidate.id === draggedItemId)
                    if (draggedIndex < 0) return
                    const reordered = [...lineup.songs]
                    const [dragged] = reordered.splice(draggedIndex, 1)
                    if (!dragged) return
                    reordered.splice(index, 0, dragged)
                    setDraggedItemId(null)
                    void reorderItems(reordered)
                  }}
                  onDragEnd={() => setDraggedItemId(null)}
                >
                  <td>{index + 1}</td>
                  <td>{(Array.isArray(item.song) ? item.song[0] : item.song)?.title ?? 'Unknown'}</td>
                  <td>{item.key_override ?? (Array.isArray(item.song) ? item.song[0] : item.song)?.key_signature ?? '—'}</td>
                  <td>{item.tempo_override ?? (Array.isArray(item.song) ? item.song[0] : item.song)?.tempo_bpm ?? '—'}</td>
                  <td>{(Array.isArray(item.selected_arrangement) ? item.selected_arrangement[0] : item.selected_arrangement)?.arrangement_name ?? '—'}</td>
                  <td>{item.transition_notes || '—'}</td>
                  {isLeader && lineup.status === 'draft' && (
                    <td>
                      <button type="button" onClick={() => void moveItem(index, -1)} disabled={index === 0} aria-label={`Move ${((Array.isArray(item.song) ? item.song[0] : item.song)?.title ?? 'song')} up`}>↑</button>
                      <button type="button" onClick={() => void moveItem(index, 1)} disabled={index === lineup.songs.length - 1} aria-label={`Move ${((Array.isArray(item.song) ? item.song[0] : item.song)?.title ?? 'song')} down`}>↓</button>
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
          </div>
          )}

          {(isLeader || lineupAssignments.length > 0) && (
            <section className="card lineup-assignment-card">
              <h3>Service assignments</h3>
              {lineupAssignments.length > 0 ? (
                <ul className="lineup-assignment-list">
                  {lineupAssignments.map((assignment) => {
                    const item = lineup.songs.find((song) => song.id === assignment.lineup_item_id)
                    const member = teamMembers.find((candidate) => candidate.user_id === assignment.user_id)
                    const songTitle = item
                      ? (Array.isArray(item.song) ? item.song[0] : item.song)?.title
                      : 'Lineup song'
                    const canUpdate = isLeader || assignment.user_id === user?.id
                    return (
                      <li key={assignment.id}>
                        <div>
                          <strong>{member?.display_name ?? 'Team member'}</strong>
                          <span>{assignment.role_name} · {songTitle}</span>
                        </div>
                        {canUpdate ? (
                          <select
                            value={assignment.preparation_status}
                            onChange={(event) => void updateAssignmentStatus(
                              assignment,
                              event.target.value as LineupAssignment['preparation_status'],
                            )}
                            disabled={saving}
                          >
                            <option value="pending">Pending</option>
                            <option value="ready">Ready</option>
                            <option value="needs_help">Needs help</option>
                          </select>
                        ) : (
                          <span>{assignment.preparation_status.replace('_', ' ')}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p>No assignments have been added for this lineup.</p>
              )}

              {isLeader && lineup.status === 'draft' && (
                <form className="lineup-assignment-form" onSubmit={(event) => void saveAssignment(event)}>
                  <label>
                    Song
                    <select value={assignmentItemId} onChange={(event) => setAssignmentItemId(event.target.value)} required>
                      <option value="">Choose a lineup song</option>
                      {lineup.songs.map((item) => {
                        const songTitle = (Array.isArray(item.song) ? item.song[0] : item.song)?.title
                        return <option key={item.id} value={item.id}>{songTitle ?? 'Unknown song'}</option>
                      })}
                    </select>
                  </label>
                  <label>
                    Member
                    <select value={assignmentUserId} onChange={(event) => {
                      setAssignmentUserId(event.target.value)
                      const member = teamMembers.find((candidate) => candidate.user_id === event.target.value)
                      if (!assignmentRole && member?.musical_roles.length) {
                        setAssignmentRole(String(member.musical_roles[0]))
                      }
                    }} required>
                      <option value="">Choose a member</option>
                      {teamMembers.map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                          {member.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Role
                    <input
                      value={assignmentRole}
                      onChange={(event) => setAssignmentRole(event.target.value)}
                      placeholder="Lead guitar"
                      required
                    />
                  </label>
                  <label>
                    Preparation
                    <select
                      value={assignmentStatus}
                      onChange={(event) => setAssignmentStatus(event.target.value as LineupAssignment['preparation_status'])}
                    >
                      <option value="pending">Pending</option>
                      <option value="ready">Ready</option>
                      <option value="needs_help">Needs help</option>
                    </select>
                  </label>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? 'Saving…' : 'Save assignment'}
                  </button>
                </form>
              )}
            </section>
          )}

          {isLeader && lineup.status === 'draft' && (
            <>
              <section className="card lineup-batch-picker">
                <h3>Add multiple songs</h3>
                <label>
                  Search catalog
                  <input
                    type="search"
                    value={lineupSongSearch}
                    onChange={(event) => setLineupSongSearch(event.target.value)}
                    placeholder="Search by song, key, or arrangement"
                  />
                </label>
                <div className="lineup-song-options">
                  {catalogSongs
                    .filter((song) =>
                      [
                        song.title,
                        song.artist,
                        song.key_signature,
                        ...song.arrangements.map((arrangement) => arrangement.arrangement_name),
                      ].some((value) => value?.toLocaleLowerCase().includes(lineupSongSearch.trim().toLocaleLowerCase()))
                    )
                    .filter((song) => !lineup.songs.some((item) => item.song_id === song.id))
                    .map((song) => (
                      <label className="lineup-song-option" key={song.id}>
                        <input
                          type="checkbox"
                          checked={selectedBatchSongIds.includes(song.id)}
                          onChange={(event) => setSelectedBatchSongIds((current) =>
                            event.target.checked
                              ? [...current, song.id]
                              : current.filter((songId) => songId !== song.id)
                          )}
                        />
                        <span>{song.title}{song.key_signature ? ` · ${song.key_signature}` : ''}</span>
                      </label>
                    ))}
                  {catalogSongs
                    .filter((song) => [
                      song.title,
                      song.artist,
                      song.key_signature,
                      ...song.arrangements.map((arrangement) => arrangement.arrangement_name),
                    ].some((value) => value?.toLocaleLowerCase().includes(lineupSongSearch.trim().toLocaleLowerCase())))
                    .filter((song) => !lineup.songs.some((item) => item.song_id === song.id)).length === 0 && (
                    <p className="lineup-no-results">No available songs match this search.</p>
                  )}
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void addSelectedSongs()}
                  disabled={saving || selectedBatchSongIds.length === 0}
                >
                  {saving ? 'Adding…' : `Add selected (${selectedBatchSongIds.length})`}
                </button>
              </section>
              <form className="card" onSubmit={(event) => void saveLineupItem(event)}>
              <h3>{editingItemId ? 'Edit lineup item' : 'Add one song with details'}</h3>
              {!editingItemId && (
                <label>
                  Song
                  <select value={selectedSongId} onChange={(event) => {
                    setSelectedSongId(event.target.value)
                    setSelectedArrangementId('')
                  }} required>
                    <option value="">Choose a song</option>
                    {catalogSongs
                      .filter((song) => !lineup.songs.some((item) => item.song_id === song.id))
                      .map((song) => <option key={song.id} value={song.id}>{song.title}</option>)}
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
            </>
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
          {lineupHistory.length > 0 && (
            <section className="card lineup-history">
              <h3>Change history</h3>
              <ul>
                {lineupHistory.map((change) => (
                  <li key={change.id}>
                    <strong>{change.action.replace(/_/g, ' ')}</strong>
                    {' · '}
                    {new Date(change.created_at).toLocaleString()}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
