import type { SongRecord } from './models'

export type CatalogSortField = 'title' | 'artist' | 'key' | 'tempo'
export type CatalogSortDirection = 'asc' | 'desc'

export function filterCatalogSongs(
  songs: SongRecord[],
  filters: { query: string; tag: string | null; key: string | null },
): SongRecord[] {
  const query = filters.query.trim().toLocaleLowerCase()
  return songs.filter((song) => {
    const matchesQuery = !query || [
      song.title,
      song.artist,
      ...(song.arrangements ?? []).flatMap((arrangement) => [
        arrangement.arrangement_name,
        arrangement.key,
        arrangement.performance_notes,
      ]),
    ].some((value) => value?.toLocaleLowerCase().includes(query))
    const matchesTag = !filters.tag ||
      (song.tags ?? []).some((tag) => tag.tag_name === filters.tag)
    const matchesKey = !filters.key || song.key_signature === filters.key
    return matchesQuery && matchesTag && matchesKey
  })
}

export function sortCatalogSongs(
  songs: SongRecord[],
  field: CatalogSortField,
  direction: CatalogSortDirection,
): SongRecord[] {
  const valueFor = (song: SongRecord): string | number => {
    switch (field) {
      case 'artist': return song.artist ?? ''
      case 'key': return song.key_signature ?? ''
      case 'tempo': return song.tempo_bpm ?? 0
      default: return song.title
    }
  }

  return [...songs].sort((left, right) => {
    const leftValue = valueFor(left)
    const rightValue = valueFor(right)
    const compared = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), undefined, { sensitivity: 'base' })
    return direction === 'asc' ? compared : -compared
  })
}
