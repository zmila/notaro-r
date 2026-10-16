import DOMPurify from 'dompurify'
import { marked } from 'marked'

const MARKDOWN_CACHE_LIMIT = 2000
const markdownCache = new Map<string, string>()

export function markdownHtml(value: string): string {
  const cached = markdownCache.get(value)
  if (cached !== undefined) return cached
  const html = DOMPurify.sanitize(marked.parse(value, { breaks: true, async: false }))
  if (markdownCache.size >= MARKDOWN_CACHE_LIMIT) {
    markdownCache.delete(markdownCache.keys().next().value!)
  }
  markdownCache.set(value, html)
  return html
}

export function highlightHtml(html: string, terms: string[]): string {
  if (terms.length === 0) return html

  const root = document.createElement('div')
  root.innerHTML = html
  const pattern = terms
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const matcher = new RegExp(`(${pattern})`, 'giu')
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text)

  for (const node of textNodes) {
    if (node.parentElement?.closest('mark, script, style')) continue
    if (!matcher.test(node.nodeValue ?? '')) {
      matcher.lastIndex = 0
      continue
    }
    matcher.lastIndex = 0
    const fragment = document.createDocumentFragment()
    let last = 0
    for (const match of (node.nodeValue ?? '').matchAll(matcher)) {
      fragment.append((node.nodeValue ?? '').slice(last, match.index))
      const mark = document.createElement('mark')
      mark.className = 'note-match'
      mark.textContent = match[0]
      fragment.append(mark)
      last = match.index + match[0].length
    }
    fragment.append((node.nodeValue ?? '').slice(last))
    node.replaceWith(fragment)
  }

  return DOMPurify.sanitize(root.innerHTML)
}
