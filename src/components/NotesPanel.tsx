import { Fragment, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import { MarkdownContent } from './MarkdownContent'
import { NoteTags } from './NoteTags'
import { noteDates } from '../noteDates'
import { stripTagLine } from '../noteTags'
import { noteViewInfo, stepNoteView, type BulkNoteView, type NoteView } from '../noteView'
import type { Note } from '../types'

interface NoteHandlers {
  onSelect: (note: Note) => void
  onEdit: (note: Note) => void
  onMenu: (note: Note | null, x: number, y: number, text: string) => void
  onViewChange: (note: Note, view: NoteView) => void
  onTag: (note: Note, tag: string) => void
  onNoteLink: (id: number) => void
}

interface NoteCardProps {
  note: Note
  terms: string[]
  selected: boolean
  firstMatch: boolean
  view: NoteView
  handlers: NoteHandlers
}

function selectedText(card: HTMLElement): string {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.anchorNode || !card.contains(selection.anchorNode)) return ''
  return selection.toString()
}

// Memoized: with stable `handlers`, a card re-renders only when its own props
// change, so selection changes and bulk view batches touch just a few cards.
const NoteCard = memo(function NoteCard({ note, terms, selected, firstMatch, view, handlers }: NoteCardProps) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const current = noteViewInfo(view)
  const next = noteViewInfo(stepNoteView(view, false))
  const body = useMemo(() => stripTagLine(note.body), [note.body])

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
  }, [firstMatch, terms, view])

  return (
    <article
      className={`note view-${view}${selected ? ' selected' : ''}`}
      data-note-id={note.id}
      onClick={(event) => {
        const linked = (event.target as Element).closest<HTMLElement>('.note-link')?.dataset.noteId
        if (linked && selectedText(event.currentTarget) === '') {
          handlers.onNoteLink(Number(linked))
          return
        }
        const tag = (event.target as Element).closest<HTMLElement>('.note-tag')?.dataset.tag
        if (tag && selectedText(event.currentTarget) === '') {
          handlers.onTag(note, tag)
          return
        }
        // A drag-selection, a word double-click or a click in an already
        // selected card's text is about the text, not about the card.
        const inText = (event.target as Element).closest('.note-text') !== null
        if (!inText) window.getSelection()?.removeAllRanges()
        else if (event.detail > 1 || selected || selectedText(event.currentTarget)) return
        handlers.onSelect(note)
      }}
      onContextMenu={(event) => {
        // Shift+right-click keeps the browser's own menu (Inspect).
        if (event.shiftKey) return
        event.preventDefault()
        handlers.onMenu(note, event.clientX, event.clientY, selectedText(event.currentTarget))
      }}
    >
      <div className="note-head" onDoubleClick={() => handlers.onEdit(note)}>
        <button
          type="button"
          className="note-view"
          title={`${current.label} (click: ${next.label.toLowerCase()}, Shift+click: back; selected note: Ctrl+plus/minus)`}
          aria-label={`Note view: ${current.label}`}
          onClick={(event) => {
            event.stopPropagation()
            handlers.onViewChange(note, stepNoteView(view, event.shiftKey))
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >{current.glyph}</button>
        <h3 className="note-title">{note.title}</h3>
        <time className="note-date">{noteDates(note)}</time>
      </div>
      {view !== 'title' && (
        <>
          {(body || note.tags.length === 0) && (
            <MarkdownContent ref={bodyRef} value={body} terms={terms} className="note-text" />
          )}
          <NoteTags tags={note.tags} />
        </>
      )}
    </article>
  )
})

export interface NotesPanelHandle {
  // Change the selected note's view by `step` applied to its current view.
  stepSelected: (step: (view: NoteView) => NoteView) => void
}

interface NotesPanelProps {
  ref?: Ref<NotesPanelHandle>
  notes: Note[]
  terms: string[]
  selectedId: number | null
  firstMatchId: number | null
  bulkView: BulkNoteView
  /** bumped to scroll the selected note into view */
  revealGen?: number
  onSelect: (note: Note) => void
  onEdit: (note: Note) => void
  onMenu: (note: Note | null, x: number, y: number, text: string) => void
  onTag: (note: Note, tag: string) => void
  /** a click on a `[text](#note-id)` link */
  onNoteLink: (id: number) => void
  /** the open note editor, shown in place of its note's card (on top for a new note) */
  editor?: ReactNode
  editingId?: number | null
}

const INITIAL_NOTE_COUNT = 20
const NOTE_BATCH_SIZE = 50

