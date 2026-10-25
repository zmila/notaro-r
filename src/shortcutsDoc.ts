import { marked, type Token, type Tokens } from 'marked'

// The `## Keyboard shortcuts` section of README.md, split into its `###`
// sections; list items become key/description rows.

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

const SECTION_HEADING = '## Keyboard shortcuts'
// "`Ctrl+B`: bold" → keys `Ctrl+B`; a longer lead-in is a sentence, not keys.
const MAX_KEYS_LENGTH = 60

export function shortcutsSection(readme: string): string {
  const lines = readme.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === SECTION_HEADING)
  if (start < 0) return ''
  const end = lines.findIndex((line, index) => index > start && /^##\s/.test(line))
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n')
}

export function splitShortcut(item: string): ShortcutRow {
  const text = item.replace(/\s*\n\s*/g, ' ').trim()
  const colon = text.indexOf(': ')
  if (colon <= 0 || colon > MAX_KEYS_LENGTH) return { keys: null, text }
  return { keys: text.slice(0, colon), text: text.slice(colon + 2) }
}

export function parseShortcuts(readme: string): ShortcutSection[] {
  const sections: ShortcutSection[] = []
  for (const token of marked.lexer(shortcutsSection(readme)) as Token[]) {
    if (token.type === 'heading' && (token as Tokens.Heading).depth === 3) {
      sections.push({ title: (token as Tokens.Heading).text, intro: [], rows: [] })
      continue
    }
    const section = sections.at(-1)
    if (!section) continue
    if (token.type === 'paragraph') section.intro.push((token as Tokens.Paragraph).text)
    if (token.type === 'list') {
      for (const item of (token as Tokens.List).items) section.rows.push(splitShortcut(item.text))
    }
  }
  return sections
}
