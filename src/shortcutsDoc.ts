import { marked, type Token, type Tokens } from 'marked'

// docs/keyboard_shortcuts.md for the Keyboard Shortcuts window: the `#` title,
// then `##` sections; list items of the form "`keys`: text" become key/description rows.

export interface ShortcutRow {
  /** inline Markdown of the keys; null = a row with only a description */
  keys: string | null
  text: string
}

export interface ShortcutSection {
  title: string
  /** inline Markdown paragraphs shown above the table */
  intro: string[]
  rows: ShortcutRow[]
}

// "`Ctrl+B`: bold" → keys `Ctrl+B`; a longer lead-in is a sentence, not keys.
const MAX_KEYS_LENGTH = 60

export function splitShortcut(item: string): ShortcutRow {
  const text = item.replace(/\s*\n\s*/g, ' ').trim()
  const colon = text.indexOf(': ')
  if (colon <= 0 || colon > MAX_KEYS_LENGTH) return { keys: null, text }
  return { keys: text.slice(0, colon), text: text.slice(colon + 2) }
}

export function parseShortcuts(doc: string): { title: string, sections: ShortcutSection[] } {
  let title = 'Keyboard shortcuts'
  const sections: ShortcutSection[] = []
  for (const token of marked.lexer(doc) as Token[]) {
    if (token.type === 'heading') {
      const heading = token as Tokens.Heading
      if (heading.depth === 1) title = heading.text
      else if (heading.depth === 2) sections.push({ title: heading.text, intro: [], rows: [] })
      continue
    }
    const section = sections.at(-1)
    if (!section) continue
    if (token.type === 'paragraph') section.intro.push((token as Tokens.Paragraph).text)
    if (token.type === 'list') {
      for (const item of (token as Tokens.List).items) section.rows.push(splitShortcut(item.text))
    }
  }
  return { title, sections }
}
