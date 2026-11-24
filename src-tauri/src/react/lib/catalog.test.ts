import { describe, expect, it } from 'vitest'
import { filterCatalogSongs, sortCatalogSongs } from './catalog'
import type { SongRecord } from './models'

const songs: SongRecord[] = [
  {
    id: 'song-a',
    team_id: 'team-a',
    title: 'Anchor',
    artist: 'North Band',
    key_signature: 'G',
    tempo_bpm: 120,
    time_signature: '4/4',
    chordpro_lyrics: '',
    song_notes: null,
    revision: 1,
    is_active: true,
    created_at: '',
    updated_at: '',
    tags: [{ tag_name: 'Worship' }],
    arrangements: [{
      id: 'arrangement-a',
      arrangement_name: 'Acoustic',
      key: 'D',
      capo_position: 2,
      tempo_override: 110,
      performance_notes: 'Start softly',
    }],
  },
  {
    id: 'song-b',
    team_id: 'team-a',
    title: 'Bright Day',
    artist: 'South Band',
    key_signature: 'C',
    tempo_bpm: 90,
    time_signature: '4/4',
    chordpro_lyrics: '',
    song_notes: null,
    revision: 1,
    is_active: true,
    created_at: '',
    updated_at: '',
    tags: [{ tag_name: 'Praise' }],
    arrangements: [],
  },
]

describe('catalog filters and sorting', () => {
  it('searches arrangement metadata while applying tag and song-key filters', () => {
    expect(filterCatalogSongs(songs, { query: 'acoustic', tag: 'Worship', key: 'G' }))
      .toEqual([songs[0]])
    expect(filterCatalogSongs(songs, { query: 'softly', tag: null, key: null }))
      .toEqual([songs[0]])
    expect(filterCatalogSongs(songs, { query: '', tag: 'Worship', key: 'C' }))
      .toEqual([])
  })

  it('sorts numeric tempos and text titles in either direction without mutating input', () => {
    expect(sortCatalogSongs(songs, 'tempo', 'asc').map((song) => song.id))
      .toEqual(['song-b', 'song-a'])
    expect(sortCatalogSongs(songs, 'title', 'desc').map((song) => song.id))
      .toEqual(['song-b', 'song-a'])
    expect(songs.map((song) => song.id)).toEqual(['song-a', 'song-b'])
  })
})
