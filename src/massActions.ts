// Generic "mass action" harness: iterate every note, call a pure processing
// function, and collect the notes it actually changed for the caller to
// persist (via the backend's bulkUpdateNotes, which writes them in one
// transaction and keeps a backup). Built on top of the tag helpers in
// noteTags.ts so remove/replace stay consistent with how tags are extracted
// and rendered everywhere else.
import { extractTags, replaceTagInBody } from './noteTags'
import type { Note } from './types'

/** A partial update for a note, or null to leave it untouched. `updated_at`
 *  is only changed when the function returns it explicitly — by default a
 *  mass action should not look like the user edited the note. */
export type MassActionResult = Partial<Pick<Note, 'title' | 'body' | 'tags' | 'updated_at'>> | null

export type MassAction = (note: Note) => MassActionResult

export interface BulkUpdate {
  id: number
  title: string
  body: string
  tags: string[]
  updated_at: string
}

const sameTags = (a: string[], b: string[]) => a.length === b.length && a.every((tag, index) => tag === b[index])

// Runs `action` over every note, keeping only the ones it actually changed
// (a function can return a result that's identical to the original, which
// is treated the same as returning null).
export function runMassAction(notes: Note[], action: MassAction): BulkUpdate[] {
  const updates: BulkUpdate[] = []
  for (const note of notes) {
    const result = action(note)
    if (!result) continue
    const title = result.title ?? note.title
    const body = result.body ?? note.body
    const tags = result.tags ?? note.tags
    const updated_at = result.updated_at ?? note.updated_at
    if (title === note.title && body === note.body && sameTags(tags, note.tags) && updated_at === note.updated_at) continue
    updates.push({ id: note.id, title, body, tags, updated_at })
  }
  return updates
}

const key = (tag: string) => tag.toLocaleLowerCase()

// Case-insensitive presence/removal/rename of a tag in the tags array; keeps
// the first-seen spelling of any tag that isn't the target.
function withoutTag(tags: string[], target: string): string[] {
  return tags.filter((item) => key(item) !== target)
}

function withRenamedTag(tags: string[], target: string, replacement: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of tags) {
    const renamed = key(item) === target ? replacement : item
    if (seen.has(key(renamed))) continue
    seen.add(key(renamed))
    result.push(renamed)
  }
  return result
}

// Strips `#tag` from the body and the tags array; notes without the tag
// (in either place — old notes may carry it only in the tags column) are
// left untouched. updated_at is preserved.
export function removeTagAction(tag: string): MassAction {
  const target = key(tag)
  return (note) => {
    const inBody = extractTags(note.body).some((item) => key(item) === target)
    const inTags = note.tags.some((item) => key(item) === target)
    if (!inBody && !inTags) return null
    const body = inBody ? replaceTagInBody(note.body, tag, null) : note.body
    const tags = withoutTag(inBody ? extractTags(body) : note.tags, target)
    return { body, tags }
  }
}

// Renames `#oldTag` to `#newTag` in the body and the tags array; notes
// without oldTag are left untouched. updated_at is preserved.
export function replaceTagAction(oldTag: string, newTag: string): MassAction {
  const target = key(oldTag)
  return (note) => {
    const inBody = extractTags(note.body).some((item) => key(item) === target)
    const inTags = note.tags.some((item) => key(item) === target)
    if (!inBody && !inTags) return null
    const body = inBody ? replaceTagInBody(note.body, oldTag, newTag) : note.body
    const tags = withRenamedTag(inBody ? extractTags(body) : note.tags, target, newTag)
    return { body, tags }
  }
}

// Resets updated_at to created_at for notes where ordinary edits let them
// drift apart; notes where they already match are left untouched.
export function clearUpdatedAtDriftAction(): MassAction {
  return (note) => (note.updated_at === note.created_at ? null : { updated_at: note.created_at })
}
