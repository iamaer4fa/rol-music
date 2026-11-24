import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supa } from '../lib/supabase'
import { useAuth } from '../hooks/use-auth'
import { useNavigate } from 'react-router-dom'
import { classifyMediaUrl } from '../lib/media'
import { readApplicationCache, saveApplicationCache } from '../lib/offline'
import type { SongRecord } from '../lib/models'
import { canManageTeam } from '../lib/roles'
import { filterCatalogSongs, sortCatalogSongs, type CatalogSortDirection, type CatalogSortField } from '../lib/catalog'
import EmptyState from '../components/EmptyState'
import LoadingSkeleton from '../components/LoadingSkeleton'
import StatusMessage from '../components/StatusMessage'
import '../App.css'

export default function SongCatalog() {
  const { user, teamId, accessRole } = useAuth()
  const navigate = useNavigate()
  const [songs, setSongs] = useState<SongRecord[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [sortField, setSortField] = useState<CatalogSortField>('title')
  const [sortDirection, setSortDirection] = useState<CatalogSortDirection>('asc')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingSongId, setEditingSongId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [keySignature, setKeySignature] = useState('C')
  const [tempo, setTempo] = useState('')
  const [timeSignature, setTimeSignature] = useState('4/4')
  const [lyrics, setLyrics] = useState('')
  const [songNotes, setSongNotes] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [arrangementName, setArrangementName] = useState('')
  const [arrangementKey, setArrangementKey] = useState('')
  const [capoPosition, setCapoPosition] = useState('0')
  const [arrangementTempo, setArrangementTempo] = useState('')
  const [performanceNotes, setPerformanceNotes] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [audioDescription, setAudioDescription] = useState('')
  const [cacheUpdatedAt, setCacheUpdatedAt] = useState<string | null>(null)
  const isLeader = canManageTeam(accessRole)

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
      const activeTeamId = teamId
      if (!activeTeamId) return
      setLoading(true)
      setLoadError(null)
      const cached = await readApplicationCache<SongRecord[]>(
        activeTeamId,
        'songs:all',
      ).catch(() => null)
      let hasCachedSongs = false
      if (!cancelled && cached) {
        hasCachedSongs = true
        setSongs(cached.data)
        setCacheUpdatedAt(cached.updatedAt)
      }
      try {
        const query = supa
          .from('songs')
          .select('*, tag_links:songs_tags(tag:song_tags(id, tag_name)), arrangements:song_arrangements(id, arrangement_name, key, capo_position, tempo_override, performance_notes)')
          .eq('team_id', activeTeamId)
          .eq('is_active', true)
        const { data, error } = await query.order('title', { ascending: true })
        if (error) throw error
        if (!cancelled) {
          const mappedSongs = (data ?? []).map((song) => ({
            ...song,
            arrangements: song.arrangements ?? [],
            tags: song.tag_links?.flatMap((link: { tag?: { id: string; tag_name: string } | Array<{ id: string; tag_name: string }> }) => {
              if (Array.isArray(link.tag)) return link.tag
              return link.tag ? [link.tag] : []
            }) ?? [],
          }))
          setSongs(mappedSongs)
          setCacheUpdatedAt(new Date().toISOString())
          try {
            await saveApplicationCache(activeTeamId, 'songs:all', mappedSongs)
          } catch (cacheError) {
            console.error('Unable to update the song catalog cache:', cacheError)
            setLoadError('Catalog loaded, but the offline copy could not be updated.')
          }
        }
      } catch (err) {
        console.error('Error loading songs:', err)
        if (!cancelled) {
          if (!hasCachedSongs) setSongs([])
          setLoadError(
            hasCachedSongs
              ? 'Unable to refresh the catalog. Showing your saved copy.'
              : 'Unable to load songs. Check your team membership and database setup.'
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadSongs()
    return () => {
      cancelled = true
    }
  }, [user?.id, teamId])

  const sortedSongs = useMemo(
    () => sortCatalogSongs(
      filterCatalogSongs(songs, { query: searchQuery, tag: selectedTag, key: selectedKey }),
      sortField,
      sortDirection,
    ),
    [searchQuery, selectedKey, selectedTag, sortDirection, sortField, songs],
  )

  async function createSong(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user?.id || !teamId || !isLeader) return
    const bpm = tempo.trim() ? Number(tempo) : null
    if (bpm !== null && (!Number.isInteger(bpm) || bpm <= 0)) {
      setFormError('Tempo must be a positive whole number.')
      return
    }
    const capo = Number(capoPosition)
    const arrangementBpm = arrangementTempo.trim() ? Number(arrangementTempo) : null
    if (!Number.isInteger(capo) || capo < 0) {
      setFormError('Capo position must be a whole number greater than or equal to zero.')
      return
    }
    if (arrangementBpm !== null && (!Number.isInteger(arrangementBpm) || arrangementBpm <= 0)) {
      setFormError('Arrangement tempo must be a positive whole number.')
      return
    }
    let normalizedAudioUrl: string | null = null
    if (audioUrl.trim()) {
      try {
        const parsedUrl = new URL(audioUrl.trim())
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Unsupported protocol')
        normalizedAudioUrl = parsedUrl.toString()
      } catch {
        setFormError('Audio URL must be a valid HTTP or HTTPS address.')
        return
      }
    }

    setSaving(true)
    setFormError(null)
    setSaveNotice(null)
    try {
        const songValues = {
          title: title.trim(),
          artist: artist.trim() || null,
          key_signature: keySignature,
          tempo_bpm: bpm,
          time_signature: timeSignature.trim(),
          chordpro_lyrics: lyrics.trim(),
          song_notes: songNotes.trim() || null,
      }
      let song: SongRecord
      if (editingSongId) {
        const existingSong = songs.find((item) => item.id === editingSongId)
        if (!existingSong) throw new Error('The song being edited is no longer available.')
        const { data, error: songError } = await supa
          .from('songs')
          .update({
            ...songValues,
            revision: existingSong.revision + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingSongId)
          .eq('team_id', teamId)
          .select('*')
          .single()
        if (songError) throw songError
        song = data
        setSongs((current) => current.map((item) =>
          item.id === song.id ? { ...song, tags: item.tags ?? [] } : item
        ))
        setSaveNotice('Song updated as a new catalog revision.')
      } else {
        const { data, error: songError } = await supa
          .from('songs')
          .insert({ ...songValues, team_id: teamId })
          .select('*')
          .single()
        if (songError) throw songError
        song = data
        setSongs((current) => [{ ...song, tags: [] }, ...current])
      }

      const supportingContentErrors: string[] = []
      let savedTagNames: string[] = []
      if (!editingSongId && tags.length > 0) {
        const { data: tagRows, error: tagsError } = await supa
          .from('song_tags')
          .select('id, tag_name')
          .in('tag_name', tags)
        if (tagsError) {
          supportingContentErrors.push(`tags: ${tagsError.message}`)
        } else {
          const foundTags = tagRows ?? []
          if (foundTags.length !== tags.length) {
            supportingContentErrors.push('one or more selected tags were not found')
          }
          if (foundTags.length > 0) {
            const { error: linkError } = await supa.from('songs_tags').insert(
              foundTags.map((tag) => ({
                team_id: teamId,
                song_id: song.id,
                tag_id: tag.id,
              }))
            )
            if (linkError) {
              supportingContentErrors.push(`tags: ${linkError.message}`)
            } else {
              savedTagNames = foundTags.map((tag) => tag.tag_name)
            }
          }
        }
      }

      if (!editingSongId && arrangementName.trim()) {
        const { error: arrangementError } = await supa.from('song_arrangements').insert({
          team_id: teamId,
          song_id: song.id,
          arrangement_name: arrangementName.trim(),
          key: arrangementKey.trim() || keySignature,
          capo_position: capo,
          tempo_override: arrangementBpm,
          performance_notes: performanceNotes.trim() || null,
        })
        if (arrangementError) supportingContentErrors.push(`arrangement: ${arrangementError.message}`)
      }

      if (!editingSongId && normalizedAudioUrl) {
        const { error: mediaError } = await supa.from('song_media').insert({
          team_id: teamId,
          song_id: song.id,
          media_type: classifyMediaUrl(normalizedAudioUrl),
          external_url: normalizedAudioUrl,
          description: audioDescription.trim() || null,
        })
        if (mediaError) supportingContentErrors.push(`audio link: ${mediaError.message}`)
      }

      if (!editingSongId) {
        setSongs((current) => current.map((item) =>
          item.id === song.id
            ? { ...song, tags: savedTagNames.map((tag_name) => ({ tag_name })) }
            : item
        ))
      }
      setTitle('')
      setArtist('')
      setKeySignature('C')
      setTempo('')
      setTimeSignature('4/4')
      setLyrics('')
      setSongNotes('')
      setTags([])
      setEditingSongId(null)
      setArrangementName('')
      setArrangementKey('')
      setCapoPosition('0')
      setArrangementTempo('')
      setPerformanceNotes('')
      setAudioUrl('')
      setAudioDescription('')
      setShowCreateForm(false)
      setSaveNotice(
        editingSongId
          ? 'Song updated as a new catalog revision.'
          : supportingContentErrors.length
            ? `Song saved, but some optional content failed: ${supportingContentErrors.join('; ')}.`
            : 'Song and selected content saved.'
      )
    } catch (saveError) {
      console.error('Error saving song:', saveError)
      setFormError(saveError instanceof Error ? saveError.message : 'Unable to save the song.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-container">
      <h2>Song Catalog</h2>
      {cacheUpdatedAt && (
        <p className="cache-status" role="status">
          Catalog cached {new Date(cacheUpdatedAt).toLocaleString()}
          {!navigator.onLine ? ' · Showing offline cache' : ''}
        </p>
      )}
      {saveNotice && <StatusMessage tone="success">{saveNotice}</StatusMessage>}
      {isLeader && (
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setShowCreateForm((open) => !open)
            if (showCreateForm) setEditingSongId(null)
          }}
        >
          {showCreateForm ? 'Cancel' : 'Add Song'}
        </button>
      )}
      {showCreateForm && isLeader && (
        <form className="card" onSubmit={(event) => void createSong(event)}>
          <h3>{editingSongId ? 'Edit song' : 'New song'}</h3>
          {formError && <StatusMessage tone="error">{formError}</StatusMessage>}
          <label>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={255} required />
          </label>
          <label>
            Artist / source
            <input value={artist} onChange={(event) => setArtist(event.target.value)} maxLength={255} />
          </label>
          <label>
            Key
            <input value={keySignature} onChange={(event) => setKeySignature(event.target.value)} maxLength={50} required />
          </label>
          <label>
            Tempo (BPM)
            <input type="number" min="1" step="1" value={tempo} onChange={(event) => setTempo(event.target.value)} />
          </label>
          <label>
            Time signature
            <input value={timeSignature} onChange={(event) => setTimeSignature(event.target.value)} maxLength={20} required />
          </label>
          <label>
            ChordPro lyrics and chords
            <textarea value={lyrics} onChange={(event) => setLyrics(event.target.value)} rows={8} required />
          </label>
          <label>
            Song notes
            <textarea value={songNotes} onChange={(event) => setSongNotes(event.target.value)} rows={3} />
          </label>
          {!editingSongId && <h4>Optional arrangement</h4>}
          {!editingSongId && <>
          <label>
            Arrangement name
            <input value={arrangementName} onChange={(event) => setArrangementName(event.target.value)} maxLength={255} />
          </label>
          <label>
            Arrangement key
            <input value={arrangementKey} onChange={(event) => setArrangementKey(event.target.value)} maxLength={50} />
          </label>
          <label>
            Capo position
            <input type="number" min="0" step="1" value={capoPosition} onChange={(event) => setCapoPosition(event.target.value)} />
          </label>
          <label>
            Arrangement tempo override
            <input type="number" min="1" step="1" value={arrangementTempo} onChange={(event) => setArrangementTempo(event.target.value)} />
          </label>
          <label>
            Performance notes
            <textarea value={performanceNotes} onChange={(event) => setPerformanceNotes(event.target.value)} rows={3} />
          </label>
          <h4>Optional audio or media link</h4>
          <label>
            HTTP(S) media URL
            <input type="url" value={audioUrl} onChange={(event) => setAudioUrl(event.target.value)} />
          </label>
          <label>
            Media description
            <input value={audioDescription} onChange={(event) => setAudioDescription(event.target.value)} maxLength={255} />
          </label>
          <label>
            Tags
            <select
              multiple
              value={tags}
              onChange={(event) => setTags(Array.from(event.target.selectedOptions, (option) => option.value))}
            >
              {['Worship', 'Praise', 'Christmas', 'Easter', 'Communion', 'Opening', 'Closing', 'Special Service'].map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </label>
          </>}
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : editingSongId ? 'Save Song Changes' : 'Save Song'}
          </button>
          {editingSongId && (
            <button type="button" onClick={() => {
              setEditingSongId(null)
              setShowCreateForm(false)
              setFormError(null)
            }}>
              Cancel
            </button>
          )}
        </form>
      )}

      <div className="card catalog-filters">
        <h3>Search & Filter</h3>
        <div className="catalog-filter-grid">
          <label>
            Search songs and arrangements
            <input
              type="search"
              placeholder="Title, artist, arrangement, key, or notes"
              aria-label="Search songs and arrangements"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
          <label>
            Tag
            <select
              aria-label="Filter songs by tag"
              value={selectedTag ?? ''}
              onChange={(e) => setSelectedTag(e.target.value || null)}
            >
              <option value="">All Tags</option>
              {['Worship', 'Praise', 'Christmas', 'Easter', 'Communion', 'Opening', 'Closing', 'Special Service'].map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </label>
          <label>
            Key
            <select
              aria-label="Filter songs by key"
              value={selectedKey ?? ''}
              onChange={(e) => setSelectedKey(e.target.value || null)}
            >
              <option value="">All Keys</option>
              {[...new Set(songs.map((song) => song.key_signature).filter((key): key is string => Boolean(key)))]
                .sort((left, right) => left.localeCompare(right))
                .map((key) => <option key={key}>{key}</option>)}
            </select>
          </label>
          <label>
            Sort by
            <select value={sortField} onChange={(event) => setSortField(event.target.value as CatalogSortField)}>
              <option value="title">Title</option>
              <option value="artist">Artist</option>
              <option value="key">Key</option>
              <option value="tempo">Tempo</option>
            </select>
          </label>
          <label className="catalog-sort-direction">
            Sort direction
            <select
              value={sortDirection}
              onChange={(event) => setSortDirection(event.target.value as CatalogSortDirection)}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
        </div>
        <p className="filter-result-count" role="status" aria-live="polite">
          {sortedSongs.length} {sortedSongs.length === 1 ? 'song' : 'songs'}
        </p>
      </div>

      {loading && songs.length === 0 ? (
        <LoadingSkeleton rows={5} label="Loading song catalog" />
      ) : (
        <>
        {loadError && <StatusMessage tone={songs.length ? 'warning' : 'error'}>{loadError}</StatusMessage>}
        {sortedSongs.length === 0 ? (
          <EmptyState
            title={loadError ? 'Catalog unavailable' : songs.length ? 'No songs match these filters' : 'Your song catalog is empty'}
          >
            {loadError
              ? 'Check your connection or team access, then try again.'
              : songs.length
                ? 'Try another search term or clear one or more filters.'
                : 'Ask a Worship Leader to add songs to the catalog.'}
          </EmptyState>
        ) : (
        <ul className="song-list" aria-label="Songs">
          {sortedSongs.map((song) => (
            <li key={song.id} className="song-list-item">
              <div className="song-list-summary">
                <strong>{song.title}</strong>
                <span>{song.artist || 'Artist not set'}{song.key_signature ? ` · ${song.key_signature}` : ''}{song.tempo_bpm ? ` · ${song.tempo_bpm} BPM` : ''}</span>
              </div>
              {(song.arrangements ?? []).length > 0 && (
                <details className="song-arrangement-preview">
                  <summary>Arrangements ({song.arrangements?.length})</summary>
                  <ul>
                    {song.arrangements?.map((arrangement) => (
                      <li key={arrangement.id}>
                        <strong>{arrangement.arrangement_name}</strong>
                        <span>
                          {arrangement.key ? ` · ${arrangement.key}` : ''}
                          {` · Capo ${arrangement.capo_position}`}
                          {arrangement.tempo_override ? ` · ${arrangement.tempo_override} BPM` : ''}
                        </span>
                        {arrangement.performance_notes && <p>{arrangement.performance_notes}</p>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigate(`/song/${song.id}`)}
                aria-label={`View ${song.title}`}
              >
                View
              </button>
              {isLeader && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingSongId(song.id)
                    setTitle(song.title)
                    setArtist(song.artist ?? '')
                    setKeySignature(song.key_signature ?? 'C')
                    setTempo(song.tempo_bpm?.toString() ?? '')
                    setTimeSignature(song.time_signature ?? '4/4')
                    setLyrics(song.chordpro_lyrics ?? '')
                    setSongNotes(song.song_notes ?? '')
                    setShowCreateForm(true)
                    setSaveNotice(null)
                  }}
                >
                  Edit
                </button>
              )}
            </li>
          ))}
        </ul>
        )}
        </>
      )}
    </div>
  )
}