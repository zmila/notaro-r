import DOMPurify from 'dompurify'
import { marked } from 'marked'
import shortcutsDoc from '../docs/keyboard_shortcuts.md?raw'
import { setupHelpWindow } from './helpWindow'
import { parseShortcuts } from './shortcutsDoc'
import './help.css'

// Help > Keyboard Shortcuts window: docs/keyboard_shortcuts.md as tables.

const inline = (markdown: string) => DOMPurify.sanitize(marked.parseInline(markdown) as string)

function render(root: HTMLElement) {
  const { title, sections } = parseShortcuts(shortcutsDoc)
  root.innerHTML = `<h1>${inline(title)}</h1>` + sections.map((section) => `
    <section>
      <h2>${inline(section.title)}</h2>
      ${section.intro.map((text) => `<p>${inline(text)}</p>`).join('')}
      <table>
        <tbody>
          ${section.rows.map((row) => row.keys === null
            ? `<tr><td class="text" colspan="2">${inline(row.text)}</td></tr>`
            : `<tr><th scope="row">${inline(row.keys)}</th><td>${inline(row.text)}</td></tr>`).join('')}
        </tbody>
      </table>
    </section>`).join('')
}

render(document.getElementById('help')!)
setupHelpWindow()
