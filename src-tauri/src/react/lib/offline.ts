import { invoke, isTauri } from '@tauri-apps/api/core'

type CacheEntry = {
  payload: string
  updatedAt: string
}

export async function saveApplicationCache(teamId: string, key: string, payload: unknown) {
  const serialized = JSON.stringify(payload)
  if (isTauri()) {
    await invoke('save_application_cache', {
      teamId,
      cacheKey: key,
      payload: serialized,
    })
  } else {
    localStorage.setItem(`offline-cache:${teamId}:${key}`, JSON.stringify({
      payload: serialized,
      updatedAt: new Date().toISOString(),
    }))
  }
}

export async function readApplicationCache<T>(teamId: string, key: string): Promise<{ data: T; updatedAt: string } | null> {
  let entry: CacheEntry | null = null
  if (isTauri()) {
    entry = await invoke<CacheEntry | null>('get_application_cache', {
      teamId,
      cacheKey: key,
    })
  } else {
    const stored = localStorage.getItem(`offline-cache:${teamId}:${key}`)
    if (stored) {
      try {
        entry = JSON.parse(stored) as CacheEntry
      } catch {
        return null
      }
    }
  }
  if (!entry) return null
  try {
    return {
      data: JSON.parse(entry.payload) as T,
      updatedAt: entry.updatedAt,
    }
  } catch {
    return null
  }
}

export async function downloadForOffline(mediaUrl: string, cacheKey: string) {
  if (!('caches' in window)) {
    throw new Error('Offline audio storage is unavailable in this environment.')
  }
  const response = await fetch(mediaUrl)
  if (!response.ok) throw new Error(`Unable to download audio (${response.status}).`)
  const cache = await caches.open('rol-worship-team-media-v1')
  await cache.put(cacheKey, response)
  localStorage.setItem(`offline-media:${cacheKey}`, 'available')
}

export async function readOfflineMedia(cacheKey: string): Promise<string | null> {
  if (!('caches' in window)) return null
  const cache = await caches.open('rol-worship-team-media-v1')
  const response = await cache.match(cacheKey)
  if (!response) return null
  const blob = await response.blob()
  return URL.createObjectURL(blob)
}

export async function removeOfflineMedia(cacheKey: string) {
  if (!('caches' in window)) return
  const cache = await caches.open('rol-worship-team-media-v1')
  await cache.delete(cacheKey)
  localStorage.removeItem(`offline-media:${cacheKey}`)
}
