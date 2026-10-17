import { useCallback, useEffect, useMemo, useState } from 'react'
import { AboutDialog } from './components/AboutDialog'
import { CalendarPanel } from './components/CalendarPanel'
import { ContextMenu } from './components/ContextMenu'
import { NoteDialog } from './components/NoteDialog'
import { NotesPanel } from './components/NotesPanel'
import { SortControls, Toolbar } from './components/Toolbar'
import { TagsPanel } from './components/TagsPanel'
import { noteToText, textToDraft } from './noteClipboard'
import type { Note, NoteDraft, SortDirection, SortField } from './types'

function splitTags(value: string): string[] {
  return value.split(',').map((tag) => tag.trim()).filter(Boolean)
}

function sortKey(note: Note, field: SortField): string {
  if (field === 'title') return note.title.trim().toLowerCase()
  return field === 'created' ? note.created_at : note.updated_at
}

function commandKey(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey
}

export default function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState('all')
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('updated')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [dialogNote, setDialogNote] = useState<Note | null>(null)
  const [dialogInitial, setDialogInitial] = useState<NoteDraft | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [noteMenu, setNoteMenu] = useState<{ note: Note | null, x: number, y: number, text: string } | null>(null)
  const closeNoteMenu = useCallback(() => setNoteMenu(null), [])

  const refresh = useCallback(async () => {
    const result = await tiny.api.call('listNotes', {}) as Note[]
    setNotes(result)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => tiny.menu.on((id) => {
    if (id === 'about') setAboutOpen(true)
    // Ctrl+N arrives as a native menu accelerator (WebView2 swallows the key).
    if (id === 'note:new' && !document.querySelector('dialog[open], .context-menu')) openNewNote()
  }), [])

  const sortedNotes = useMemo(() => [...notes].sort((a, b) => {
    const order = sortDirection === 'asc' ? 1 : -1
    return sortKey(a, sortField).localeCompare(sortKey(b, sortField)) * order
  }), [notes, sortDirection, sortField])

  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    let untagged = 0
    for (const note of notes) {
      if (note.tags.length === 0) untagged += 1
      for (const tag of note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return [
      { name: 'all', count: notes.length },
      { name: 'untagged', count: untagged },
      ...[...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, count]) => ({ name, count })),
    ]
  }, [notes])

  const calendarGroups = useMemo(() => {
    const years = new Map<string, Set<string>>()
    for (const note of notes) {
      for (const stamp of [note.created_at, note.updated_at]) {
        const [year, month] = stamp.slice(0, 7).split('-')
        if (!year || !month) continue
        if (!years.has(year)) years.set(year, new Set())
        years.get(year)?.add(month)
      }
    }
    const direction = sortDirection === 'asc' ? 1 : -1
    return [...years.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]) * direction)
      .map(([year, months]) => ({
        year,
        months: [...months].sort((a, b) => a.localeCompare(b) * direction),
      }))
  }, [notes, sortDirection])

  const terms = useMemo(() => search.toLowerCase().split(/\s+/).filter(Boolean), [search])

  const visibleNotes = useMemo(() => sortedNotes.filter((note) => {
    const tagMatches = selectedTag === 'all'
      || (selectedTag === 'untagged' ? note.tags.length === 0 : note.tags.includes(selectedTag))
    const monthMatches = !selectedMonth
      || note.created_at.startsWith(selectedMonth)
      || note.updated_at.startsWith(selectedMonth)
    if (!tagMatches || !monthMatches) return false
    if (terms.length === 0) return true
    const haystack = [note.title, note.body, note.tags.join(' ')].join(' ').toLowerCase()
    return terms.some((term) => haystack.includes(term))
  }), [selectedMonth, selectedTag, sortedNotes, terms])

  const firstMatchId = terms.length === 0 ? null : visibleNotes.find((note) => {
    const haystack = [note.title, note.body, note.tags.join(' ')].join(' ').toLowerCase()
    return terms.some((term) => haystack.includes(term))
  })?.id ?? null

  async function saveNote(draft: NoteDraft) {
    const payload = { title: draft.title, body: draft.body, tags: splitTags(draft.tags) }
    if (dialogNote) {
      await tiny.api.call('updateNote', { id: dialogNote.id, ...payload })
    } else {
      const created = await tiny.api.call('addNote', payload) as Note
      setSelectedId(created.id)
    }
    await refresh()
  }

  async function deleteNote(note: Note) {
    const confirmed = await tiny.dialog.confirm('Delete this note?', { detail: note.title, ok: 'Delete' })
    if (!confirmed) return
    await tiny.api.call('deleteNote', { id: note.id })
    setSelectedId((current) => current === note.id ? null : current)
    await refresh()
  }

  function deleteSelected() {
    const note = notes.find((item) => item.id === selectedId)
    if (note) void deleteNote(note)
  }

  // A right-click on a card selects it; on empty space the menu acts on the
  // current selection, if any.
  function openNoteMenu(note: Note | null, x: number, y: number, text: string) {
    if (note) setSelectedId(note.id)
    setNoteMenu({ note: note ?? notes.find((item) => item.id === selectedId) ?? null, x, y, text })
  }

  async function copyNote(note: Note) {
    await tiny.clipboard.write({ text: noteToText(note) })
  }

  async function pasteAsNewNote() {
    const { text } = await tiny.clipboard.read()
    if (!text?.trim()) return
    setDialogNote(null)
    setDialogInitial(textToDraft(text))
    setDialogOpen(true)
  }

  function openNewNote() {
    setDialogNote(null)
    setDialogInitial(null)
    setDialogOpen(true)
  }

  function openEditNote(note: Note) {
    setDialogNote(note)
    setDialogOpen(true)
  }

  function resetFilters() {
    setSearchInput('')
    setSearch('')
    setSelectedTag('all')
    setSelectedMonth(null)
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (dialogOpen || aboutOpen || noteMenu) return
      const target = event.target as HTMLElement | null
      const typing = target?.matches('input, textarea, select') ?? false
      const selectedNote = notes.find((item) => item.id === selectedId)
      const key = event.key.toLowerCase()
      if (commandKey(event) && key === 'f') {
        event.preventDefault()
        const input = document.getElementById('find-input') as HTMLInputElement | null
        input?.focus()
        input?.select()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        resetFilters()
        document.getElementById('notes-panel')?.focus()
      } else if (typing || event.altKey) {
        return
      } else if (event.key === 'Insert' || (commandKey(event) && !event.shiftKey && key === 'n')) {
        event.preventDefault()
        openNewNote()
      } else if (commandKey(event) && !event.shiftKey && key === 'v') {
        event.preventDefault()
        void pasteAsNewNote()
      } else if (commandKey(event) && !event.shiftKey && key === 'c') {
        // Selected text copies natively; otherwise the whole selected note.
        if (!selectedNote || !window.getSelection()?.isCollapsed) return
        event.preventDefault()
        void copyNote(selectedNote)
      } else if ((event.key === 'Enter' || event.key === 'F2') && selectedNote) {
        event.preventDefault()
        openEditNote(selectedNote)
      } else if (event.key === 'Delete') {
        event.preventDefault()
        deleteSelected()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  })

  const menuNote = noteMenu?.note ?? null

  return (
    <div className="app">
      <TagsPanel tags={tags} selected={selectedTag} onSelect={setSelectedTag} onNewNote={openNewNote} />
      <main className="main">
        <Toolbar
          search={searchInput}
          visibleCount={visibleNotes.length}
          onSearchChange={setSearchInput}
          onSearch={() => setSearch(searchInput)}
        />
        <NotesPanel
          notes={visibleNotes}
          terms={terms}
          selectedId={selectedId}
          firstMatchId={firstMatchId}
          onSelect={(note) => setSelectedId((current) => current === note.id ? null : note.id)}
          onEdit={openEditNote}
          onMenu={openNoteMenu}
        />
      </main>
      <aside className="side">
        <SortControls
          field={sortField}
          direction={sortDirection}
          onFieldChange={setSortField}
          onDirectionChange={() => setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')}
        />
        <CalendarPanel groups={calendarGroups} selected={selectedMonth} onSelect={setSelectedMonth} />
      </aside>
      <NoteDialog
        note={dialogNote}
        initial={dialogInitial}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={saveNote}
      />
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      {noteMenu && (
        <ContextMenu
          x={noteMenu.x}
          y={noteMenu.y}
          onClose={closeNoteMenu}
          items={[
            { label: 'New Note', shortcut: 'Ins or Ctrl+N', onSelect: openNewNote },
            { label: 'Paste as Note', shortcut: 'Ctrl+V', onSelect: () => void pasteAsNewNote() },
            { separator: true },
            ...(noteMenu.text ? [{ label: 'Copy Selection', onSelect: () => void tiny.clipboard.write({ text: noteMenu.text }) }] : []),
            { label: 'Copy Note', shortcut: 'Ctrl+C', disabled: !menuNote, onSelect: () => menuNote && void copyNote(menuNote) },
            { label: 'Edit', shortcut: 'F2 or Enter', disabled: !menuNote, onSelect: () => menuNote && openEditNote(menuNote) },
            { separator: true },
            { label: 'Delete', shortcut: 'Del', disabled: !menuNote, onSelect: () => menuNote && void deleteNote(menuNote) },
          ]}
        />
      )}
    </div>
  )
}
