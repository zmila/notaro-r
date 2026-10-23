import type { Note } from './types'

// 'yyyy-mm-dd HH:MM'
export function shortDate(value: string): string {
  return String(value ?? '').slice(0, 16)
}

// 'updated -- created', or just one date when both are the same minute.
export function noteDates(note: Pick<Note, 'created_at' | 'updated_at'>): string {
  const updated = shortDate(note.updated_at)
  const created = shortDate(note.created_at)
  return created !== updated ? `${updated} -- ${created}` : updated
}
