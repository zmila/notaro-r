import DOMPurify from 'dompurify'
import { marked } from 'marked'
import syntaxDoc from '../docs/markdown_syntax.md?raw'
import { setupHelpWindow } from './helpWindow'
import { markdownHtml } from './markdown'
import './help.css'
import './noteContent.css'
import './markdownHelp.css'

// Help > Markdown Syntax window: docs/markdown_syntax.md. Its tables have the
// columns Type | Looks like | Shortcut; the "Looks like" cells are written for
// GitHub, so here they are replaced by the "Type" text rendered the way notes
// render it (markdownHtml: tags, note links, the note styles).

// The raw Markdown of a "Type" cell: code spans give their text, `<pre>` blocks
// their lines (`<br>`) — what a user would type.
function cellMarkdown(cell: Element): string {
  const copy = cell.cloneNode(true) as Element
  copy.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
  return copy.textContent ?? ''
}

function render(root: HTMLElement) {
  root.innerHTML = DOMPurify.sanitize(marked.parse(syntaxDoc, { async: false }))
  root.querySelectorAll('table').forEach((table) => {
    const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent?.trim())
    if (heads[0] !== 'Type' || heads[1] !== 'Looks like') return
    table.classList.add('syntax-table')
    table.querySelectorAll('tbody tr').forEach((row) => {
      const [type, looks] = row.children
      if (!type || !looks) return
      type.classList.add('md-raw')
      looks.innerHTML = `<div class="note-text md-rendered">${markdownHtml(cellMarkdown(type))}</div>`
    })
  })
}

render(document.getElementById('help')!)
setupHelpWindow()
