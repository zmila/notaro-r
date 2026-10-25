import type { Note } from './types'

// A reference to another note is a plain Markdown link to an in-page anchor,
// `[Other Note](#note-234)`: the id keeps it unique (titles may repeat), the
// text stays editable. Typing `[[` in the editor offers notes to link.
const NOTE_HREF = /^#note-(\d+)$/
// `[[` and the query typed after it, up to the caret, on one line.
const LINK_PREFIX = /\[\[([^[\]\n]*)$/
// What may follow the caret inside `[[query]]`: the rest of the query and `]]`;
// without a `]]`, the rest of the word.
const LINK_REST = /^(?:[^[\]\n]*\]\]|[^[\]\s]*)/
// A finished note link on one line; group 1 is the (escaped) label.
const NOTE_LINK = /\[((?:\\.|[^\\\]\n])*)\]\(#note-\d+\)/g

export function noteLinkHref(id: number): string {
  return `#note-${id}`
}

export function noteLinkId(href: string): number | null {
  const match = NOTE_HREF.exec(href)
  return match ? Number(match[1]) : null
}

// The note reference at `caret`, as text to replace (`start`–`end`) and the
// `query` to look notes up by (the text before the caret). Either a `[[query`
// being typed (`end` also covers the rest up to a following `]]`, or of the word), or the label
// of a finished `[Label](#note-N)` link with the caret in it (`start`–`end`
// covers the whole link, so picking a note retargets it).
export function noteLinkPrefixAt(value: string, caret: number): { start: number; end: number; query: string } | null {
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1
  const match = LINK_PREFIX.exec(value.slice(lineStart, caret))
  if (match) {
    const rest = LINK_REST.exec(value.slice(caret))?.[0].length ?? 0
    return { start: caret - match[0].length, end: caret + rest, query: match[1] }
  }
  const lineEnd = value.indexOf('\n', caret)
  const line = value.slice(lineStart, lineEnd < 0 ? value.length : lineEnd)
  for (const link of line.matchAll(NOTE_LINK)) {
    const start = lineStart + (link.index ?? 0)
    const labelEnd = start + 1 + link[1].length
    if (caret <= start || caret > labelEnd) continue
    const query = value.slice(start + 1, caret).replace(/\\(.)/g, '$1')
    return { start, end: start + link[0].length, query }
  }
  return null
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
