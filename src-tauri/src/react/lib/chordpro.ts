const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

export function transposeChord(chord: string, semitones: number): string {
  if (!semitones) return chord
  return chord.replace(/^([A-Ga-g])([#b]?)(.*)$/u, (_match, root: string, accidental: string, suffix: string) => {
    const normalized = `${root.toUpperCase()}${accidental}`
    let index = NOTE_NAMES.indexOf(normalized)
    if (index < 0) index = FLAT_NAMES.indexOf(normalized)
    if (index < 0) return chord
    const target = (index + semitones + 12) % 12
    return `${NOTE_NAMES[target]}${suffix}`
  })
}

export function getTransposedKey(key: string | null, semitones: number): string | null {
  if (!key) return null
  const match = key.match(/^([A-G](?:#|b)?)/)
  return match ? transposeChord(match[0], semitones) : key
}
