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
import { pickItem } from './multiSelect'
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

// Help > Keyboard Shortcuts (F1): a separate, non-modal window; opening it
// again just focuses it. Its page renders README.md's shortcut list.
function openShortcutsWindow() {
  void tiny.win.open('shortcuts', {
    page: 'shortcuts.html',
    title: 'Notaro — Keyboard Shortcuts',
    size: '760x640',
    minSize: '420x300',
    chrome: { menu: false },
  })?.catch((error: unknown) => {
    void tiny.dialog.alert('Cannot open the shortcuts window.', error instanceof Error ? error.message : String(error))
  })
}

const NO_IDS: ReadonlySet<number> = new Set()

// Text shorter than 3 characters (ignoring surrounding whitespace) doesn't filter.
function effectiveSearch(input: string) {
  const text = input.trim()
  return text.length >= MIN_SEARCH_LENGTH ? text : ''
}

export default function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  // Several selected notes (Ctrl+click, Ctrl+Shift+arrows, Ctrl+A); they count
  // only while they include selectedId, so a plain selection change drops them.
  const [multiIds, setMultiIds] = useState<ReadonlySet<number>>(NO_IDS)
  const selectRange = useRef<{ anchor: number, base: ReadonlySet<number>, cursor: number } | null>(null)
  const selection = useMemo<ReadonlySet<number>>(() => {
    if (selectedId !== null && multiIds.size > 1 && multiIds.has(selectedId)) return multiIds
    return selectedId === null ? NO_IDS : new Set([selectedId])
  }, [selectedId, multiIds])
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  // Tag and month filters: empty = no filter; a note matches any of the listed ones.
  const [selectedTags, setSelectedTags] = useState<readonly string[]>([])
  const [selectedMonths, setSelectedMonths] = useState<readonly string[]>([])
  const [sortField, setSortField] = useState<SortField>('updated')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  // The one note being edited in place (note null: a new note), if any.
  const [editing, setEditing] = useState<EditSession | null>(null)
  const editingRef = useRef<EditSession | null>(null)
  const editDirty = useRef(false)
  const editKey = useRef(0)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [noteMenu, setNoteMenu] = useState<{ note: Note | null, notes: Note[], x: number, y: number, text: string } | null>(null)
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

  // A selected tag that no note carries any more (its notes deleted or retagged) is
  // dropped from the filter; with none left, `all` is selected. Find and the calendar stay.
  const liveSelectedTags = selectedTags.filter((name) => tags.some((tag) => tag.name === name && tag.count > 0))
  if (liveSelectedTags.length !== selectedTags.length) setSelectedTags(liveSelectedTags)

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
    const tagMatches = selectedTags.length === 0 || selectedTags.some((tag) =>
      tag === 'untagged' ? note.tags.length === 0 : note.tags.includes(tag))
    const monthMatches = selectedMonths.length === 0 || selectedMonths.some((month) =>
      note.created_at.startsWith(month) || note.updated_at.startsWith(month))
    if (!tagMatches || !monthMatches) return false
    if (terms.length === 0) return true
    const haystack = [note.title, note.body, note.tags.join(' ')].join(' ').toLowerCase()
    return terms.some((term) => haystack.includes(term))
  }), [selectedMonths, selectedTags, sortedNotes, terms])

  // The notes Copy / Delete / Export Selected act on: several selected ones in
  // list order, or the one current note (even when the filters hide it).
  const selectedNotes = useMemo(() => selection.size > 1
    ? visibleNotes.filter((note) => selection.has(note.id))
    : notes.filter((note) => note.id === selectedId), [notes, selectedId, selection, visibleNotes])

  const firstMatchId = terms.length === 0 ? null : visibleNotes.find((note) => {
    const haystack = [note.title, note.body, note.tags.join(' ')].join(' ').toLowerCase()
    return terms.some((term) => haystack.includes(term))
  })?.id ?? null

  // Bumped to scroll the selected note into view (NotesPanel, once rendered).
  const [revealGen, setRevealGen] = useState(0)
  const revealSelected = useCallback(() => setRevealGen((gen) => gen + 1), [])

  // A filter change keeps the selected notes that are still listed, otherwise
  // selects the top one; a sort change keeps them too. Either way the current one is
  // scrolled into view. Adjusted during render, so the new list never shows a stale pick.
  const filterKey = `${search}\n${selectedTags.join('\t')}\n${selectedMonths.join('\t')}`
  const orderKey = `${sortField} ${sortDirection}`
  const [listKeys, setListKeys] = useState({ filterKey, orderKey })
  if (listKeys.filterKey !== filterKey || listKeys.orderKey !== orderKey) {
    setListKeys({ filterKey, orderKey })
    if (listKeys.filterKey !== filterKey) {
      const kept = visibleNotes.filter((note) => selection.has(note.id)).map((note) => note.id)
      if (!kept.includes(selectedId ?? NaN)) setSelectedId(kept[0] ?? visibleNotes[0]?.id ?? null)
      setMultiIds(kept.length > 1 ? new Set(kept) : NO_IDS)
    }
    setRevealGen((gen) => gen + 1)
  }

  // The current note becomes the only selected one.
  function selectOnly(id: number | null) {
    selectRange.current = null
    setSelectedId(id)
    setMultiIds(NO_IDS)
  }

  function setSelection(current: number | null, ids: ReadonlySet<number>) {
    setSelectedId(current)
    setMultiIds(ids.size > 1 ? ids : NO_IDS)
  }

  // Click: select the note only (or unselect it, when it is the only one);
  // Ctrl+click: add it to the selection or remove it.
  function selectNote(note: Note, toggle: boolean) {
    selectRange.current = null
    if (!toggle) {
      if (selection.size > 1) selectOnly(note.id)
      else selectOnly(selectedId === note.id ? null : note.id)
      return
    }
    const next = new Set(selection)
    if (next.has(note.id)) {
      next.delete(note.id)
      setSelection(note.id === selectedId ? [...next].at(-1) ?? null : selectedId, next)
    } else {
      next.add(note.id)
      setSelection(note.id, next)
    }
  }

  // Ctrl+A: every listed note.
  function selectAllListed() {
    if (visibleNotes.length === 0) return
    selectRange.current = null
    const current = visibleNotes.some((note) => note.id === selectedId) ? selectedId : visibleNotes[0].id
    setSelection(current, new Set(visibleNotes.map((note) => note.id)))
  }

  // Ctrl+Up/Down (±1), Ctrl+PgUp/PgDn (±10), Ctrl+Home/End: move the selection
  // within the listed notes; with nothing selected, start from the top note.
  // With Shift (`extend`) the notes from where it started to the new one are
  // selected too, on top of what was selected before.
  function moveSelection(target: (index: number, last: number) => number, extend = false) {
    if (visibleNotes.length === 0) return
    const current = visibleNotes.findIndex((note) => note.id === selectedId)
    const last = visibleNotes.length - 1
    const index = current < 0 ? 0 : Math.max(0, Math.min(last, target(current, last)))
    const id = visibleNotes[index].id
    if (!extend) {
      selectOnly(id)
    } else {
      let range = selectRange.current
      let anchor = range ? visibleNotes.findIndex((note) => note.id === range?.anchor) : -1
      if (!range || range.cursor !== selectedId || anchor < 0) {
        anchor = current < 0 ? index : current
        range = { anchor: visibleNotes[anchor].id, base: selection, cursor: id }
      }
      const next = new Set(range.base)
      for (let i = Math.min(anchor, index); i <= Math.max(anchor, index); i += 1) next.add(visibleNotes[i].id)
      selectRange.current = { ...range, cursor: id }
      setSelection(id, next)
    }
    revealSelected()
  }

  const startEditing = useCallback((note: Note | null, initial: NoteDraft) => {
    editKey.current += 1
    const session = { note, initial, key: editKey.current }
    editingRef.current = session
    editDirty.current = false
    setEditing(session)
    if (note) {
      selectRange.current = null
      setSelectedId(note.id)
      setMultiIds(NO_IDS)
    }
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
      selectOnly(created.id)
    }
    await refresh()
    closeEditor()
    revealSelected()
  }

  async function deleteNotes(list: Note[]) {
    if (list.length === 0 || !await leaveEditor()) return
    const one = list.length === 1
    const titles = list.slice(0, 5).map((note) => note.title.trim() || `Note ${note.id}`).join(', ')
    const confirmed = await tiny.dialog.confirm(one ? 'Delete this note?' : `Delete ${list.length} notes?`, {
      detail: one ? list[0].title : list.length > 5 ? `${titles} and ${list.length - 5} more.` : titles,
      ok: 'Delete',
    })
    if (!confirmed) return
    // The selection moves to the next listed note, or the previous one at the end.
    const ids = new Set(list.map((note) => note.id))
    const indexes = visibleNotes.flatMap((note, index) => ids.has(note.id) ? [index] : [])
    const kept = (note: Note) => !ids.has(note.id)
    const neighbor = indexes.length === 0 ? null
      : visibleNotes.slice(indexes.at(-1)! + 1).find(kept) ?? visibleNotes.slice(0, indexes[0]).findLast(kept) ?? null
    await tiny.api.call('deleteNotes', { ids: [...ids] })
    await refresh()
    if ([...selection].some((id) => ids.has(id))) {
      if (neighbor) selectOnly(neighbor.id)
      else {
        // Nothing left in the list; a filter reset (the last notes of a tag) may have picked a note already.
        selectRange.current = null
        setSelectedId((current) => current != null && ids.has(current) ? null : current)
        setMultiIds(NO_IDS)
      }
    }
    revealSelected()
    document.getElementById('notes-panel')?.focus({ preventScroll: true })
  }

  function deleteSelected() {
    void deleteNotes(selectedNotes)
  }

  // A right-click on a card selects it (keeping the selection when it is part of
  // it); on empty space the menu acts on the current selection, if any.
  function openNoteMenu(note: Note | null, x: number, y: number, text: string) {
    let targets = selectedNotes
    if (note && selection.size > 1 && selection.has(note.id)) {
      setSelectedId(note.id)
    } else if (note) {
      selectOnly(note.id)
      targets = [note]
    }
    setNoteMenu({ note: note ?? selectedNotes.find((item) => item.id === selectedId) ?? null, notes: targets, x, y, text })
  }

  // Several notes are copied one after another, separated by a `---` line.
  async function copyNotes(list: Note[]) {
    if (list.length === 0) return
    await tiny.clipboard.write({ text: list.map(noteToText).join('\n\n---\n\n') })
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
    if (id === 'help:shortcuts') openShortcutsWindow()
    // Ctrl+N arrives as a native menu accelerator (WebView2 swallows the key).
    if (id === 'note:new' && !document.querySelector('dialog[open], .context-menu')) openNewNote()
    if (id === 'view:tags') toggleColumn('tags', 'menu')
    if (id === 'view:calendar') toggleColumn('calendar', 'menu')
    const resize = MENU_RESIZE[id]
    if (resize && !document.querySelector('dialog[open], .context-menu')) resizeNotes(resize, 'menu')
  }), [toggleColumn, resizeNotes, openNewNote])

  // `all`: every listed note (clear the filters to export the whole database).
  async function exportNotes(scope: 'all' | 'selected', list: Note[] = scope === 'all' ? visibleNotes : selectedNotes) {
    const ids = list.map((note) => note.id)
    if (ids.length === 0) return
    const stamp = new Date().toISOString().slice(0, 10)
    const path = await tiny.dialog.saveFile({ types: ['xml'], name: `notaro-${scope}-${stamp}` })
    if (!path) return
    try {
      const { count } = await tiny.api.call('exportNotes', { ids, path }) as { count: number }
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
      setSelectedMonths([])
      setSelectedTags([tag])
    } catch (error) {
      await tiny.dialog.alert('Import failed.', error instanceof Error ? error.message : String(error))
    }
  }

  async function applyDbInfo(info: { name: string }) {
    try { await tiny.win?.setTitle?.(`Notaro - ${info.name}`) } catch { /* plain browser */ }
  }

  useEffect(() => {
    void (async () => {
      try { await applyDbInfo(await tiny.api.call('dbInfo', {}) as { name: string }) } catch { /* no backend */ }
    })()
  }, [])

  function resetViewState() {
    setSearchInput('')
    setSearch('')
    setSelectedMonths([])
    setSelectedTags([])
    setSelectedId(null)
  }

  async function openDatabase() {
    if (!await leaveEditor()) return
    const path = await tiny.dialog.openFile({ types: ['db', 'sqlite', 'sqlite3'] })
    if (!path) return
    try {
      const info = await tiny.api.call('openDb', { path }) as { name: string }
      await refresh()
      resetViewState()
      await applyDbInfo(info)
    } catch (error) {
      await tiny.dialog.alert('Open failed.', error instanceof Error ? error.message : String(error))
    }
  }

  async function saveDatabaseAs() {
    const info = await tiny.api.call('dbInfo', {}) as { name: string }
    const path = await tiny.dialog.saveFile({ types: ['db'], name: info.name })
    if (!path) return
    try {
      await tiny.api.call('saveDbAs', { path })
      await tiny.dialog.alert('Database copy saved.', path)
    } catch (error) {
      await tiny.dialog.alert('Save failed.', error instanceof Error ? error.message : String(error))
    }
  }

  async function reloadNotes() {
    if (!await leaveEditor()) return
    try {
      await refresh()
    } catch (error) {
      await tiny.dialog.alert('Reload failed.', error instanceof Error ? error.message : String(error))
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
      'file:open': () => void openDatabase(),
      'file:saveAs': () => void saveDatabaseAs(),
      'file:reload': () => void reloadNotes(),
      'file:import': () => void importNotes(),
      'file:exportAll': () => void exportNotes('all'),
      'file:exportSelected': () => void exportNotes('selected'),
      'file:exit': () => void exitApp(),
      'note:copy': () => void copyNotes(selectedNotes),
      'note:selectAll': selectAllListed,
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

  const selectedCount = selectedNotes.length
  const hasListed = visibleNotes.length > 0
  useEffect(() => {
    const several = selectedCount > 1
    void tiny.menu?.update?.('note:copy', { enabled: selectedCount > 0, label: several ? `Copy ${selectedCount} Notes` : 'Copy Note' })?.catch(() => {})
    void tiny.menu?.update?.('note:delete', { enabled: selectedCount > 0, label: several ? `Delete ${selectedCount} Notes` : 'Delete Note' })?.catch(() => {})
    void tiny.menu?.update?.('file:exportSelected', { enabled: selectedCount > 0, label: several ? `Export ${selectedCount} Selected…` : 'Export Selected…' })?.catch(() => {})
  }, [selectedCount])
  useEffect(() => {
    void tiny.menu?.update?.('file:exportAll', { enabled: hasListed })?.catch(() => {})
    void tiny.menu?.update?.('note:selectAll', { enabled: hasListed })?.catch(() => {})
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
    setSelectedTags([])
    setSelectedMonths([])
  }

  // The tag and calendar controls change the filter together with the Find text.
  function changeFilter(change: () => void) {
    guarded(() => {
      setSearch(effectiveSearch(searchInput))
      change()
    })
  }

  // `all` clears the tag filter; Ctrl+click adds or removes one tag.
  function pickTag(tag: string, toggle: boolean) {
    const next = tag === 'all' ? (selectedTags.length === 0 ? selectedTags : []) : pickItem(selectedTags, tag, toggle)
    if (next !== selectedTags) changeFilter(() => setSelectedTags(next))
  }

  // A click on the only selected month clears the month filter, as before.
  function pickMonth(month: string, toggle: boolean) {
    const next = pickItem(selectedMonths, month, toggle, true)
    if (next !== selectedMonths) changeFilter(() => setSelectedMonths(next))
  }

  // A `[text](#note-id)` link: select that note; when the filters hide it, clear them first.
  function openLinkedNote(id: number) {
    if (!notes.some((note) => note.id === id)) {
      void tiny.dialog.alert(`Note ${id} does not exist.`, 'It may have been deleted.')
      return
    }
    const show = () => {
      selectOnly(id)
      revealSelected()
    }
    if (visibleNotes.some((note) => note.id === id)) show()
    else guarded(() => {
      resetFilters()
      show()
    })
  }

  const filtered = search !== '' || selectedTags.length > 0 || selectedMonths.length > 0

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (aboutOpen || noteMenu) return
      if (event.key === 'F1' && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
        event.preventDefault()
        openShortcutsWindow()
        return
      }
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
      } else if (target?.id === 'find-input' && event.key === 'ArrowDown'
        && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
        // Leave the Find field for the first listed note, so Enter/Delete/arrows act on notes.
        const first = visibleNotes[0]
        if (!first) return
        event.preventDefault()
        selectOnly(first.id)
        revealSelected()
        document.getElementById('notes-panel')?.focus({ preventScroll: true })
      } else if (nav && !event.altKey
        // The Find field keeps Ctrl+Home/End for its text cursor, and Ctrl+Shift+arrows for selecting words.
        && (!typing || (target?.id === 'find-input' && !event.shiftKey && event.key !== 'Home' && event.key !== 'End'))) {
        event.preventDefault()
        moveSelection(nav, event.shiftKey)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        if (selection.size > 1) {
          selectOnly(selectedId)
          revealSelected()
        } else if (filtered) {
          guarded(resetFilters)
        } else {
          if (!visibleNotes.some((note) => note.id === selectedId)) selectOnly(visibleNotes[0]?.id ?? null)
          revealSelected()
        }
        document.getElementById('notes-panel')?.focus({ preventScroll: true })
      } else if (typing || event.altKey) {
        return
      } else if (commandKey(event) && !event.shiftKey && key === 'a') {
        // Ctrl+A stays a page key, not a menu accelerator: text fields need it.
        event.preventDefault()
        selectAllListed()
      } else if (
        (event.key === 'Insert' && !event.ctrlKey && !event.shiftKey && !event.metaKey) ||
        (commandKey(event) && !event.shiftKey && key === 'n')) {
        event.preventDefault()
        openNewNote()
      } else if (commandKey(event) && !event.shiftKey && key === 'v') {
        event.preventDefault()
        void pasteAsNewNote()
      } else if (commandKey(event) && !event.shiftKey && key === 'c') {
        // Selected text copies natively; otherwise the whole selected note(s).
        if (selectedNotes.length === 0 || !window.getSelection()?.isCollapsed) return
        event.preventDefault()
        void copyNotes(selectedNotes)
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
  const menuNotes = noteMenu?.notes ?? []

  return (
    <div className="app">
      <Toolbar
        search={searchInput}
        visibleCount={visibleNotes.length}
        selectedCount={selection.size > 1 ? selectedNotes.length : 0}
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
        {tagsVisible && <TagsPanel tags={tags} selected={selectedTags} onSelect={pickTag} />}
        <main className="main">
          <NotesPanel
            ref={notesPanel}
            notes={visibleNotes}
            terms={terms}
            selectedId={selectedId}
            selection={selection}
            revealGen={revealGen}
            firstMatchId={firstMatchId}
            bulkView={bulkView}
            onSelect={selectNote}
            onEdit={openEditNote}
            onMenu={openNoteMenu}
            onTag={(note, tag) => {
              // The note's stored spelling, as listed in the tags column.
              const lower = tag.toLocaleLowerCase()
              const name = note.tags.find((item) => item.toLocaleLowerCase() === lower) ?? tag
              pickTag(name, false)
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
            <CalendarPanel groups={calendarGroups} selected={selectedMonths} onSelect={pickMonth} />
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
            { label: menuNotes.length > 1 ? `Copy ${menuNotes.length} Notes` : 'Copy Note', shortcut: 'Ctrl+C', disabled: menuNotes.length === 0, onSelect: () => void copyNotes(menuNotes) },
            { label: 'Edit', shortcut: 'F2 or Enter', disabled: !menuNote, onSelect: () => menuNote && openEditNote(menuNote) },
            { label: 'Select All', shortcut: 'Ctrl+A', disabled: visibleNotes.length === 0, onSelect: selectAllListed },
            ...(menuNotes.length > 1 ? [{ label: `Export ${menuNotes.length} Notes…`, onSelect: () => void exportNotes('selected', menuNotes) }] : []),
            { separator: true },
            { label: menuNotes.length > 1 ? `Delete ${menuNotes.length} Notes` : 'Delete', shortcut: 'Del', disabled: menuNotes.length === 0, onSelect: () => void deleteNotes(menuNotes) },
          ]}
        />
      )}
    </div>
  )
}
