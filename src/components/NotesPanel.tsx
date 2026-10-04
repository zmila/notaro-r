import { useEffect, useRef } from 'react'
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

export function NotesPanel({ notes, terms, selectedId, firstMatchId, onSelect, onEdit }: NotesPanelProps) {
  return (
    <div id="notes-panel" className="notes" tabIndex={-1}>
      {notes.map((note) => (
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
