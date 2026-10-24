import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AboutDialog } from './components/AboutDialog'
import { CalendarPanel } from './components/CalendarPanel'
import { ContextMenu } from './components/ContextMenu'
import { NoteEditor } from './components/NoteEditor'
import { NotesPanel, type NotesPanelHandle } from './components/NotesPanel'
import { Toolbar } from './components/Toolbar'
import { TagsPanel } from './components/TagsPanel'
import { noteToText, textToDraft } from './noteClipboard'
import { revealNoteEditor } from './noteEditorDom'
import { appendMissingTags, extractTags, withTagLine } from './noteTags'
import { clearUpdatedAtDriftAction, removeTagAction, replaceTagAction, runMassAction } from './massActions'
import { localStamp, parseNotaroXml } from './notesImport'
import { DEFAULT_NOTE_VIEW, growNoteView, shrinkNoteView, type BulkNoteView, type NoteView } from './noteView'
import type { Note, NoteDraft, SortDirection, SortField } from './types'

function sortKey(note: Note, field: SortField): string {
  if (field === 'title') return note.title.trim().toLowerCase()
  return field === 'created' ? note.created_at : note.updated_at
}

function commandKey(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey
}

type NoteResize = 'note-grow' | 'note-shrink' | 'all-grow' | 'all-shrink'

const MENU_RESIZE: Record<string, NoteResize | undefined> = {
  'view:noteGrow': 'note-grow',
  'view:noteShrink': 'note-shrink',
  'view:allGrow': 'all-grow',
  'view:allShrink': 'all-shrink',
}

// By physical key, so Shift (which turns '=' into '+' and '-' into '_') doesn't matter.
function resizeKey(event: KeyboardEvent): 'grow' | 'shrink' | null {
  if (event.code === 'Equal' || event.code === 'NumpadAdd') return 'grow'
  if (event.code === 'Minus' || event.code === 'NumpadSubtract') return 'shrink'
  return null
}

// Ctrl+key: the index of the note to select, from the selected one's index.
const NAV_KEYS: Record<string, ((index: number, last: number) => number) | undefined> = {
  ArrowUp: (index) => index - 1,
  ArrowDown: (index) => index + 1,
  PageUp: (index) => index - 10,
  PageDown: (index) => index + 10,
  Home: () => 0,
  End: (_index, last) => last,
}

interface EditSession {
  note: Note | null
  initial: NoteDraft
  key: number
}

const MIN_SEARCH_LENGTH = 3

