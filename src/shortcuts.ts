import DOMPurify from 'dompurify'
import { marked } from 'marked'
import readme from '../README.md?raw'
import { parseShortcuts } from './shortcutsDoc'
import './shortcuts.css'

// Help > Keyboard Shortcuts window: the README's shortcut list as tables.

const inline = (markdown: string) => DOMPurify.sanitize(marked.parseInline(markdown) as string)

function render(root: HTMLElement) {
  const sections = parseShortcuts(readme)
  root.innerHTML = `<h1>Keyboard shortcuts</h1>` + sections.map((section) => `
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

render(document.getElementById('shortcuts')!)

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') void window.tiny?.win?.close?.()
})

// Like the main window: a right-click must not offer the browser's Back/Reload.
document.addEventListener('contextmenu', (event) => {
  if (!event.shiftKey) event.preventDefault()
})
