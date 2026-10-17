// Tags live in the note body as `#word`: letters of any script, digits, `_`,
// `-` and `.` (a trailing `-`/`.` is punctuation, not part of the tag).
const WORD = '\\p{L}\\p{N}\\p{M}_'
// Not after a word char (`page#anchor`), `&` (`&#123;`), `#` (`##`) or `/` (URLs).
const TAG_SOURCE = `(?<![${WORD}&#/\\\\])#([${WORD}.\\-]*[${WORD}])`

function tagPattern(): RegExp {
  return new RegExp(TAG_SOURCE, 'gu')
}

const key = (tag: string) => tag.toLocaleLowerCase()

// Code is literal text, and `[text](#anchor)` points into the page: neither holds tags.
function withoutCode(body: string): string {
  let fence: string | null = null
  const lines = body.split('\n').map((line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null
      return ''
    }
    if (marker) {
      fence = marker
      return ''
    }
    return line
  })
  return lines.join('\n').replace(/(`+)[^`]+?\1/g, ' ').replace(/\]\([^)]*\)/g, ']')
}

// Unique tags in order of first appearance; case-insensitive, the first spelling wins.
export function extractTags(body: string): string[] {
  if (!body.includes('#')) return []
  const seen = new Set<string>()
  const tags: string[] = []
  for (const match of withoutCode(body).matchAll(tagPattern())) {
    if (seen.has(key(match[1]))) continue
    seen.add(key(match[1]))
    tags.push(match[1])
  }
  return tags
}

// An old tag stored apart from the body, made into a valid `#word`.
function asTagWord(tag: string): string {
  return tag.trim().replace(new RegExp(`[^${WORD}.\\-]+`, 'gu'), '_').replace(new RegExp(`[^${WORD}]+$`, 'u'), '')
}

// Notes saved before tags moved into the body keep them in a separate list;
// append the ones the body lacks as a last `#a #b` line so saving keeps them.
export function appendMissingTags(body: string, tags: string[]): string {
  const present = new Set(extractTags(body).map(key))
  const missing: string[] = []
  for (const tag of tags.map(asTagWord)) {
    if (!tag || present.has(key(tag))) continue
    present.add(key(tag))
    missing.push(`#${tag}`)
  }
  if (missing.length === 0) return body
  const text = body.trimEnd()
  return text ? `${text}\n\n${missing.join(' ')}` : missing.join(' ')
}

// Wrap tags in rendered (already sanitized) HTML as `<span class="note-tag" data-tag>`.
export function linkTagsHtml(html: string): string {
  if (!html.includes('#')) return html
  const root = document.createElement('template')
  root.innerHTML = html
  const walker = document.createTreeWalker(root.content, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text)
  let changed = false
  for (const node of textNodes) {
    const text = node.nodeValue ?? ''
    if (!text.includes('#') || node.parentElement?.closest('code, pre, a, .note-tag')) continue
    const matches = [...text.matchAll(tagPattern())]
    if (matches.length === 0) continue
    const fragment = document.createDocumentFragment()
    let last = 0
    for (const match of matches) {
      fragment.append(text.slice(last, match.index))
      const span = document.createElement('span')
      span.className = 'note-tag'
      span.dataset.tag = match[1]
      span.textContent = match[0]
      fragment.append(span)
      last = match.index + match[0].length
    }
    fragment.append(text.slice(last))
    node.replaceWith(fragment)
    changed = true
  }
  return changed ? root.innerHTML : html
}
