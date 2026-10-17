import type { FormatEdit } from './markdownFormat'

// One nesting level is four spaces: deep enough for any marker up to `99.`,
// and what CommonMark counts a tab as.
const INDENT = '    '
const TAB_WIDTH = 4

const itemPattern = /^([ \t]*)(?:([-*+])|(\d{1,9})([.)]))([ \t]+)/
const fencePattern = /^[ \t]*(```|~~~)/

interface Item {
  indent: number
  /** `-`, `*` or `+` for bullets, `.` or `)` for ordered items */
  delimiter: string
  ordered: boolean
  number: number
  /** offsets of the marker (or of its digits, for ordered items) within the line */
  markerStart: number
  markerEnd: number
  /** offset where the item's text starts */
  textStart: number
}

function indentWidth(line: string): number {
  let width = 0
  for (const char of line) {
    if (char === ' ') width++
    else if (char === '\t') width += TAB_WIDTH - (width % TAB_WIDTH)
    else break
  }
  return width
}

function parseItem(line: string): Item | null {
  const match = itemPattern.exec(line)
  if (!match) return null
  const [whole, lead, bullet, digits, delimiter] = match
  return {
    indent: indentWidth(line),
    delimiter: bullet ?? delimiter,
    ordered: !bullet,
    number: digits ? Number(digits) : 0,
    markerStart: lead.length,
    markerEnd: lead.length + (bullet ?? digits).length,
    textStart: whole.length,
  }
}

function markerEnd(item: Item): number {
  return item.ordered ? item.markerEnd + 1 : item.markerEnd
}

function marker(item: Pick<Item, 'ordered' | 'delimiter'>, number: number): string {
  return item.ordered ? `${number}${item.delimiter}` : item.delimiter
}

interface OrderedList {
  indent: number
  delimiter: string
  items: { line: number, item: Item }[]
  firstLine: number
  lastLine: number
}

// Groups items into ordered lists the way the renderer does: same indent and
// delimiter, carried across blank lines and deeper (nested or continuation)
// lines, broken by a line at or left of the list's indent that isn't its item.
function orderedLists(lines: string[]): OrderedList[] {
  const lists: OrderedList[] = []
  let open: { indent: number, ordered: boolean, delimiter: string, list: OrderedList | null }[] = []
  let fenced = false

  lines.forEach((line, index) => {
    if (fencePattern.test(line)) fenced = !fenced
    else if (fenced || !line.trim()) return
    const width = indentWidth(line)
    const item = fenced || fencePattern.test(line) ? null : parseItem(line)
    open = open.filter((entry) => item ? entry.indent <= width : entry.indent < width)
    for (const entry of open) if (entry.list) entry.list.lastLine = index
    if (!item) return

    const top = open.at(-1)
    if (top && top.indent === width) {
      if (top.ordered === item.ordered && top.delimiter === item.delimiter) {
        top.list?.items.push({ line: index, item })
        return
      }
      open.pop()
    }
    const list = item.ordered ? { indent: width, delimiter: item.delimiter, items: [{ line: index, item }], firstLine: index, lastLine: index } : null
    if (list) lists.push(list)
    open.push({ indent: width, ordered: item.ordered, delimiter: item.delimiter, list })
  })
  return lists
}

function lineAt(value: string, position: number): number {
  let line = 0
  for (let index = value.indexOf('\n'); index !== -1 && index < position; index = value.indexOf('\n', index + 1)) line++
  return line
}

function lineOffsets(lines: string[]): number[] {
  const offsets: number[] = []
  let offset = 0
  for (const line of lines) {
    offsets.push(offset)
    offset += line.length + 1
  }
  return offsets
}

/**
 * After `previous` was edited into `value`, renumbers the ordered lists the
 * edit touched so they count up from where they started before the edit.
 * Lists elsewhere in the note are left alone. Null when nothing changes.
 */
export function renumberLists(previous: string, value: string, selectionStart: number, selectionEnd: number): FormatEdit | null {
  if (previous === value) return null
  let prefix = 0
  const shorter = Math.min(previous.length, value.length)
  while (prefix < shorter && previous[prefix] === value[prefix]) prefix++
  let suffix = 0
  while (suffix < shorter - prefix && previous[previous.length - 1 - suffix] === value[value.length - 1 - suffix]) suffix++

  const lines = value.split('\n')
  const oldLines = previous.split('\n')
  const changedFrom = lineAt(value, prefix)
  const changedTo = lineAt(value, value.length - suffix)
  const oldFrom = lineAt(previous, prefix)
  const oldTo = lineAt(previous, previous.length - suffix)
  const oldLists = orderedLists(oldLines)
  const offsets = lineOffsets(lines)
  const oldOffsets = lineOffsets(oldLines)

  const changes: { from: number, to: number, text: string }[] = []
  for (const list of orderedLists(lines)) {
    if (list.firstLine > changedTo + 1 || list.lastLine < changedFrom - 1) continue
    const before = oldLists.find((old) => old.indent === list.indent && old.delimiter === list.delimiter
      && old.firstLine <= oldTo + 1 && old.lastLine >= oldFrom - 1)
    const first = list.items[0]
    // Typing over the first item's digits sets a new start; any other edit keeps the old one.
    const firstDigits = offsets[first.line] + first.item.markerStart
    const editingStart = before && prefix >= firstDigits && value.length - suffix <= offsets[first.line] + first.item.markerEnd
      && prefix >= oldOffsets[before.items[0].line] + before.items[0].item.markerStart
      && previous.length - suffix <= oldOffsets[before.items[0].line] + before.items[0].item.markerEnd
    const start = before && !editingStart ? before.items[0].item.number : first.item.number
    list.items.forEach(({ line, item }, index) => {
      if (item.number === start + index) return
      const from = offsets[line] + item.markerStart
      changes.push({ from, to: offsets[line] + item.markerEnd, text: String(start + index) })
    })
  }
  if (!changes.length) return null

  changes.sort((a, b) => a.from - b.from)
  const from = changes[0].from
  const to = changes.at(-1)!.to
  let text = ''
  let position = from
  for (const change of changes) {
    text += value.slice(position, change.from) + change.text
    position = change.to
  }
  text += value.slice(position, to)
  const map = (offset: number) => {
    let shift = 0
    for (const change of changes) {
      if (offset >= change.to) shift += change.text.length - (change.to - change.from)
      else if (offset > change.from) return change.from + shift + change.text.length
    }
    return offset + shift
  }
  return { from, to, text, selectionStart: map(selectionStart), selectionEnd: map(selectionEnd) }
}

function wholeLines(value: string, start: number, end: number): [number, number] {
  if (end > start && value[end - 1] === '\n') end--
  const from = value.lastIndexOf('\n', start - 1) + 1
  const next = value.indexOf('\n', end)
  return [from, next === -1 ? value.length : next]
}

function outdentLine(line: string): string {
  if (line.startsWith('\t')) return line.slice(1)
  return line.replace(/^ {1,4}/, '')
}

// Marker for an item that just moved to a new level: the style of the item
// above it on that level, or its own (restarting at 1) when it opens a sublist.
function adaptMarker(lines: string[], index: number): string {
  const line = lines[index]
  const item = parseItem(line)
  if (!item) return line
  for (let above = index - 1; above >= 0; above--) {
    const text = lines[above]
    if (!text.trim()) continue
    const width = indentWidth(text)
    if (width > item.indent) continue
    const sibling = width === item.indent ? parseItem(text) : null
    if (!sibling) break
    const replacement = marker(sibling, sibling.number + 1)
    return line.slice(0, item.markerStart) + replacement + line.slice(markerEnd(item))
  }
  if (!item.ordered || item.number === 1) return line
  return line.slice(0, item.markerStart) + marker(item, 1) + line.slice(markerEnd(item))
}

/**
 * Tab / Shift+Tab. On list items it moves the item together with its nested
 * lines one level and restyles it to match its new siblings; plain lines get a
 * tab, as before. Null means "insert a tab character at the cursor".
 */
export function indentLines(value: string, start: number, end: number, outdent: boolean): FormatEdit | null {
  const lines = value.split('\n')
  const [from, to] = wholeLines(value, start, end)
  const first = lineAt(value, from)
  let last = lineAt(value, to)
  const anyItem = lines.slice(first, last + 1).some((line) => parseItem(line))
  if (start === end && !outdent && !anyItem) return null

  // Bring the last item's nested lines along so the structure under it survives.
  const lastItem = parseItem(lines[last])
  if (lastItem) {
    for (let next = last + 1; next < lines.length; next++) {
      if (!lines[next].trim()) continue
      if (indentWidth(lines[next]) <= lastItem.indent) break
      last = next
    }
  }

  const updated = lines.slice()
  const items: number[] = []
  for (let index = first; index <= last; index++) {
    const line = lines[index]
    if (!line.trim() && first !== last) continue
    updated[index] = outdent ? outdentLine(line) : (anyItem ? INDENT : '\t') + line
    // Nested lines keep their own markers; only the moved items restyle.
    if (index <= lineAt(value, to) && updated[index] !== line && parseItem(line)) items.push(index)
  }
  for (const index of items) updated[index] = adaptMarker(updated, index)

  const blockFrom = lineOffsets(lines)[first]
  const blockTo = lineOffsets(lines)[last] + lines[last].length
  const text = updated.slice(first, last + 1).join('\n')
  if (text === value.slice(blockFrom, blockTo)) return null
  if (start !== end) return { from: blockFrom, to: blockTo, text, selectionStart: blockFrom, selectionEnd: blockFrom + text.length }

  // Keep the cursor on the same character of the item's text.
  const oldLine = lines[first]
  const newLine = updated[first]
  const column = start - blockFrom
  const oldItem = parseItem(oldLine)
  const newItem = parseItem(newLine)
  const textColumn = oldItem && newItem && column >= oldItem.textStart
    ? newItem.textStart + column - oldItem.textStart
    : Math.max(0, Math.min(newLine.length, column + newLine.length - oldLine.length))
  const cursor = blockFrom + textColumn
  return { from: blockFrom, to: blockTo, text, selectionStart: cursor, selectionEnd: cursor }
}

const continuable = /^([ \t]*)([-*+]|\d+[.)]|>)([ \t]+)/

/**
 * Enter inside a list item or quote: start the next line with the same marker
 * (numbers count up). Enter on an empty nested item moves it up a level; on an
 * empty top-level item it removes the marker. Null means "let the textarea
 * insert a newline".
 */
export function continueList(value: string, start: number, end: number): FormatEdit | null {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const lineBreak = value.indexOf('\n', start)
  const lineEnd = lineBreak === -1 ? value.length : lineBreak
  if (end > lineEnd) return null
  const match = continuable.exec(value.slice(lineStart, start))
  if (!match) return null

  if (!value.slice(lineStart + match[0].length, lineEnd).trim()) {
    if (match[1] && match[2] !== '>') return indentLines(value, start, start, true)
    return { from: lineStart, to: lineEnd, text: '', selectionStart: lineStart, selectionEnd: lineStart }
  }

  const [, indent, mark, gap] = match
  const number = Number.parseInt(mark, 10)
  const next = Number.isNaN(number) ? mark : `${number + 1}${mark.slice(String(number).length)}`
  const text = `\n${indent}${next}${gap}`
  return { from: start, to: end, text, selectionStart: start + text.length, selectionEnd: start + text.length }
}
