import { useEffect, useRef, useState } from 'react'
import { MarkdownContent } from './MarkdownContent'
import type { Note } from '../types'

interface NoteCardProps {
  note: Note
  terms: string[]
  selected: boolean
  firstMatch: boolean
  onSelect: () => void
  onEdit: () => void
}

function shortDate(value: string): string {
  return String(value ?? '').slice(0, 16)
}

function NoteCard({ note, terms, selected, firstMatch, onSelect, onEdit }: NoteCardProps) {
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const body = bodyRef.current
    if (!body || !firstMatch || terms.length === 0) return
    const match = body.querySelector('mark')
    if (!match) return
    const bodyRect = body.getBoundingClientRect()
    const matchRect = match.getBoundingClientRect()
    if (matchRect.top < bodyRect.top || matchRect.bottom > bodyRect.bottom) {
      body.scrollTop = Math.max(0, body.scrollTop + matchRect.top - bodyRect.top - 6)
    }
  }, [firstMatch, terms])

  return (
    <article
      className={`note${selected ? ' selected' : ''}`}
      onClick={onSelect}
      onDoubleClick={onEdit}
    >
      <div className="note-head">
        <h3 className="note-title">{note.title}</h3>
        <time className="note-date">
          {shortDate(note.updated_at)}
          {shortDate(note.created_at) !== shortDate(note.updated_at) ? ` -- ${shortDate(note.created_at)}` : ''}
        </time>
      </div>
      <MarkdownContent ref={bodyRef} value={note.body} terms={terms} className="note-text" />
    </article>
  )
}

interface NotesPanelProps {
  notes: Note[]
  terms: string[]
  selectedId: number | null
  firstMatchId: number | null
  onSelect: (note: Note) => void
  onEdit: (note: Note) => void
}

const INITIAL_NOTE_COUNT = 20
const NOTE_BATCH_SIZE = 50

// Render the first cards right away and mount the rest in batches, yielding
// to the browser between batches so the first screen paints quickly.
function useProgressiveLimit(total: number): number {
  const [limit, setLimit] = useState(INITIAL_NOTE_COUNT)

  useEffect(() => {
    if (limit >= total) return
    let timer = 0
    // rAF + setTimeout: run after the current frame has actually been painted.
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => setLimit((current) => current + NOTE_BATCH_SIZE), 0)
    })
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [limit, total])

  return limit
}

export function NotesPanel({ notes, terms, selectedId, firstMatchId, onSelect, onEdit }: NotesPanelProps) {
  const limit = useProgressiveLimit(notes.length)

  return (
    <div id="notes-panel" className="notes" tabIndex={-1}>
      {notes.slice(0, limit).map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          terms={terms}
          selected={note.id === selectedId}
          firstMatch={note.id === firstMatchId}
          onSelect={() => onSelect(note)}
          onEdit={() => onEdit(note)}
        />
      ))}
    </div>
  )
}
