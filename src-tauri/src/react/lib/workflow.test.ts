import { describe, expect, it } from 'vitest'
import { getDateInTimeZone, getUpcomingServiceDate, hasDuplicateSong } from './workflow'
import { classifyMediaUrl, getEmbeddedMediaUrl } from './media'
import { transposeChord } from './chordpro'
import { getWeekStartDate, getWeekEndDate, getWeekdayName, escapeCsv } from './reporting'

describe('worship workflow', () => {
  it('uses the team cutoff to choose the next Sunday', () => {
    const sundayMorning = new Date('2026-11-24T01:00:00Z')
    expect(getUpcomingServiceDate(sundayMorning, 'UTC', 7, '09:00')).toBe('2026-11-29')
  })

  it('uses the team timezone when determining the service date boundary', () => {
    expect(getDateInTimeZone(new Date('2026-11-25T18:00:00Z'), 'Asia/Manila')).toBe('2026-11-26')
    expect(getDateInTimeZone(new Date('2026-11-25T18:00:00Z'), 'UTC')).toBe('2026-11-25')
  })

  it('returns the current Sunday before the cutoff', () => {
    expect(getUpcomingServiceDate(new Date('2026-11-22T07:30:00Z'), 'UTC', 7, '09:00')).toBe('2026-11-22')
  })

  it('prevents duplicate lineup songs', () => {
    expect(hasDuplicateSong(['song-a', 'song-b'], 'song-a')).toBe(true)
    expect(hasDuplicateSong(['song-a'], 'song-c')).toBe(false)
  })

  it('classifies direct audio separately from provider media', () => {
    expect(classifyMediaUrl('https://cdn.example.com/song.mp3')).toBe('audio')
    expect(classifyMediaUrl('https://www.youtube.com/watch?v=abc123')).toBe('youtube')
  })

  it('creates an embeddable YouTube URL', () => {
    expect(getEmbeddedMediaUrl('youtube', 'https://youtu.be/abc123')).toContain('/embed/abc123')
  })

  it('transposes chords consistently', () => {
    expect(transposeChord('G', 2)).toBe('A')
    expect(transposeChord('Bb', -1)).toBe('A')
  })

  it('calculates the configured reporting week', () => {
    expect(getWeekdayName(1)).toBe('Monday')
    expect(getWeekStartDate('2026-11-24', 1)).toBe('2026-11-23')
    expect(getWeekStartDate('2026-11-24', 7)).toBe('2026-11-22')
    expect(getWeekEndDate('2026-11-23')).toBe('2026-11-30')
  })

  it('escapes CSV report values', () => {
    expect(escapeCsv('Lead, Guitar')).toBe('"Lead, Guitar"')
    expect(escapeCsv('A "quoted" name')).toBe('"A ""quoted"" name"')
  })
})
