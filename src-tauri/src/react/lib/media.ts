export type MediaKind = 'audio' | 'youtube' | 'spotify' | 'external_link'

export function parseMediaKind(value: string): MediaKind | null {
  if (value === 'audio' || value === 'youtube' || value === 'spotify' || value === 'external_link') {
    return value
  }
  return null
}

export function classifyMediaUrl(value: string): MediaKind {
  const url = new URL(value)
  const host = url.hostname.toLowerCase()

  if (
    host === 'youtu.be' ||
    host === 'youtube.com' ||
    host.endsWith('.youtube.com')
  ) {
    return 'youtube'
  }
  if (host === 'open.spotify.com' || host === 'spotify.link') return 'spotify'
  if (/\.(mp3|m4a|aac|wav|ogg|opus|flac|webm|mp4)$/i.test(url.pathname)) {
    return 'audio'
  }
  return 'external_link'
}

export function getEmbeddedMediaUrl(kind: MediaKind, value: string): string | null {
  const url = new URL(value)
  const host = url.hostname.toLowerCase()

  if (kind === 'youtube') {
    let videoId: string | null = null
    if (host === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0] ?? null
    } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      if (url.pathname === '/watch') {
        videoId = url.searchParams.get('v')
      } else {
        const parts = url.pathname.split('/').filter(Boolean)
        if (['embed', 'shorts', 'live'].includes(parts[0] ?? '')) {
          videoId = parts[1] ?? null
        }
      }
    }

    return videoId
      ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?controls=1&playsinline=1`
      : null
  }

  if (kind === 'spotify' && host === 'open.spotify.com') {
    const parts = url.pathname.split('/').filter(Boolean)
    const mediaTypeIndex = parts.findIndex((part) =>
      ['track', 'album', 'playlist', 'episode', 'show'].includes(part)
    )
    const mediaType = parts[mediaTypeIndex]
    const mediaId = parts[mediaTypeIndex + 1]
    if (!mediaType || !mediaId) return null
    return `https://open.spotify.com/embed/${mediaType}/${encodeURIComponent(mediaId)}`
  }

  return null
}
