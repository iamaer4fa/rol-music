import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supa } from '../lib/supabase'
import { useAuth } from '../hooks/use-auth'
import SongContributions from './SongContributions'
import ChordProViewer from '../components/ChordProViewer'
import EmptyState from '../components/EmptyState'
import LoadingSkeleton from '../components/LoadingSkeleton'
import StatusMessage from '../components/StatusMessage'
import '../App.css'
import { readApplicationCache, saveApplicationCache } from '../lib/offline'

type SongRecord = {
  id: string
  team_id: string
  title: string
  artist: string | null
  key_signature: string | null
  tempo_bpm: number | null
  time_signature: string | null
  revision: number
  is_active: boolean
  chordpro_lyrics: string
  song_notes: string | null
  tags: Array<{ id: string; tag_name: string }>
  arrangements: Array<{
    id: string
    arrangement_name: string
    key: string | null
    capo_position: number
    tempo_override: number | null
    performance_notes: string | null
  }>
  media: Array<{
    id: string
    media_type: string
    external_url: string | null
    local_file_reference: string | null
    description: string | null
    attribution: string | null
  }>
}

export default function SongDetail() {
  const { user, teamId, getTeamMembership } = useAuth()
  const { id } = useParams<{ id: string }>()
  const [song, setSong] = useState<SongRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cacheUpdatedAt, setCacheUpdatedAt] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const userId = user?.id

    async function loadSong() {
      if (!userId || !id) {
        setSong(null)
        setError(!userId ? 'Sign in to view this song.' : 'The song link is missing its ID.')
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      setSong(null)
      try {
        const membership = teamId ? null : await getTeamMembership()
        const activeTeamId = teamId ?? membership?.teamId
        if (!activeTeamId) {
          throw new Error('Your account does not have an active team membership.')
        }

        const cached = await readApplicationCache<SongRecord>(
          activeTeamId,
          `song:${id}`,
        ).catch(() => null)
        if (active && cached) {
          setSong(cached.data)
          setCacheUpdatedAt(cached.updatedAt)
        }

        const { data, error: songError } = await supa
          .from('songs')
          .select(`
            *,
            tag_links:songs_tags(tag:song_tags(id, tag_name)),
            arrangements:song_arrangements(*),
            media:song_media(id, media_type, external_url, local_file_reference, description, attribution)
          `)
          .eq('id', id)
          .eq('team_id', activeTeamId)
          .maybeSingle()

        if (songError) throw songError
        if (!data) {
          throw new Error('This song was not found or is not available to your team.')
        }

        const tags = (data.tag_links ?? []).flatMap((link: { tag?: unknown }) => {
          if (Array.isArray(link.tag)) return link.tag
          return link.tag ? [link.tag] : []
        })
        if (active) {
          const mappedSong = {
            ...data,
            tags,
            arrangements: data.arrangements ?? [],
            media: data.media ?? [],
          } as SongRecord
          setSong(mappedSong)
          setCacheUpdatedAt(new Date().toISOString())
          await saveApplicationCache(activeTeamId, `song:${id}`, mappedSong)
        }
      } catch (loadError) {
        console.error('Error loading song details:', loadError)
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load this song. Check your team membership and database setup.'
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadSong()
    return () => {
      active = false
    }
  }, [user?.id, teamId, id, getTeamMembership])

  if (loading) {
    return <div className="page-container"><h2>Song details</h2><LoadingSkeleton rows={4} label="Loading song details" /></div>
  }

  if (error || !song) {
    return (
      <div className="page-container">
        <h2>Song unavailable</h2>
        <StatusMessage tone="error">{error ?? 'This song could not be found.'}</StatusMessage>
        <Link to="/catalog" className="btn-primary">Back to Catalog</Link>
      </div>
    )
  }

  return (
    <div className="page-container">
      <h2>{song.title}</h2>
      {cacheUpdatedAt && (
        <p className="cache-status">
          Song cached {new Date(cacheUpdatedAt).toLocaleString()}
          {!navigator.onLine ? ' · Showing offline cache' : ''}
        </p>
      )}

      <section className="card">
        <h3>Metadata</h3>
        <p><strong>Artist:</strong> {song.artist || 'Unknown'}</p>
        <p><strong>Key:</strong> {song.key_signature ?? '—'}</p>
        <p><strong>Tempo:</strong> {song.tempo_bpm ? `${song.tempo_bpm} BPM` : 'Not set'}</p>
        <p><strong>Time Signature:</strong> {song.time_signature ?? 'Not set'}</p>
        <p><strong>Revision:</strong> {song.revision}</p>
        <p><strong>Status:</strong> {song.is_active ? 'Active' : 'Archived'}</p>
        {song.song_notes && <p><strong>Notes:</strong> {song.song_notes}</p>}
      </section>

      <ChordProViewer
        source={song.chordpro_lyrics}
        defaultKey={song.key_signature}
      />

      {song.arrangements.length > 0 && (
        <section className="card">
          <h3>Arrangements</h3>
          <ul>
            {song.arrangements.map((arrangement) => (
              <li key={arrangement.id}>
                <strong>{arrangement.arrangement_name}</strong>
                {arrangement.key ? ` (${arrangement.key})` : ''}
                {` · Capo ${arrangement.capo_position}`}
                {arrangement.tempo_override ? ` · ${arrangement.tempo_override} BPM` : ''}
                {arrangement.performance_notes && <p>{arrangement.performance_notes}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {song.tags.length > 0 && (
        <section className="card">
          <h3>Tags</h3>
          <ul>
            {song.tags.map((tag) => <li key={tag.id}>{tag.tag_name}</li>)}
          </ul>
        </section>
      )}

      <section className="card">
        <h3>Audio and Media</h3>
        {song.media.length > 0 ? (
          <ul>
            {song.media.map((media) => (
              <li key={media.id}>
                {media.description || (media.local_file_reference ? 'Shared uploaded audio' : media.media_type)}
                {media.attribution && ` — ${media.attribution}`}
                {media.external_url && (
                  <>
                    {' · '}
                    <a href={media.external_url} target="_blank" rel="noreferrer">
                      Open media
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No shared audio attached yet">
            A team member can add a media link or shared audio from this page.
          </EmptyState>
        )}
      </section>

      {user?.id && (
        <SongContributions
          songId={song.id}
          teamId={song.team_id}
          onMediaAdded={(media) => setSong((current) =>
            current ? { ...current, media: [...current.media, media] } : current
          )}
          onArrangementAdded={(arrangement) => setSong((current) =>
            current ? { ...current, arrangements: [...current.arrangements, arrangement] } : current
          )}
        />
      )}

      <div className="song-detail-actions">
        <Link to={`/practice/${song.id}`} className="btn-primary">
          Open Practice Board
        </Link>
        <Link to="/catalog" className="btn-primary">
          Back to Catalog
        </Link>
      </div>
    </div>
  )
}
