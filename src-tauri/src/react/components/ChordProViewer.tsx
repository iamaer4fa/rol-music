import { useState, type CSSProperties } from 'react'
import { getTransposedKey, transposeChord } from '../lib/chordpro'

type Props = {
  source: string
  defaultKey?: string | null
}

export default function ChordProViewer({ source, defaultKey }: Props) {
  const [semitones, setSemitones] = useState(0)
  const [fontSize, setFontSize] = useState(16)
  const [columns, setColumns] = useState<1 | 2>(1)

  function transposeBy(change: number) {
    setSemitones((current) => {
      const next = current + change
      return next > 11 ? -12 : next < -11 ? 11 : next
    })
  }

  const lines = source.split(/\r?\n/u).map((line) => line.trim() ? line : ' ')
  const renderedLines = lines.map((line, index) => {
    if (/^\s*\{[^}]+\}\s*$/u.test(line)) return { index, directive: true, content: line.replace(/^\s*\{|\}\s*$/gu, '') }

    const segments: Array<{ chord: string | null; text: string }> = []
    let cursor = 0
    const chordPattern = /\[([^\]]+)\]/gu
    let match: RegExpExecArray | null
    while ((match = chordPattern.exec(line)) !== null) {
      segments.push({ chord: null, text: line.slice(cursor, match.index) })
      segments.push({ chord: transposeChord(match[1] ?? '', semitones), text: '' })
      cursor = match.index + match[0].length
    }
    segments.push({ chord: null, text: line.slice(cursor) })
    return { index, directive: false, segments }
  })

  return (
    <section className="chordpro-card card">
      <div className="chordpro-toolbar" aria-label="Chord display controls">
        <div className="chordpro-toolbar-group">
          <span>Key</span>
          <button type="button" className="btn-secondary" onClick={() => transposeBy(-1)} aria-label="Transpose down">−</button>
          <strong>{getTransposedKey(defaultKey ?? null, semitones) || 'Original'}</strong>
          <button type="button" className="btn-secondary" onClick={() => transposeBy(1)} aria-label="Transpose up">+</button>
          {semitones !== 0 && (
            <button type="button" className="btn-secondary" onClick={() => setSemitones(0)}>Reset</button>
          )}
        </div>
        <label>
          Text size
          <input
            type="range"
            min="14"
            max="28"
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value))}
          />
        </label>
        <label>
          Layout
          <select value={columns} onChange={(event) => setColumns(Number(event.target.value) as 1 | 2)}>
            <option value={1}>Single column</option>
            <option value={2}>Two columns</option>
          </select>
        </label>
      </div>

      <details className="chordpro-source">
        <summary>View ChordPro source</summary>
        <pre>{source || 'No lyrics available'}</pre>
      </details>

      <div
        className="chordpro-sheet"
        style={{ '--chordpro-font-size': `${fontSize}px`, '--chordpro-columns': columns } as CSSProperties}
      >
        {renderedLines.map((line) =>
          line.directive ? (
            <div className="chordpro-directive" key={line.index}>{line.content}</div>
          ) : (
            <div className="chordpro-line" key={line.index}>
              {line.segments?.map((segment, segmentIndex) =>
                segment.chord ? (
                  <span className="chordpro-chord" key={segmentIndex}>{segment.chord}</span>
                ) : (
                  <span className="chordpro-lyric" key={segmentIndex}>{segment.text || '\u00a0'}</span>
                )
              )}
            </div>
          )
        )}
      </div>
    </section>
  )
}
