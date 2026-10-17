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
  onMenu: (x: number, y: number, text: string) => void
}

function shortDate(value: string): string {
  return String(value ?? '').slice(0, 16)
}

function selectedText(card: HTMLElement): string {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.anchorNode || !card.contains(selection.anchorNode)) return ''
  return selection.toString()
}

function NoteCard({ note, terms, selected, firstMatch, onSelect, onEdit, onMenu }: NoteCardProps) {
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
      onClick={(event) => {
        // A drag-selection, a word double-click or a click in an already
        // selected card's text is about the text, not about the card.
        const inText = (event.target as Element).closest('.note-text') !== null
        if (!inText) window.getSelection()?.removeAllRanges()
        else if (event.detail > 1 || selected || selectedText(event.currentTarget)) return
        onSelect()
      }}
      onContextMenu={(event) => {
        // Shift+right-click keeps the browser's own menu (Inspect).
        if (event.shiftKey) return
        event.preventDefault()
        onMenu(event.clientX, event.clientY, selectedText(event.currentTarget))
      }}
    >
      <div className="note-head" onDoubleClick={onEdit}>
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
  onMenu: (note: Note | null, x: number, y: number, text: string) => void
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

export function NotesPanel({ notes, terms, selectedId, firstMatchId, onSelect, onEdit, onMenu }: NotesPanelProps) {
  const limit = useProgressiveLimit(notes.length)

  return (
    <div
      id="notes-panel"
      className="notes"
      tabIndex={-1}
      onContextMenu={(event) => {
        // Cards open their own menu first; this is the empty space around them.
        if (event.defaultPrevented || event.shiftKey) return
        event.preventDefault()
        onMenu(null, event.clientX, event.clientY, '')
      }}
    >
      {notes.slice(0, limit).map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          terms={terms}
          selected={note.id === selectedId}
          firstMatch={note.id === firstMatchId}
          onSelect={() => onSelect(note)}
          onEdit={() => onEdit(note)}
          onMenu={(x, y, text) => onMenu(note, x, y, text)}
        />
      ))}
    </div>
  )
}
