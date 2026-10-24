import type { Note } from './types'

// A reference to another note is a plain Markdown link to an in-page anchor,
// `[Other Note](#note-234)`: the id keeps it unique (titles may repeat), the
// text stays editable. Typing `[[` in the editor offers notes to link.
const NOTE_HREF = /^#note-(\d+)$/
// `[[` and the query typed after it, up to the caret, on one line.
const LINK_PREFIX = /\[\[([^[\]\n]*)$/

export function noteLinkHref(id: number): string {
  return `#note-${id}`
}

export function noteLinkId(href: string): number | null {
  const match = NOTE_HREF.exec(href)
  return match ? Number(match[1]) : null
}

// The note reference being typed at `caret`: `start` is at `[[`, `end` also
// covers a `]]` right after the caret, `query` is the text after `[[`.
export function noteLinkPrefixAt(value: string, caret: number): { start: number; end: number; query: string } | null {
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1
  const match = LINK_PREFIX.exec(value.slice(lineStart, caret))
  if (!match) return null
  const end = value.startsWith(']]', caret) ? caret + 2 : caret
  return { start: caret - match[0].length, end, query: match[1] }
}

// What a note is called in the popup and in a new link.
export function noteLabel(note: Pick<Note, 'id' | 'title' | 'body'>): string {
  const text = note.title.trim() || note.body.trim().split('\n')[0].replace(/^[#>*+\-\d.)\s]+/, '').trim()
  return text.replace(/\s+/g, ' ').slice(0, 80) || `Note ${note.id}`
}

// Backslash-escapes what Markdown would otherwise read as syntax in link
// text; `\#` also keeps a `#word` in a title from becoming a tag here.
export function noteLinkMarkdown(note: Pick<Note, 'id' | 'title' | 'body'>): string {
  const text = noteLabel(note).replace(/[\\[\]*_`#<>~]/g, '\\$&')
  return `[${text}](${noteLinkHref(note.id)})`
}

// Notes for the `[[query` popup: titles starting with the query first, then
// titles containing it, then an exact id match (`[[234`); each group keeps
// the given order. An empty query lists the first `limit` notes.
export function findLinkTargets(notes: Note[], query: string, excludeId: number | null, limit = 50): Note[] {
  const q = query.trim().toLocaleLowerCase()
  const starts: Note[] = []
  const contains: Note[] = []
  const byId: Note[] = []
  const id = /^\d+$/.test(q) ? Number(q) : null
  for (const note of notes) {
    if (note.id === excludeId) continue
    const label = noteLabel(note).toLocaleLowerCase()
    if (label.startsWith(q)) starts.push(note)
    else if (label.includes(q)) contains.push(note)
    else if (note.id === id) byId.push(note)
    if (starts.length >= limit) break
  }
  return [...byId, ...starts, ...contains].slice(0, limit)
}

// Marks note links in rendered (already sanitized) HTML as
// `<a class="note-link" data-note-id>`, for styling and click handling.
export function markNoteLinksHtml(html: string): string {
  if (!html.includes('href="#note-')) return html
  const root = document.createElement('template')
  root.innerHTML = html
  for (const link of root.content.querySelectorAll<HTMLAnchorElement>('a[href^="#note-"]')) {
    const id = noteLinkId(link.getAttribute('href') ?? '')
    if (id === null) continue
    link.classList.add('note-link')
    link.dataset.noteId = String(id)
    if (!link.title) link.title = `Go to note ${id}`
  }
  return root.innerHTML
}
