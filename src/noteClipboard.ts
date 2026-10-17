import type { Note, NoteDraft } from './types'

// A copied note is its title line, a blank line, then the body.
export function noteToText(note: Note): string {
  const title = note.title.trim()
  const body = note.body.trimEnd()
  return title && body ? `${title}\n\n${body}` : title || body
}

// A pasted note keeps the clipboard text whole in the body under a fixed title.
export function textToDraft(text: string): NoteDraft {
  return { title: 'clipboard', body: text.replace(/\r\n?/g, '\n').trim(), tags: '' }
}