// Grow `limit` from INITIAL_NOTE_COUNT to `total` in batches, yielding to the
// browser between batches so each step paints quickly. `key` restarts it.
function useProgressiveLimit(total: number, key: number): number {
  const [state, setState] = useState({ key, limit: INITIAL_NOTE_COUNT })
  // Restart synchronously during render, so the restarted limit is used at once.
  if (state.key !== key) setState({ key, limit: INITIAL_NOTE_COUNT })
  const limit = state.key === key ? state.limit : INITIAL_NOTE_COUNT

  useEffect(() => {
    if (limit >= total) return
    let timer = 0
    // rAF + setTimeout: run after the current frame has actually been painted.
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => setState((current) => current.key === key
        ? { key, limit: current.limit + NOTE_BATCH_SIZE }
        : current), 0)
    })
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [key, limit, total])

  return limit
}

interface ViewOverride {
  view: NoteView
  gen: number
}

export function NotesPanel({ ref, notes, terms, selectedId, firstMatchId, bulkView, revealGen = 0, onSelect, onEdit, onMenu, onTag, onNoteLink, editor, editingId = null }: NotesPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const selectedIndex = notes.findIndex((note) => note.id === selectedId)
  // A keyboard jump (Ctrl+End) may select a note the progressive mount hasn't reached yet.
  const mountLimit = Math.max(useProgressiveLimit(notes.length, 0), selectedIndex + 1)
  // Bulk view changes reach the top cards first, then the rest batch by batch.
  const applyLimit = useProgressiveLimit(notes.length, bulkView.gen)
  // Per-note choices, in memory only (never saved), tagged with the bulk press
  // they were made after; a newer press overrides them as it reaches each card.
  const [overrides, setOverrides] = useState<ReadonlyMap<number, ViewOverride>>(() => new Map())

  const latest = useRef({ onSelect, onEdit, onMenu, onTag, onNoteLink, gen: bulkView.gen })
  useLayoutEffect(() => {
    latest.current = { onSelect, onEdit, onMenu, onTag, onNoteLink, gen: bulkView.gen }
  })

  const onViewChange = useCallback((note: Note, view: NoteView) => {
    const gen = latest.current.gen
    setOverrides((current) => {
      const next = new Map<number, ViewOverride>()
      // Entries older than the previous press can no longer be shown.
      for (const [id, item] of current) if (item.gen >= gen - 1) next.set(id, item)
      next.set(note.id, { view, gen })
      return next
    })
  }, [])

  const [handlers] = useState<NoteHandlers>(() => ({
    onSelect: (note) => latest.current.onSelect(note),
    onEdit: (note) => latest.current.onEdit(note),
    onMenu: (note, x, y, text) => latest.current.onMenu(note, x, y, text),
    onTag: (note, tag) => latest.current.onTag(note, tag),
    onNoteLink: (id) => latest.current.onNoteLink(id),
    onViewChange,
  }))

  function viewOf(note: Note, index: number): NoteView {
    const own = overrides.get(note.id)
    if (own && own.gen === bulkView.gen) return own.view
    if (index < applyLimit) return bulkView.view
    return own && own.gen === bulkView.gen - 1 ? own.view : bulkView.prev
  }

  const editorInList = editingId !== null && notes.slice(0, mountLimit).some((note) => note.id === editingId)

  // Scroll the selected note just into view: at the bottom when it was below,
  // at the top when above (the panel's scroll-padding keeps the gap).
  const revealed = useRef(revealGen)
  useLayoutEffect(() => {
    if (revealed.current === revealGen) return
    revealed.current = revealGen
    if (selectedId === null) return
    // `:scope >` — note links inside card bodies carry `data-note-id` too.
    panelRef.current?.querySelector(`:scope > article[data-note-id="${selectedId}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [revealGen, selectedId])

  useImperativeHandle(ref, () => ({
    stepSelected: (step) => {
      const index = notes.findIndex((note) => note.id === selectedId)
      if (index < 0) return
      onViewChange(notes[index], step(viewOf(notes[index], index)))
    },
  }))

  return (
    <div
      ref={panelRef}
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
      {editor && !editorInList && editor}
      {notes.slice(0, mountLimit).map((note, index) => editor && note.id === editingId ? (
        <Fragment key={note.id}>{editor}</Fragment>
      ) : (
        <NoteCard
          key={note.id}
          note={note}
          terms={terms}
          selected={note.id === selectedId}
          firstMatch={note.id === firstMatchId}
          view={viewOf(note, index)}
          handlers={handlers}
        />
      ))}
    </div>
  )
}
