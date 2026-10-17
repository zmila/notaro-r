export type NoteView = 'full' | 'preview' | 'title'

// Shown in this order; a click moves to the next one (Shift+click: previous).
export const NOTE_VIEWS: { view: NoteView, glyph: string, label: string }[] = [
  { view: 'full', glyph: '█', label: 'Full note' },
  { view: 'preview', glyph: '▀', label: 'Preview (5 lines)' },
  { view: 'title', glyph: '▔', label: 'Title only' },
]

export const DEFAULT_NOTE_VIEW: NoteView = 'preview'

export function noteViewInfo(view: NoteView) {
  return NOTE_VIEWS.find((item) => item.view === view) ?? NOTE_VIEWS[1]
}

export function stepNoteView(view: NoteView, backward: boolean): NoteView {
  const index = NOTE_VIEWS.findIndex((item) => item.view === view)
  const step = backward ? NOTE_VIEWS.length - 1 : 1
  return NOTE_VIEWS[(index + step) % NOTE_VIEWS.length].view
}

// Ctrl+plus: preview/title → full, full → preview.
export function growNoteView(view: NoteView): NoteView {
  return view === 'full' ? 'preview' : 'full'
}

// Ctrl+minus: preview/full → title, title → preview.
export function shrinkNoteView(view: NoteView): NoteView {
  return view === 'title' ? 'preview' : 'title'
}

// The mode applied to all notes by the toolbar toggle. `gen` counts presses so
// per-note choices made before the latest press can be told apart; `prev` is
// shown by notes the progressive apply hasn't reached yet.
export interface BulkNoteView {
  view: NoteView
  prev: NoteView
  gen: number
}
