import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarPanel } from './components/CalendarPanel'
import { NoteDialog } from './components/NoteDialog'
import { NotesPanel } from './components/NotesPanel'
import { SortControls, Toolbar } from './components/Toolbar'
import { TagsPanel } from './components/TagsPanel'
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
  const [dialogOpen, setDialogOpen] = useState(false)

  const refresh = useCallback(async () => {
    const result = await tiny.api.call('listNotes', {}) as Note[]
    setNotes(result)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

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

  async function deleteSelected() {
    if (selectedId === null) return
    const note = notes.find((item) => item.id === selectedId)
    if (!note) return
    const confirmed = await tiny.dialog.confirm('Delete this note?', { detail: note.title, ok: 'Delete' })
    if (!confirmed) return
    await tiny.api.call('deleteNote', { id: selectedId })
    setSelectedId(null)
    await refresh()
  }

  function openNewNote() {
    setDialogNote(null)
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
      if (dialogOpen) return
      const target = event.target as HTMLElement | null
      const typing = target?.matches('input, textarea, select') ?? false
      if (commandKey(event) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        const input = document.getElementById('find-input') as HTMLInputElement | null
        input?.focus()
        input?.select()
      } else if (event.key === 'Insert' && !typing) {
        event.preventDefault()
        openNewNote()
      } else if (event.key === 'Enter' && !typing && selectedId !== null) {
        event.preventDefault()
        const note = notes.find((item) => item.id === selectedId)
        if (note) openEditNote(note)
      } else if (event.key === 'Delete' && !typing) {
        event.preventDefault()
        void deleteSelected()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        resetFilters()
        document.getElementById('notes-panel')?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  })

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
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={saveNote}
      />
    </div>
  )
}
