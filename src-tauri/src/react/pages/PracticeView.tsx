import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Link, useParams } from 'react-router-dom'
import { supa, type PracticeSession } from '../lib/supabase'
import { useAuth } from '../hooks/use-auth'
import { getEmbeddedMediaUrl, parseMediaKind } from '../lib/media'
import ChordProViewer from '../components/ChordProViewer'
import EmptyState from '../components/EmptyState'
import LoadingSkeleton from '../components/LoadingSkeleton'
import StatusMessage from '../components/StatusMessage'
import { downloadForOffline, readOfflineMedia, removeOfflineMedia } from '../lib/offline'
import '../App.css'

type Song = {
  id: string
  team_id: string
  title: string
  artist: string | null
  key_signature: string | null
  tempo_bpm: number | null
  chordpro_lyrics: string
  arrangements: Array<{
    id: string
    arrangement_name: string
    key: string | null
    capo_position: number
    tempo_override: number | null
  }>
  media: Array<{
    id: string
    media_type: string
    external_url: string | null
    local_file_reference: string | null
    description: string | null
  }>
}

type SegmentMetadata = {
  playbackSpeed: number
  loopStartMs: number | null
  loopEndMs: number | null
  arrangementId: string | null
}

export default function PracticeView() {
  const { user, teamId, practiceSharingEnabled, setPracticeSharingEnabled, syncPracticeSession } =
    useAuth()
  const { songId } = useParams<{ songId: string }>()
  const audioRef = useRef<HTMLAudioElement>(null)
  const activeSessionId = useRef<string | null>(null)
  const sharingEnabledRef = useRef(practiceSharingEnabled)
  sharingEnabledRef.current = practiceSharingEnabled
  const segmentMetadata = useRef<SegmentMetadata>({
    playbackSpeed: 1,
    loopStartMs: null,
    loopEndMs: null,
    arrangementId: null,
  })
  const [song, setSong] = useState<Song | null>(null)
  const [loading, setLoading] = useState(true)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [selectedArrangementId, setSelectedArrangementId] = useState('')
  const [selectedMediaId, setSelectedMediaId] = useState('')
  const [mediaPlaybackUrl, setMediaPlaybackUrl] = useState<string | null>(null)
  const [mediaLoading, setMediaLoading] = useState(false)
  const [loopStartMs, setLoopStartMs] = useState<number | null>(null)
  const [loopEndMs, setLoopEndMs] = useState<number | null>(null)
  const [loopRepetitions, setLoopRepetitions] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [audioSource, setAudioSource] = useState<string | null>(null)
  const [audioSourceName, setAudioSourceName] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'private' | 'pending' | 'synced' | 'error'>('idle')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offlineMediaUrl, setOfflineMediaUrl] = useState<string | null>(null)
  const [offlineMediaReady, setOfflineMediaReady] = useState(false)
  const selectedMedia = song?.media.find((media) => media.id === selectedMediaId) ?? null
  const mediaKind = selectedMedia ? parseMediaKind(selectedMedia.media_type) : null
  const selectedAudioUrl = selectedMedia?.external_url && mediaKind === 'audio'
    ? selectedMedia.external_url
    : null
  const source = audioSource ?? offlineMediaUrl ?? (
    selectedMedia?.local_file_reference ? mediaPlaybackUrl : selectedAudioUrl
  )

  useEffect(() => {
    if (!user?.id || !teamId || !songId) {
      audioRef.current?.pause()
      void finishSegment().catch((finishError: unknown) => {
        console.error('Unable to close practice session without an active team:', finishError)
        setError('Unable to save the previous practice session.')
      })
      setSong(null)
      setSelectedMediaId('')
      setSelectedArrangementId('')
      setAudioSource(null)
      setAudioSourceName(null)
      setIsPlaying(false)
      setError(!user?.id ? 'Sign in to practice this song.' : !teamId ? 'Your account has no active team.' : 'The song link is missing its ID.')
      setLoading(false)
      return
    }

    let active = true
    async function loadSong() {
      setLoading(true)
      setError(null)
      audioRef.current?.pause()
      void finishSegment().catch((finishError: unknown) => {
        console.error('Unable to close practice session while changing songs:', finishError)
        if (active) setError('Unable to save the previous practice session.')
      })
      setSong(null)
      setSelectedArrangementId('')
      setSelectedMediaId('')
      setAudioSource(null)
      setAudioSourceName(null)
      setCurrentTime(0)
      setDuration(0)
      setLoopStartMs(null)
      setLoopEndMs(null)
      setLoopRepetitions(0)
      setPlaybackSpeed(1)
      segmentMetadata.current = {
        playbackSpeed: 1,
        loopStartMs: null,
        loopEndMs: null,
        arrangementId: null,
      }
      try {
        const { data: songData, error: songError } = await supa
          .from('songs')
          .select('id, team_id, title, artist, key_signature, tempo_bpm, chordpro_lyrics')
          .eq('id', songId)
          .eq('team_id', teamId)
          .maybeSingle()

        if (songError) {
          throw new Error(`Unable to load this song: ${songError.message}`)
        }
        if (!songData) {
          throw new Error('This song was not found or is not available to your team.')
        }

        const [arrangementsResult, mediaResult] = await Promise.all([
          supa
            .from('song_arrangements')
            .select('id, arrangement_name, key, capo_position, tempo_override')
            .eq('song_id', songId)
            .eq('team_id', teamId)
            .order('created_at', { ascending: false }),
          supa
            .from('song_media')
            .select('id, media_type, external_url, local_file_reference, description')
            .eq('song_id', songId)
            .eq('team_id', teamId)
            .order('created_at', { ascending: false }),
        ])
        if (arrangementsResult.error) {
          throw new Error(`Unable to load song arrangements: ${arrangementsResult.error.message}`)
        }
        if (mediaResult.error) {
          throw new Error(`Unable to load song media: ${mediaResult.error.message}`)
        }
        if (active) {
          const arrangements = arrangementsResult.data ?? []
          const media = mediaResult.data ?? []
          const defaultArrangementId = arrangements[0]?.id ?? ''
          setSong({ ...songData, arrangements, media } as Song)
          setSelectedArrangementId(defaultArrangementId)
          setSelectedMediaId(media[0]?.id ?? '')
          segmentMetadata.current.arrangementId = defaultArrangementId || null
        }
      } catch (loadError) {
        console.error('Error loading practice song:', loadError)
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load this song for practice.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadSong()
    return () => {
      active = false
    }
  }, [user?.id, teamId, songId])

  useEffect(() => {
    if (typeof selectedMedia?.local_file_reference !== 'string') {
      setMediaPlaybackUrl(null)
      setMediaLoading(false)
      return
    }
    const storagePath: string = selectedMedia.local_file_reference

    let active = true
    async function resolveUploadedAudio() {
      setMediaLoading(true)
      try {
        const { data, error: urlError } = await supa.storage
          .from('team-audio')
          .createSignedUrl(storagePath, 3600)
        if (urlError) throw urlError
        if (active) setMediaPlaybackUrl(data.signedUrl)
      } catch (resolveError) {
        console.error('Unable to create a playback URL for uploaded audio:', resolveError)
        if (active) {
          setMediaPlaybackUrl(null)
          setError(resolveError instanceof Error
            ? `Unable to access uploaded audio: ${resolveError.message}`
            : 'Unable to access uploaded audio.')
        }
      } finally {
        if (active) setMediaLoading(false)
      }
    }

    void resolveUploadedAudio()
    return () => {
      active = false
    }
  }, [selectedMedia?.id, selectedMedia?.local_file_reference])

  useEffect(() => {
    if (!selectedMedia || !teamId) {
      setOfflineMediaUrl(null)
      setOfflineMediaReady(false)
      return
    }
    const cacheKey = `offline-media:${teamId}:${selectedMedia.id}`
    void readOfflineMedia(cacheKey).then((url) => {
      setOfflineMediaUrl(url)
      setOfflineMediaReady(Boolean(url))
    })
  }, [selectedMedia?.id, teamId])

  const saveFinishedSegment = useCallback(async (sessionId: string) => {
    const session = await invoke<PracticeSession | null>('finish_practice_segment', {
      sessionId,
      endedAt: new Date().toISOString(),
      sharingEnabled: practiceSharingEnabled,
    })
    if (!session) return

    setSyncStatus(session.sync_state === 'pending' ? 'pending' : 'private')
    setStatusMessage(
      session.sync_state === 'pending'
        ? 'Practice saved locally; synchronization is pending.'
        : 'Practice saved privately on this device.'
    )
    if (session.sync_state !== 'pending' || !navigator.onLine) return

    void syncPracticeSession(session)
      .then((result) => {
        if (result.success) {
          setSyncStatus('synced')
          setStatusMessage(
            result.alreadyExists
              ? 'This matching session was already synchronized.'
              : 'Practice saved and synchronized.'
          )
        } else {
          setSyncStatus('error')
          setStatusMessage(result.error ?? 'Practice is saved locally and synchronization failed.')
        }
      })
      .catch((syncError: unknown) => {
        console.error('Unable to synchronize practice session:', syncError)
        setSyncStatus('error')
        setStatusMessage('Practice is saved locally; synchronization will retry later.')
      })
  }, [practiceSharingEnabled, syncPracticeSession])

  const finishSegment = useCallback(async () => {
    const sessionId = activeSessionId.current
    activeSessionId.current = null
    if (sessionId) await saveFinishedSegment(sessionId)
  }, [saveFinishedSegment])

  const beginSegment = useCallback(async (
    audio: HTMLAudioElement,
    metadata: SegmentMetadata,
  ) => {
    if (
      activeSessionId.current ||
      !song ||
      !songId ||
      !user?.id ||
      !teamId ||
      audio.paused ||
      audio.ended
    ) return
    const deviceId = localStorage.getItem('device_id') ?? crypto.randomUUID()
    localStorage.setItem('device_id', deviceId)
    const sessionId = crypto.randomUUID()
    await invoke('start_practice_segment', {
      session: {
        sessionId,
        teamId,
        userId: user.id,
        songId,
        arrangementId: metadata.arrangementId,
        lineupItemId: null,
        deviceId,
        startedAt: new Date().toISOString(),
        playbackSpeed: metadata.playbackSpeed,
        loopStartMs: metadata.loopStartMs,
        loopEndMs: metadata.loopEndMs,
      },
    })
    activeSessionId.current = sessionId
    segmentMetadata.current = metadata
  }, [song, songId, teamId, user?.id])

  const rollSegment = useCallback(async (metadata: SegmentMetadata) => {
    const audio = audioRef.current
    const wasPlaying = audio !== null && !audio.paused && !audio.ended
    await finishSegment()
    if (wasPlaying && audio) await beginSegment(audio, metadata)
  }, [beginSegment, finishSegment])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const timer = window.setInterval(() => {
      const sessionId = activeSessionId.current
      if (!sessionId) return
      void invoke('sample_practice_playback', {
        sessionId,
        positionSeconds: audio.currentTime,
        isPlaying: !audio.paused && !audio.ended,
        isSeeking: audio.seeking,
        isBuffering: isBuffering || audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA,
      }).catch((sampleError: unknown) => {
        console.error('Unable to measure audio playback:', sampleError)
        setError('Playback measurement stopped. Pause and resume the audio to try again.')
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [source, isBuffering])

  useEffect(() => {
    if (!audioSource?.startsWith('blob:')) return
    return () => {
      URL.revokeObjectURL(audioSource)
    }
  }, [audioSource])

  useEffect(() => {
    return () => {
      const sessionId = activeSessionId.current
      activeSessionId.current = null
      if (sessionId) {
        void invoke('finish_practice_segment', {
          sessionId,
          endedAt: new Date().toISOString(),
          sharingEnabled: sharingEnabledRef.current,
        }).catch((finishError: unknown) => {
          console.error('Unable to save practice segment:', finishError)
        })
      }
    }
  }, [])

  function onAudioPlay() {
    const audio = audioRef.current
    if (audio) void beginSegment(audio, segmentMetadata.current).catch((startError: unknown) => {
      console.error('Unable to start practice measurement:', startError)
      setError('Unable to start local practice measurement.')
      audio.pause()
    })
    setIsPlaying(true)
    setIsBuffering(true)
  }

  function onAudioPause() {
    setIsPlaying(false)
    setIsBuffering(false)
  }

  function onSetLoopPoint(point: 'start' | 'end') {
    const audio = audioRef.current
    if (!audio) return
    const nextStart = point === 'start' ? Math.round(audio.currentTime * 1000) : loopStartMs
    const nextEnd = point === 'end' ? Math.round(audio.currentTime * 1000) : loopEndMs
    if (nextStart !== null && nextEnd !== null && nextEnd <= nextStart) {
      setError('Loop B must be after loop A.')
      return
    }
    setError(null)
    setLoopRepetitions(0)
    setLoopStartMs(nextStart)
    setLoopEndMs(nextEnd)
    const metadata = { ...segmentMetadata.current, loopStartMs: nextStart, loopEndMs: nextEnd }
    segmentMetadata.current = metadata
    void rollSegment(metadata).catch((rollError: unknown) => {
      console.error('Unable to start a new practice segment:', rollError)
      setError('Unable to save the previous practice segment.')
    })
  }

  function clearLoop() {
    setLoopStartMs(null)
    setLoopEndMs(null)
    setLoopRepetitions(0)
    const metadata = { ...segmentMetadata.current, loopStartMs: null, loopEndMs: null }
    segmentMetadata.current = metadata
    void rollSegment(metadata).catch((rollError: unknown) => {
      console.error('Unable to start a new practice segment:', rollError)
      setError('Unable to save the previous practice segment.')
    })
  }

  function onSpeedChange(speed: number) {
    const audio = audioRef.current
    if (!audio) return
    setPlaybackSpeed(speed)
    audio.playbackRate = speed
    const metadata = { ...segmentMetadata.current, playbackSpeed: speed }
    segmentMetadata.current = metadata
    void rollSegment(metadata).catch((rollError: unknown) => {
      console.error('Unable to start a new practice segment:', rollError)
      setError('Unable to save the previous practice segment.')
    })
  }

  function onArrangementChange(arrangementId: string) {
    setSelectedArrangementId(arrangementId)
    const metadata = { ...segmentMetadata.current, arrangementId: arrangementId || null }
    segmentMetadata.current = metadata
    void rollSegment(metadata).catch((rollError: unknown) => {
      console.error('Unable to start a new practice segment:', rollError)
      setError('Unable to save the previous practice segment.')
    })
  }

  function onAudioTimeUpdate() {
    const audio = audioRef.current
    if (!audio) return
    setCurrentTime(audio.currentTime)
    if (
      loopStartMs !== null &&
      loopEndMs !== null &&
      audio.currentTime * 1000 >= loopEndMs
    ) {
      audio.currentTime = loopStartMs / 1000
      setLoopRepetitions((count) => count + 1)
    }
  }

  async function onSelectMedia(mediaId: string) {
    audioRef.current?.pause()
    await finishSegment()
    setAudioSource(null)
    setAudioSourceName(null)
    setSelectedMediaId(mediaId)
    setCurrentTime(0)
    setDuration(0)
    setLoopStartMs(null)
    setLoopEndMs(null)
    setLoopRepetitions(0)
    setPlaybackSpeed(1)
    segmentMetadata.current = {
      ...segmentMetadata.current,
      playbackSpeed: 1,
      loopStartMs: null,
      loopEndMs: null,
    }
    setError(null)
  }

  async function onChooseAudio(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|aac|wav|ogg|opus|flac|webm|mp4)$/i.test(file.name)) {
      setError('Choose a supported audio file.')
      return
    }
    audioRef.current?.pause()
    await finishSegment()
    const nextUrl = URL.createObjectURL(file)
    setSelectedMediaId('')
    setAudioSource(nextUrl)
    setAudioSourceName(file.name)
    setCurrentTime(0)
    setDuration(0)
    setLoopStartMs(null)
    setLoopEndMs(null)
    setLoopRepetitions(0)
    setPlaybackSpeed(1)
    segmentMetadata.current = {
      ...segmentMetadata.current,
      playbackSpeed: 1,
      loopStartMs: null,
      loopEndMs: null,
    }
    setError(null)
    setStatusMessage(null)
    setSyncStatus('idle')
  }

  async function cacheCurrentMedia() {
    if (!selectedMedia || !teamId) return
    const downloadUrl = selectedMedia.external_url ?? mediaPlaybackUrl
    if (!downloadUrl) {
      setError('The shared audio must finish loading before it can be downloaded.')
      return
    }
    const cacheKey = `offline-media:${teamId}:${selectedMedia.id}`
    try {
      await downloadForOffline(downloadUrl, cacheKey)
      const url = await readOfflineMedia(cacheKey)
      setOfflineMediaUrl(url)
      setOfflineMediaReady(Boolean(url))
    } catch (cacheError) {
      console.error('Unable to cache shared audio:', cacheError)
      setError(cacheError instanceof Error ? cacheError.message : 'Unable to download shared audio.')
    }
  }

  async function removeCurrentOfflineMedia() {
    if (!selectedMedia || !teamId) return
    const cacheKey = `offline-media:${teamId}:${selectedMedia.id}`
    await removeOfflineMedia(cacheKey)
    setOfflineMediaUrl(null)
    setOfflineMediaReady(false)
  }

  async function togglePracticeSharing(enabled: boolean) {
    if (enabled) {
      const accepted = window.confirm(
        'Practice sharing is optional. If enabled, completed playback sessions may be shared with team leadership. These records are not proof of attention or performance. Private and pending local history will not be uploaded automatically. Do you consent to share new practice activity?'
      )
      if (!accepted) return
    }
    try {
      await setPracticeSharingEnabled(enabled)
    } catch (sharingError) {
      console.error('Unable to update practice sharing:', sharingError)
      setError('Unable to update your practice-sharing preference.')
    }
  }

  async function stopAndSave() {
    setSaving(true)
    setError(null)
    try {
      audioRef.current?.pause()
      await finishSegment()
      setIsPlaying(false)
    } catch (saveError) {
      console.error('Unable to save practice session:', saveError)
      setError('The practice session could not be saved locally.')
    } finally {
      setSaving(false)
    }
  }

  function formatTime(seconds: number) {
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
  }

  if (loading) return <div className="page-container"><h2>Practice Board</h2><LoadingSkeleton rows={4} label="Loading practice board" /></div>
  if (error && !song) return <div className="page-container"><StatusMessage tone="error">{error}</StatusMessage></div>
  if (!song) return <div className="page-container"><EmptyState title="Song not found">Return to the song catalog and select an available song.</EmptyState></div>

  const embeddedUrl = selectedMedia?.external_url && mediaKind
    ? getEmbeddedMediaUrl(mediaKind, selectedMedia.external_url)
    : null
  const selectedArrangement = song.arrangements.find(
    (arrangement) => arrangement.id === selectedArrangementId
  )

  return (
    <div className="page-container">
      <h2>Practice Board: {song.title}</h2>
      {error && <StatusMessage tone="error">{error}</StatusMessage>}

      <section className="card">
        <h3>Song Info</h3>
        <p><strong>Artist:</strong> {song.artist || 'Unknown'}</p>
        <p><strong>Key:</strong> {selectedArrangement?.key ?? song.key_signature ?? '—'}</p>
        <p><strong>Tempo:</strong> {(selectedArrangement?.tempo_override ?? song.tempo_bpm)
          ? `${selectedArrangement?.tempo_override ?? song.tempo_bpm} BPM`
          : '—'}</p>
        <p><strong>Capo:</strong> {selectedArrangement?.capo_position ?? 0}</p>
      </section>

      <section className="card">
        <h3>Audio practice</h3>
        {song.media.length > 0 && (
          <label>
            Shared media
            <select
              value={audioSource ? 'local-file' : selectedMediaId}
              onChange={(event) => {
                if (event.target.value === 'local-file') return
                void onSelectMedia(event.target.value).catch((selectError: unknown) => {
                  console.error('Unable to change practice media:', selectError)
                  setError('Unable to stop the current practice session.')
                })
              }}
            >
              <option value="">Choose shared media</option>
              {song.media.map((media) => (
                <option key={media.id} value={media.id}>
                  {media.description || media.media_type}
                </option>
              ))}
              {audioSource && <option value="local-file">Local file: {audioSourceName}</option>}
            </select>
          </label>
        )}
        <label>
          Choose a local audio file for this device
          <input
            type="file"
            accept="audio/*"
            onChange={(event) => void onChooseAudio(event.target.files?.[0]).catch((selectError: unknown) => {
              console.error('Unable to select local practice audio:', selectError)
              setError('Unable to stop the current practice session.')
            })}
          />
        </label>
        {selectedMedia && (selectedMedia.external_url || mediaPlaybackUrl) && (
          <div className="offline-media-actions">
            {offlineMediaReady ? (
              <>
                <span role="status">Downloaded for offline practice</span>
                <button type="button" className="btn-secondary" onClick={() => void removeCurrentOfflineMedia()}>
                  Remove offline copy
                </button>
              </>
            ) : (
              <button type="button" className="btn-secondary" onClick={() => void cacheCurrentMedia()}>
                Download for offline
              </button>
            )}
          </div>
        )}
        {audioSourceName && <p>Selected: {audioSourceName}</p>}
        {mediaLoading && <p>Preparing shared audio…</p>}
        {source && (
          <audio
            ref={audioRef}
            src={source}
            controls
            preload="metadata"
            onPlay={onAudioPlay}
            onPause={onAudioPause}
            onWaiting={() => setIsBuffering(true)}
            onPlaying={() => setIsBuffering(false)}
            onCanPlay={() => setIsBuffering(false)}
            onEnded={() => {
              setIsPlaying(false)
              void finishSegment()
            }}
            onError={() => {
              setIsBuffering(false)
              setError('This audio source could not be played. No practice time was measured.')
              void finishSegment()
            }}
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
            onTimeUpdate={onAudioTimeUpdate}
          />
        )}
        {embeddedUrl && (
          <>
            <iframe
              title={`${song.title} ${mediaKind ?? 'media'} player`}
              src={embeddedUrl}
              width="100%"
              height={mediaKind === 'spotify' ? '152' : '315'}
              allow="autoplay; encrypted-media; picture-in-picture; web-share"
              allowFullScreen
            />
            <p>
              This provider player is not measured as practice time. For timed practice,
              playback-speed adjustment, and A-B looping, use an uploaded or direct audio file.
            </p>
          </>
        )}
        {selectedMedia?.external_url && !embeddedUrl && !source && (
          <p>
            This link cannot be played in the practice controls.{' '}
            <a href={selectedMedia.external_url} target="_blank" rel="noreferrer">Open it in your browser</a>.
          </p>
        )}
        {selectedMedia?.local_file_reference && !source && !mediaLoading && (
          <p>Unable to prepare the shared audio file. Check the Storage migration and team access.</p>
        )}
        {!song.media.length && !audioSource && (
          <p>
            No shared audio is attached. <Link to={`/song/${song.id}`}>Open song details to add a link or upload shared audio</Link>.
          </p>
        )}
        {!source && !embeddedUrl && selectedMedia?.media_type === 'audio' && (
          <p>Select a local audio file to start measured playback practice.</p>
        )}

        <div className="practice-controls">
          {song.arrangements.length > 0 && (
            <label>
              Arrangement
              <select value={selectedArrangementId} onChange={(event) => onArrangementChange(event.target.value)}>
                <option value="">Default</option>
                {song.arrangements.map((arrangement) => (
                  <option key={arrangement.id} value={arrangement.id}>
                    {arrangement.arrangement_name}{arrangement.key ? ` (${arrangement.key})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Playback speed
            <select
              value={playbackSpeed}
              onChange={(event) => onSpeedChange(Number(event.target.value))}
              disabled={!source}
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => (
                <option key={speed} value={speed}>{speed.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}x</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => onSetLoopPoint('start')} disabled={!source}>Set loop A</button>
          <button type="button" onClick={() => onSetLoopPoint('end')} disabled={!source}>Set loop B</button>
          <button type="button" onClick={clearLoop} disabled={!source || (loopStartMs === null && loopEndMs === null)}>
            Clear loop
          </button>
        </div>
        <p>
          Position {formatTime(currentTime)} / {Number.isFinite(duration) ? formatTime(duration) : '—'}
          {' · '}Speed {playbackSpeed}x
        </p>
        <p>
          Loop: {loopStartMs !== null && loopEndMs !== null
            ? `${formatTime(loopStartMs / 1000)}–${formatTime(loopEndMs / 1000)}`
            : 'off'}
          {' · '}Repetitions: {loopRepetitions}
        </p>
        <p>
          Playback time is counted only while the local audio position advances normally.
          It is not proof of attention, attendance, or performance.
        </p>
        {isPlaying && <button type="button" onClick={() => void stopAndSave()} disabled={saving}>
          {saving ? 'Saving…' : 'End and save practice'}
        </button>}
        {syncStatus !== 'idle' && statusMessage && (
          <StatusMessage tone={syncStatus === 'error' ? 'error' : syncStatus === 'synced' ? 'success' : 'warning'}>
            {statusMessage}
          </StatusMessage>
        )}
      </section>

      <section className="card">
        <h3>Practice Privacy</h3>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={practiceSharingEnabled}
            onChange={(event) => void togglePracticeSharing(event.target.checked)}
          />
          Share my practice activity with team leadership
        </label>
        <p>
          Sharing is optional. When disabled, measured sessions stay on this device.
          Turning sharing off retains previously shared server records, which RLS hides
          from leadership, and keeps pending local records private.
        </p>
      </section>

      <ChordProViewer
        source={song.chordpro_lyrics}
        defaultKey={selectedArrangement?.key ?? song.key_signature}
      />
    </div>
  )
}
