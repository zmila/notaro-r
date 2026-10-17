import { noteViewInfo, stepNoteView, type NoteView } from '../noteView'
import type { SortDirection, SortField } from '../types'

export const TAGS_SHORTCUT = 'Ctrl+Shift+T'
export const CALENDAR_SHORTCUT = 'Ctrl+Shift+D'

interface ToolbarProps {
  search: string
  visibleCount: number
  tagsVisible: boolean
  calendarVisible: boolean
  onToggleTags: () => void
  onToggleCalendar: () => void
  onNewNote: () => void
  notesView: NoteView
  onNotesViewChange: (view: NoteView) => void
  onSearchChange: (value: string) => void
  onSearch: () => void
  sort: SortControlsProps
}

function CalendarIcon() {
  return (
    <svg className="btn-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" fill="none" stroke="currentColor" />
      <path d="M1.5 6h13M5 1v3M11 1v3" stroke="currentColor" fill="none" />
      <path d="M4 8.5h2v2H4zM7 8.5h2v2H7zM10 8.5h2v2h-2zM4 11.5h2v2H4zM7 11.5h2v2H7z" fill="currentColor" />
    </svg>
  )
}

export function Toolbar({
  search,
  visibleCount,
  tagsVisible,
  calendarVisible,
  onToggleTags,
  onToggleCalendar,
  onNewNote,
  notesView,
  onNotesViewChange,
  onSearchChange,
  onSearch,
  sort,
}: ToolbarProps) {
  const tagsTitle = `${tagsVisible ? 'Hide' : 'Show'} tags column (${TAGS_SHORTCUT})`
  const calendarTitle = `${calendarVisible ? 'Hide' : 'Show'} calendar column (${CALENDAR_SHORTCUT})`
  const view = noteViewInfo(notesView)
  const nextView = noteViewInfo(stepNoteView(notesView, false))
  const viewTitle = `All notes: ${view.label.toLowerCase()} (click: ${nextView.label.toLowerCase()} for all, Shift+click: back; Ctrl+Shift+plus/minus: expand/collapse all)`
  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <button
          type="button"
          className="head-btn new-note"
          title="New note (Ins or Ctrl+N)"
          aria-label="New note"
          onClick={onNewNote}
        >N+</button>
      </div>
      <div className="toolbar-middle">
        <label className="find-label" htmlFor="find-input">Find:</label>
        <input
          id="find-input"
          className="find-input"
          value={search}
          placeholder="filter notes..."
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') onSearch() }}
        />
        <button type="button" className="head-btn find-btn" title="Find" onClick={onSearch}>Find</button>
        <output className="visible-count" aria-live="polite">{visibleCount}</output>
      </div>
      <SortControls {...sort} />
      <div className="toolbar-right">
        <button
          type="button"
          className={`head-btn toggle-btn${tagsVisible ? ' active' : ''}`}
          title={tagsTitle}
          aria-label={tagsTitle}
          aria-pressed={tagsVisible}
          onClick={onToggleTags}
        >#</button>
        <button
          type="button"
          className={`head-btn toggle-btn${calendarVisible ? ' active' : ''}`}
          title={calendarTitle}
          aria-label={calendarTitle}
          aria-pressed={calendarVisible}
          onClick={onToggleCalendar}
        ><CalendarIcon /></button>
        <button
          type="button"
          className="head-btn notes-view-btn"
          title={viewTitle}
          aria-label={viewTitle}
          onClick={(event) => onNotesViewChange(stepNoteView(notesView, event.shiftKey))}
        >{view.glyph}</button>
      </div>
    </header>
  )
}

interface SortControlsProps {
  field: SortField
  direction: SortDirection
  onFieldChange: (value: SortField) => void
  onDirectionChange: () => void
}

function SortControls({ field, direction, onFieldChange, onDirectionChange }: SortControlsProps) {
  return (
    <div className="toolbar-sort sort">
      <label className="find-label" htmlFor="sort-field">Sort:</label>
      <select
        id="sort-field"
        className="sort-field"
        value={field}
        onChange={(event) => onFieldChange(event.target.value as SortField)}
      >
        <option value="created">created</option>
        <option value="updated">updated</option>
        <option value="title">title</option>
      </select>
      <button
        type="button"
        className="head-btn sort-dir"
        title={direction === 'asc' ? 'Ascending (click for descending)' : 'Descending (click for ascending)'}
        aria-label={direction === 'asc' ? 'Sort ascending' : 'Sort descending'}
        onClick={onDirectionChange}
      >
        {direction === 'asc' ? '🔼' : '🔽'}
      </button>
    </div>
  )
}