// Text shorter than 3 characters (ignoring surrounding whitespace) doesn't filter.
function effectiveSearch(input: string) {
  const text = input.trim()
  return text.length >= MIN_SEARCH_LENGTH ? text : ''
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
  // The one note being edited in place (note null: a new note), if any.
  const [editing, setEditing] = useState<EditSession | null>(null)
  const editingRef = useRef<EditSession | null>(null)
  const editDirty = useRef(false)
  const editKey = useRef(0)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [noteMenu, setNoteMenu] = useState<{ note: Note | null, x: number, y: number, text: string } | null>(null)
  const closeNoteMenu = useCallback(() => setNoteMenu(null), [])
  const [tagsVisible, setTagsVisible] = useState(true)
  const [calendarVisible, setCalendarVisible] = useState(true)
  const [viewLoaded, setViewLoaded] = useState(false)
  const [bulkView, setBulkView] = useState<BulkNoteView>({ view: DEFAULT_NOTE_VIEW, prev: DEFAULT_NOTE_VIEW, gen: 0 })
  const applyBulkView = useCallback((view: NoteView) => {
    setBulkView((current) => ({ view, prev: current.view, gen: current.gen + 1 }))
  }, [])
  const notesPanel = useRef<NotesPanelHandle>(null)
  // A shortcut may arrive both as a native menu accelerator and as a keydown;
  // drop the second of such a pair. Button clicks always act.
  const lastShortcut = useRef({ action: '', source: '', time: 0 })

  const acceptShortcut = useCallback((action: string, source: 'menu' | 'key' | 'click') => {
    const last = lastShortcut.current
    const now = performance.now()
    if (source !== 'click' && last.action === action && last.source !== source
      && last.source !== 'click' && now - last.time < 300) return false
    lastShortcut.current = { action, source, time: now }
    return true
  }, [])

  const toggleColumn = useCallback((column: 'tags' | 'calendar', source: 'menu' | 'key' | 'click') => {
    if (!acceptShortcut(column, source)) return
    if (column === 'tags') setTagsVisible((value) => !value)
    else setCalendarVisible((value) => !value)
  }, [acceptShortcut])

  // Ctrl+plus/minus: the selected note; with Shift: all notes (like the toolbar toggle).
  const resizeNotes = useCallback((action: NoteResize, source: 'menu' | 'key') => {
    if (!acceptShortcut(action, source)) return
    const step = action.endsWith('grow') ? growNoteView : shrinkNoteView
    if (action.startsWith('all')) setBulkView((current) => ({ view: step(current.view), prev: current.view, gen: current.gen + 1 }))
    else notesPanel.current?.stepSelected(step)
  }, [acceptShortcut])

  useEffect(() => {
    void (async () => {
      try {
        const view = await tiny.store?.get('view') as { tags?: boolean, calendar?: boolean } | null
        if (view) {
          setTagsVisible(view.tags !== false)
          setCalendarVisible(view.calendar !== false)
        }
      } catch { /* no store (plain browser): keep defaults */ }
      setViewLoaded(true)
    })()
  }, [])

  useEffect(() => {
    if (!viewLoaded) return
    void tiny.menu?.update?.('view:tags', { checked: tagsVisible })?.catch(() => {})
    void tiny.menu?.update?.('view:calendar', { checked: calendarVisible })?.catch(() => {})
    void tiny.store?.set('view', { tags: tagsVisible, calendar: calendarVisible })?.catch(() => {})
  }, [viewLoaded, tagsVisible, calendarVisible])

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

  // Real tags only (without the `all` / `untagged` entries), for the editor's suggestions.
  const tagNames = useMemo(() => tags.slice(2).map((tag) => tag.name), [tags])

  // Notes offered after `[[` in the editor: the most recently changed first.
  const linkTargets = useMemo(() => [...notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [notes])

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

  // Bumped to scroll the selected note into view (NotesPanel, once rendered).
  const [revealGen, setRevealGen] = useState(0)
  const revealSelected = useCallback(() => setRevealGen((gen) => gen + 1), [])

  // A filter change keeps the selected note if it is still listed, otherwise
  // selects the top one; a sort change keeps it too. Either way it is scrolled
  // into view. Adjusted during render, so the new list never shows a stale pick.
  const filterKey = `${search}\n${selectedTag}\n${selectedMonth ?? ''}`
  const orderKey = `${sortField} ${sortDirection}`
  const [listKeys, setListKeys] = useState({ filterKey, orderKey })
  if (listKeys.filterKey !== filterKey || listKeys.orderKey !== orderKey) {
    setListKeys({ filterKey, orderKey })
    if (listKeys.filterKey !== filterKey && !visibleNotes.some((note) => note.id === selectedId)) {
      setSelectedId(visibleNotes[0]?.id ?? null)
    }
    setRevealGen((gen) => gen + 1)
  }

  // Ctrl+Up/Down (±1), Ctrl+PgUp/PgDn (±10), Ctrl+Home/End: move the selection
  // within the listed notes; with nothing selected, start from the top note.
  function moveSelection(target: (index: number, last: number) => number) {
    if (visibleNotes.length === 0) return
    const current = visibleNotes.findIndex((note) => note.id === selectedId)
    const last = visibleNotes.length - 1
    const index = current < 0 ? 0 : Math.max(0, Math.min(last, target(current, last)))
    setSelectedId(visibleNotes[index].id)
    revealSelected()
  }

  const startEditing = useCallback((note: Note | null, initial: NoteDraft) => {
    editKey.current += 1
    const session = { note, initial, key: editKey.current }
    editingRef.current = session
    editDirty.current = false
    setEditing(session)
    if (note) setSelectedId(note.id)
  }, [])

  const closeEditor = useCallback(() => {
    editingRef.current = null
    editDirty.current = false
    setEditing(null)
  }, [])

  const onEditorDirty = useCallback((dirty: boolean) => {
    editDirty.current = dirty
  }, [])

  // Before an action that changes which notes are shown or edited: an open
  // editor closes — after a confirmation if it has unsaved changes.
  const leaveEditor = useCallback(async (): Promise<boolean> => {
    if (!editingRef.current) return true
    if (editDirty.current) {
      const discard = await tiny.dialog.confirm('Discard unsaved changes?', {
        detail: 'The note you are editing has changes that are not saved.',
        ok: 'Discard',
        cancel: 'Keep editing',
      })
      if (!discard) {
        revealNoteEditor()
        return false
      }
    }
    closeEditor()
    return true
  }, [closeEditor])

  const guarded = useCallback((action: () => void) => {
    void leaveEditor().then((ok) => { if (ok) action() })
  }, [leaveEditor])

  async function saveNote(note: Note | null, draft: NoteDraft) {
    // Tags are the `#words` of the body, collected once the note is saved.
    const payload = { title: draft.title, body: draft.body, tags: extractTags(draft.body) }
    if (note) {
      await tiny.api.call('updateNote', { id: note.id, ...payload })
    } else {
      const created = await tiny.api.call('addNote', payload) as Note
      setSelectedId(created.id)
    }
    await refresh()
    closeEditor()
    revealSelected()
  }

  async function deleteNote(note: Note) {
    if (!await leaveEditor()) return
    const confirmed = await tiny.dialog.confirm('Delete this note?', { detail: note.title, ok: 'Delete' })
    if (!confirmed) return
    // The selection moves to the next listed note, or the previous one at the end.
    const index = visibleNotes.findIndex((item) => item.id === note.id)
    const neighbor = index < 0 ? null : (visibleNotes[index + 1] ?? visibleNotes[index - 1] ?? null)
    await tiny.api.call('deleteNote', { id: note.id })
    await refresh()
    setSelectedId((current) => current === note.id ? neighbor?.id ?? null : current)
    revealSelected()
    document.getElementById('notes-panel')?.focus({ preventScroll: true })
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
    if (!await leaveEditor()) return
    const { text } = await tiny.clipboard.read()
    if (!text?.trim()) return
    startEditing(null, textToDraft(text))
  }

  const openNewNote = useCallback(() => {
    guarded(() => startEditing(null, { title: '', body: '' }))
  }, [guarded, startEditing])

  useEffect(() => tiny.menu.on((id) => {
    if (id === 'about') setAboutOpen(true)
    // Ctrl+N arrives as a native menu accelerator (WebView2 swallows the key).
    if (id === 'note:new' && !document.querySelector('dialog[open], .context-menu')) openNewNote()
    if (id === 'view:tags') toggleColumn('tags', 'menu')
    if (id === 'view:calendar') toggleColumn('calendar', 'menu')
    const resize = MENU_RESIZE[id]
    if (resize && !document.querySelector('dialog[open], .context-menu')) resizeNotes(resize, 'menu')
  }), [toggleColumn, resizeNotes, openNewNote])

  async function exportNotes(scope: 'all' | 'listed') {
    const ids = scope === 'all' ? [] : visibleNotes.map((note) => note.id)
    if (scope === 'listed' && ids.length === 0) return
    const stamp = new Date().toISOString().slice(0, 10)
    const path = await tiny.dialog.saveFile({ types: ['xml'], name: `notaro-${scope === 'all' ? 'all' : 'selected'}-${stamp}` })
    if (!path) return
    try {
      const { count } = await tiny.api.call('exportNotes', { all: scope === 'all', ids, path }) as { count: number }
      await tiny.dialog.alert(`Exported ${count} ${count === 1 ? 'note' : 'notes'}.`, path)
    } catch (error) {
      await tiny.dialog.alert('Export failed.', error instanceof Error ? error.message : String(error))
    }
  }

  async function importNotes() {
    if (!await leaveEditor()) return
    const path = await tiny.dialog.openFile({ types: ['xml'] })
    if (!path) return
    try {
      const parsed = parseNotaroXml(await tiny.api.call('readTextFile', { path }) as string)
      if ('error' in parsed) {
        await tiny.dialog.alert('Nothing to import.', parsed.error)
        return
      }
      const tag = `imported_${localStamp(new Date())}`
      const notes = parsed.notes.map((note) => {
        const body = withTagLine(note.body, [...note.tags, tag])
        return { ...note, body, tags: extractTags(body) }
      })
      await tiny.api.call('importNotes', { notes })
      await refresh()
      setSearchInput('')
      setSearch('')
      setSelectedMonth(null)
      setSelectedTag(tag)
    } catch (error) {
      await tiny.dialog.alert('Import failed.', error instanceof Error ? error.message : String(error))
    }
  }

  async function exitApp() {
    if (await leaveEditor()) void tiny.api.call('quitApp', {})
  }

  // Shared flow for the Tools menu: dry-run the action against the current
  // notes, confirm the affected count, persist, then refresh.
  async function runToolAction(label: string, action: Parameters<typeof runMassAction>[1]) {
    if (!await leaveEditor()) return
    const updates = runMassAction(notes, action)
    if (updates.length === 0) {
      await tiny.dialog.alert(`${label}: no notes to update.`)
      return
    }
    const plural = updates.length === 1 ? 'note' : 'notes'
    const ok = await tiny.dialog.confirm(`${label}?`, { detail: `This will update ${updates.length} ${plural}.` })
    if (!ok) return
    try {
      const { count, backup } = await tiny.api.call('bulkUpdateNotes', { updates }) as { count: number; backup: string | null }
      await refresh()
      await tiny.dialog.alert(`Updated ${count} ${count === 1 ? 'note' : 'notes'}.`, backup ? `Backup saved: ${backup}` : undefined)
    } catch (error) {
      await tiny.dialog.alert(`${label} failed.`, error instanceof Error ? error.message : String(error))
    }
  }

  async function removeTagTool() {
    const tag = (await tiny.dialog.prompt('Remove tag (without #):'))?.trim()
    if (!tag) return
    await runToolAction(`Remove #${tag}`, removeTagAction(tag))
  }

  async function replaceTagTool() {
    const oldTag = (await tiny.dialog.prompt('Replace tag (without #):'))?.trim()
    if (!oldTag) return
    const newTag = (await tiny.dialog.prompt(`Replace #${oldTag} with (without #):`))?.trim()
    if (!newTag) return
    await runToolAction(`Replace #${oldTag} with #${newTag}`, replaceTagAction(oldTag, newTag))
  }

  async function clearUpdatedAtTool() {
    await runToolAction('Clear updated-at drift', clearUpdatedAtDriftAction())
  }

  // File/Edit menu commands act on the latest state; one subscription reads it through a ref.
  const fileEditCommands = useRef<Record<string, () => void>>({})
  useEffect(() => {
    fileEditCommands.current = {
      'file:import': () => void importNotes(),
      'file:exportAll': () => void exportNotes('all'),
      'file:exportListed': () => void exportNotes('listed'),
      'file:exit': () => void exitApp(),
      'note:copy': () => {
        const note = notes.find((item) => item.id === selectedId)
        if (note) void copyNote(note)
      },
      'note:paste': () => void pasteAsNewNote(),
      'note:delete': deleteSelected,
      'tools:removeTag': () => void removeTagTool(),
      'tools:replaceTag': () => void replaceTagTool(),
      'tools:clearUpdatedAt': () => void clearUpdatedAtTool(),
    }
  })

  useEffect(() => tiny.menu.on((id) => {
    if (document.querySelector('dialog[open], .context-menu')) return
    fileEditCommands.current[id]?.()
  }), [])

  const hasSelected = notes.some((item) => item.id === selectedId)
  const hasListed = visibleNotes.length > 0
  useEffect(() => {
    void tiny.menu?.update?.('note:copy', { enabled: hasSelected })?.catch(() => {})
    void tiny.menu?.update?.('note:delete', { enabled: hasSelected })?.catch(() => {})
  }, [hasSelected])
  useEffect(() => {
    void tiny.menu?.update?.('file:exportListed', { enabled: hasListed })?.catch(() => {})
  }, [hasListed])

  function openEditNote(note: Note) {
    if (editingRef.current?.note?.id === note.id) {
      revealNoteEditor()
      return
    }
    // Tags kept apart by older versions join the body, where tags live now.
    guarded(() => startEditing(note, { title: note.title, body: appendMissingTags(note.body, note.tags) }))
  }

  function resetFilters() {
    setSearchInput('')
    setSearch('')
    setSelectedTag('all')
    setSelectedMonth(null)
  }

  // The tag and calendar controls change the filter together with the Find text.
  function changeFilter(change: () => void) {
    guarded(() => {
      setSearch(effectiveSearch(searchInput))
      change()
    })
  }

  // A `[text](#note-id)` link: select that note; when the filters hide it, clear them first.
  function openLinkedNote(id: number) {
    if (!notes.some((note) => note.id === id)) {
      void tiny.dialog.alert(`Note ${id} does not exist.`, 'It may have been deleted.')
      return
    }
    const show = () => {
      setSelectedId(id)
      revealSelected()
    }
    if (visibleNotes.some((note) => note.id === id)) show()
    else guarded(() => {
      resetFilters()
      show()
    })
  }

  const filtered = search !== '' || selectedTag !== 'all' || selectedMonth !== null

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (aboutOpen || noteMenu) return
      const target = event.target as HTMLElement | null
      const typing = target?.matches('input, textarea, select') ?? false
      // The editor handles its own keys (Esc, Ctrl+Enter, formatting); only
      // the view shortcuts and Find below work from inside it.
      const inEditor = target?.closest('.note-editor') != null
      const selectedNote = notes.find((item) => item.id === selectedId)
      const key = event.key.toLowerCase()
      const nav = commandKey(event) ? NAV_KEYS[event.key] : undefined
      if (commandKey(event) && key === 'f') {
        event.preventDefault()
        const input = document.getElementById('find-input') as HTMLInputElement | null
        input?.focus()
        input?.select()
      } else if (commandKey(event) && event.shiftKey && !event.altKey && (key === 't' || key === 'd')) {
        event.preventDefault()
        if (!event.repeat) toggleColumn(key === 't' ? 'tags' : 'calendar', 'key')
      } else if (commandKey(event) && !event.altKey && resizeKey(event)) {
        // Also keeps the browser's own Ctrl+plus/minus page zoom away.
        event.preventDefault()
        const grow = resizeKey(event) === 'grow'
        if (!event.repeat) resizeNotes(event.shiftKey ? (grow ? 'all-grow' : 'all-shrink') : (grow ? 'note-grow' : 'note-shrink'), 'key')
      } else if (inEditor) {
        return
      } else if (nav && !event.shiftKey && !event.altKey
        // The Find field keeps Ctrl+Home/End for its text cursor.
        && (!typing || (target?.id === 'find-input' && event.key !== 'Home' && event.key !== 'End'))) {
        event.preventDefault()
        moveSelection(nav)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        if (filtered) {
          guarded(resetFilters)
        } else {
          if (!visibleNotes.some((note) => note.id === selectedId)) setSelectedId(visibleNotes[0]?.id ?? null)
          revealSelected()
        }
        document.getElementById('notes-panel')?.focus({ preventScroll: true })
      } else if (typing || event.altKey) {
        return
      } else if (
        (event.key === 'Insert' && !event.ctrlKey && !event.shiftKey && !event.metaKey) ||
        (commandKey(event) && !event.shiftKey && key === 'n')) {
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
      <Toolbar
        search={searchInput}
        visibleCount={visibleNotes.length}
        tagsVisible={tagsVisible}
        calendarVisible={calendarVisible}
        onToggleTags={() => toggleColumn('tags', 'click')}
        onToggleCalendar={() => toggleColumn('calendar', 'click')}
        onNewNote={openNewNote}
        editing={editing !== null}
        canEdit={editing !== null || visibleNotes.some((note) => note.id === selectedId)}
        onEditButton={() => {
          if (editingRef.current) {
            revealNoteEditor()
            return
          }
          const note = visibleNotes.find((item) => item.id === selectedId)
          if (note) openEditNote(note)
        }}
        notesView={bulkView.view}
        onNotesViewChange={applyBulkView}
        onSearchChange={(value) => {
          setSearchInput(value)
          const next = effectiveSearch(value)
          if (next !== search) guarded(() => setSearch(next))
        }}
        sort={{
          field: sortField,
          direction: sortDirection,
          onFieldChange: setSortField,
          onDirectionChange: () => setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'),
        }}
      />
      <div className="columns">
        {tagsVisible && <TagsPanel tags={tags} selected={selectedTag} onSelect={(tag) => { if (tag !== selectedTag) changeFilter(() => setSelectedTag(tag)) }} />}
        <main className="main">
          <NotesPanel
            ref={notesPanel}
            notes={visibleNotes}
            terms={terms}
            selectedId={selectedId}
            revealGen={revealGen}
            firstMatchId={firstMatchId}
            bulkView={bulkView}
            onSelect={(note) => setSelectedId((current) => current === note.id ? null : note.id)}
            onEdit={openEditNote}
            onMenu={openNoteMenu}
            onTag={(note, tag) => {
              // The note's stored spelling, as listed in the tags column.
              const lower = tag.toLocaleLowerCase()
              const name = note.tags.find((item) => item.toLocaleLowerCase() === lower) ?? tag
              if (name !== selectedTag) changeFilter(() => setSelectedTag(name))
            }}
            onNoteLink={openLinkedNote}
            editingId={editing?.note?.id ?? null}
            editor={editing && (
              <NoteEditor
                key={editing.key}
                note={editing.note}
                initial={editing.initial}
                onSave={(draft) => saveNote(editing.note, draft)}
                onCancel={closeEditor}
                onDirtyChange={onEditorDirty}
                tags={tagNames}
                linkTargets={linkTargets}
              />
            )}
          />
        </main>
        {calendarVisible && (
          <aside className="side">
            <CalendarPanel groups={calendarGroups} selected={selectedMonth} onSelect={(month) => changeFilter(() => setSelectedMonth(month))} />
          </aside>
        )}
      </div>
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
