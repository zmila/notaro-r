export type FormatCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'orderedList'
  | 'bulletList'
  | 'clear'

export interface FormatEdit {
  from: number
  to: number
  text: string
  selectionStart: number
  selectionEnd: number
}

// Matched by event.key (the typed character), so the shortcuts follow the
// active keyboard layout (Dvorak Ctrl+B is the key labelled B in Dvorak).
export const formatShortcuts: Record<string, FormatCommand> = {
  b: 'bold',
  i: 'italic',
  u: 'underline',
  k: 'strike',
  m: 'code',
  1: 'heading1',
  2: 'heading2',
  3: 'heading3',
  9: 'orderedList',
  0: 'bulletList',
  d: 'clear',
}

export const formatCommands = new Set<FormatCommand>(Object.values(formatShortcuts))

const inlineMarkers: Partial<Record<FormatCommand, [string, string]>> = {
  bold: ['**', '**'],
  italic: ['*', '*'],
  underline: ['<u>', '</u>'],
  strike: ['~~', '~~'],
  code: ['`', '`'],
}

const headingPrefix = /^#{1,6}[ \t]+/
const bulletPrefix = /^[-*+][ \t]+/
const orderedPrefix = /^\d+[.)][ \t]+/

export function formatMarkdown(value: string, start: number, end: number, command: FormatCommand): FormatEdit {
  const markers = inlineMarkers[command]
  if (command === 'code' && value.slice(start, end).includes('\n')) return toggleFence(value, start, end)
  if (markers) return toggleInline(value, start, end, markers[0], markers[1])
  if (command === 'clear') return clearFormatting(value, start, end)
  return toggleLines(value, start, end, command)
}

function starRun(text: string, fromEnd: boolean): number {
  let count = 0
  while (count < text.length && text[fromEnd ? text.length - 1 - count : count] === '*') count++
  return count
}

// `***x***` is both bold and italic: bold needs a run of 2+, italic an odd run.
function hasStars(open: string, run: number): boolean {
  return open.length === 1 ? run % 2 === 1 : run >= 2
}

function toggleInline(value: string, start: number, end: number, open: string, close: string): FormatEdit {
  const isStar = /^\*+$/.test(open)
  // Double-click selects a trailing space; markers must hug the text.
  while (start < end && /\s/.test(value[start])) start++
  while (end > start && /\s/.test(value[end - 1])) end--
  const inner = value.slice(start, end)

  if (inner.length >= open.length + close.length && inner.startsWith(open) && inner.endsWith(close)
    && (!isStar || hasStars(open, Math.min(starRun(inner, false), starRun(inner, true))))) {
    const text = inner.slice(open.length, inner.length - close.length)
    return { from: start, to: end, text, selectionStart: start, selectionEnd: start + text.length }
  }

  const before = value.slice(0, start)
  const after = value.slice(end)
  if (before.endsWith(open) && after.startsWith(close)
    && (!isStar || hasStars(open, Math.min(starRun(before, true), starRun(after, false))))) {
    const from = start - open.length
    return { from, to: end + close.length, text: inner, selectionStart: from, selectionEnd: from + inner.length }
  }

  return {
    from: start,
    to: end,
    text: open + inner + close,
    selectionStart: start + open.length,
    selectionEnd: start + open.length + inner.length,
  }
}

function toggleFence(value: string, start: number, end: number): FormatEdit {
  const [from, to] = lineRange(value, start, end)
  const block = value.slice(from, to)
  const fenced = /^```[^\n]*\n([\s\S]*)\n```$/.exec(block)
  const text = fenced ? fenced[1] : `\`\`\`\n${block}\n\`\`\``
  return { from, to, text, selectionStart: from, selectionEnd: from + text.length }
}

// Whole lines touched by the selection; a selection ending at a line start skips that line.
function lineRange(value: string, start: number, end: number): [number, number] {
  if (end > start && value[end - 1] === '\n') end--
  const from = value.lastIndexOf('\n', start - 1) + 1
  const next = value.indexOf('\n', end)
  return [from, next === -1 ? value.length : next]
}

function stripBlockPrefix(line: string): { indent: string, rest: string } {
  const indent = /^[ \t]*/.exec(line)![0]
  let rest = line.slice(indent.length)
  rest = rest.replace(headingPrefix, '').replace(bulletPrefix, '').replace(orderedPrefix, '')
  return { indent, rest }
}

function toggleLines(value: string, start: number, end: number, command: FormatCommand): FormatEdit {
  const [from, to] = lineRange(value, start, end)
  const lines = value.slice(from, to).split('\n')
  const targets = lines.some((line) => line.trim()) ? lines.map((line) => line.trim() !== '') : lines.map(() => true)
  const level = command === 'heading1' ? 1 : command === 'heading2' ? 2 : command === 'heading3' ? 3 : 0

  const has = (line: string) => {
    const body = line.replace(/^[ \t]*/, '')
    if (level) return new RegExp(`^#{${level}}[ \\t]+`).test(body)
    return command === 'bulletList' ? bulletPrefix.test(body) : orderedPrefix.test(body)
  }
  const remove = lines.every((line, index) => !targets[index] || has(line))

  let number = 0
  const result = lines.map((line, index) => {
    if (!targets[index]) return line
    const { indent, rest } = stripBlockPrefix(line)
    if (remove) return level ? rest : indent + rest
    if (level) return `${'#'.repeat(level)} ${rest}`
    if (command === 'bulletList') return `${indent}- ${rest}`
    number++
    return `${indent}${number}. ${rest}`
  })
  const text = result.join('\n')

  if (start !== end) return { from, to, text, selectionStart: from, selectionEnd: from + text.length }
  // Keep a collapsed cursor on the same character of its line.
  const shift = result[0].length - lines[0].length
  const cursor = Math.max(from, Math.min(start + shift, from + result[0].length))
  return { from, to, text, selectionStart: cursor, selectionEnd: cursor }
}

export function clearInline(text: string): string {
  return text
    .replace(/<\/?u>/gi, '')
    .replace(/~~([^\n]*?)~~/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^\n]+?)\*\*/g, '$1')
    .replace(/(^|\W)__([^\n]+?)__(?=\W|$)/g, '$1$2')
    .replace(/\*(?=\S)([^*\n]*?\S)\*/g, '$1')
    .replace(/(^|\W)_(?=\S)([^_\n]*?\S)_(?=\W|$)/g, '$1$2')
}

function clearFormatting(value: string, start: number, end: number): FormatEdit {
  const [from, to] = lineRange(value, start, end)
  const text = value.slice(from, to).split('\n')
    .filter((line) => !/^[ \t]*```/.test(line))
    .map((line) => {
      const { indent, rest } = stripBlockPrefix(line.replace(/^([ \t]*)>[ \t]?/, '$1'))
      return clearInline(indent + rest)
    })
    .join('\n')
  return { from, to, text, selectionStart: from, selectionEnd: from + text.length }
}
