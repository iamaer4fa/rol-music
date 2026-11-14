import { useState, type FormEvent } from 'react'
import { supa } from '../lib/supabase'
import { classifyMediaUrl, type MediaKind } from '../lib/media'

const AUDIO_BUCKET = 'team-audio'
const MAX_AUDIO_BYTES = 100 * 1024 * 1024

type SongMedia = {
  id: string
  media_type: string
  external_url: string | null
  local_file_reference: string | null
  description: string | null
  attribution: string | null
}

type SongArrangement = {
  id: string
  arrangement_name: string
  key: string | null
  capo_position: number
  tempo_override: number | null
  performance_notes: string | null
}

type Props = {
  songId: string
  teamId: string
  onMediaAdded: (media: SongMedia) => void
  onArrangementAdded: (arrangement: SongArrangement) => void
}

export default function SongContributions({
  songId,
  teamId,
  onMediaAdded,
  onArrangementAdded,
}: Props) {
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaDescription, setMediaDescription] = useState('')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [mediaSaving, setMediaSaving] = useState(false)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [arrangementName, setArrangementName] = useState('')
  const [arrangementKey, setArrangementKey] = useState('')
  const [capoPosition, setCapoPosition] = useState('0')
  const [tempo, setTempo] = useState('')
  const [performanceNotes, setPerformanceNotes] = useState('')
  const [arrangementSaving, setArrangementSaving] = useState(false)
  const [arrangementError, setArrangementError] = useState<string | null>(null)

  async function addLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMediaError(null)
    let url: URL
    let mediaType: MediaKind
    try {
      url = new URL(mediaUrl.trim())
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported protocol')
      mediaType = classifyMediaUrl(url.toString())
    } catch {
      setMediaError('Enter a valid HTTP or HTTPS media link.')
      return
    }

    setMediaSaving(true)
    try {
      const { data, error: insertError } = await supa
        .from('song_media')
        .insert({
          team_id: teamId,
          song_id: songId,
          media_type: mediaType,
          external_url: url.toString(),
          description: mediaDescription.trim() || null,
        })
        .select('id, media_type, external_url, local_file_reference, description, attribution')
        .single()
      if (insertError) throw insertError
      onMediaAdded(data)
      setMediaUrl('')
      setMediaDescription('')
    } catch (saveError) {
      console.error('Unable to add song media link:', saveError)
      setMediaError(saveError instanceof Error ? saveError.message : 'Unable to save this media link.')
    } finally {
      setMediaSaving(false)
    }
  }

  async function uploadAudio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMediaError(null)
    if (!audioFile) {
      setMediaError('Choose an audio file to upload.')
      return
    }
    if (audioFile.size > MAX_AUDIO_BYTES) {
      setMediaError('Audio files must be 100 MB or smaller.')
      return
    }
    if (!audioFile.type.startsWith('audio/') && !/\.(mp3|m4a|aac|wav|ogg|opus|flac|webm)$/i.test(audioFile.name)) {
      setMediaError('Choose a supported audio file.')
      return
    }
    const extension = audioFile.name.split('.').pop()?.toLowerCase()
    const inferredContentType: Record<string, string> = {
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      aac: 'audio/aac',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      opus: 'audio/ogg',
      flac: 'audio/flac',
      webm: 'audio/webm',
    }
    const contentType = audioFile.type.startsWith('audio/')
      ? audioFile.type
      : inferredContentType[extension ?? '']
    if (!contentType) {
      setMediaError('The selected file type cannot be identified as audio.')
      return
    }

    const safeName = audioFile.name
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(-120)
    const storagePath = `${teamId}/${songId}/${crypto.randomUUID()}-${safeName || 'audio'}`
    setMediaSaving(true)
    try {
      const { error: uploadError } = await supa.storage
        .from(AUDIO_BUCKET)
        .upload(storagePath, audioFile, {
          contentType,
          upsert: false,
        })
      if (uploadError) {
        if (uploadError.message.toLowerCase().includes('bucket not found')) {
          throw new Error(
            'Shared audio storage is not configured. Apply 20261114_team_audio_and_member_arrangements.sql in Supabase.'
          )
        }
        throw uploadError
      }

      const { data, error: insertError } = await supa
        .from('song_media')
        .insert({
          team_id: teamId,
          song_id: songId,
          media_type: 'audio',
          local_file_reference: storagePath,
          description: mediaDescription.trim() || audioFile.name,
        })
        .select('id, media_type, external_url, local_file_reference, description, attribution')
        .single()
      if (insertError) {
        const { error: cleanupError } = await supa.storage.from(AUDIO_BUCKET).remove([storagePath])
        if (cleanupError) {
          console.error('Unable to remove uploaded audio after its media record failed:', cleanupError)
        }
        throw insertError
      }

      onMediaAdded(data)
      setAudioFile(null)
      setMediaDescription('')
      event.currentTarget.reset()
    } catch (uploadError) {
      console.error('Unable to upload song audio:', uploadError)
      setMediaError(uploadError instanceof Error ? uploadError.message : 'Unable to upload this audio file.')
    } finally {
      setMediaSaving(false)
    }
  }

  async function addArrangement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setArrangementError(null)
    const capo = Number(capoPosition)
    const bpm = tempo.trim() ? Number(tempo) : null
    if (!arrangementName.trim()) {
      setArrangementError('Enter an arrangement name.')
      return
    }
    if (!Number.isInteger(capo) || capo < 0) {
      setArrangementError('Capo position must be a whole number greater than or equal to zero.')
      return
    }
    if (bpm !== null && (!Number.isInteger(bpm) || bpm <= 0)) {
      setArrangementError('Tempo must be a positive whole number.')
      return
    }

    setArrangementSaving(true)
    try {
      const { data, error: insertError } = await supa
        .from('song_arrangements')
        .insert({
          team_id: teamId,
          song_id: songId,
          arrangement_name: arrangementName.trim(),
          key: arrangementKey.trim() || null,
          capo_position: capo,
          tempo_override: bpm,
          performance_notes: performanceNotes.trim() || null,
        })
        .select('id, arrangement_name, key, capo_position, tempo_override, performance_notes')
        .single()
      if (insertError) throw insertError
      onArrangementAdded(data)
      setArrangementName('')
      setArrangementKey('')
      setCapoPosition('0')
      setTempo('')
      setPerformanceNotes('')
    } catch (saveError) {
      console.error('Unable to add song arrangement:', saveError)
      setArrangementError(saveError instanceof Error ? saveError.message : 'Unable to save this arrangement.')
    } finally {
      setArrangementSaving(false)
    }
  }

  return (
    <section className="card">
      <h3>Contribute to this song</h3>
      <p>Active team members can add shared media and arrangements. Song catalog edits remain limited to Worship Leaders.</p>
      <form onSubmit={(event) => void addLink(event)}>
        <h4>Add a YouTube, Spotify, or audio link</h4>
        <label>
          Media URL
          <input
            type="url"
            value={mediaUrl}
            onChange={(event) => setMediaUrl(event.target.value)}
            placeholder="https://..."
            required
          />
        </label>
        <label>
          Description
          <input
            value={mediaDescription}
            onChange={(event) => setMediaDescription(event.target.value)}
            maxLength={255}
          />
        </label>
        <button type="submit" disabled={mediaSaving}>{mediaSaving ? 'Saving…' : 'Add link'}</button>
      </form>

      <form onSubmit={(event) => void uploadAudio(event)}>
        <h4>Upload shared audio</h4>
        <label>
          Audio file (maximum 100 MB)
          <input
            type="file"
            accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac,.webm"
            onChange={(event) => setAudioFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button type="submit" disabled={mediaSaving}>{mediaSaving ? 'Uploading…' : 'Upload audio'}</button>
      </form>
      {mediaError && <p className="error-message" role="alert">{mediaError}</p>}

      <form onSubmit={(event) => void addArrangement(event)}>
        <h4>Add an arrangement or key</h4>
        <label>
          Arrangement name
          <input
            value={arrangementName}
            onChange={(event) => setArrangementName(event.target.value)}
            maxLength={255}
            required
          />
        </label>
        <label>
          Key
          <input
            value={arrangementKey}
            onChange={(event) => setArrangementKey(event.target.value)}
            maxLength={50}
            placeholder="e.g. D"
          />
        </label>
        <label>
          Capo position
          <input type="number" min="0" step="1" value={capoPosition} onChange={(event) => setCapoPosition(event.target.value)} />
        </label>
        <label>
          Tempo override (BPM)
          <input type="number" min="1" step="1" value={tempo} onChange={(event) => setTempo(event.target.value)} />
        </label>
        <label>
          Performance notes
          <textarea value={performanceNotes} onChange={(event) => setPerformanceNotes(event.target.value)} rows={3} />
        </label>
        <button type="submit" disabled={arrangementSaving}>{arrangementSaving ? 'Saving…' : 'Add arrangement'}</button>
      </form>
      {arrangementError && <p className="error-message" role="alert">{arrangementError}</p>}
    </section>
  )
}
