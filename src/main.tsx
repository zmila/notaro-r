import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@radix-ui/themes/styles.css'
import './index.css'
import App from './App.tsx'

// The X button hides to tray (setHideOnClose in the backend), but the native
// close can't tell X from Alt+F4 — so catch the keystroke here and quit.
window.addEventListener('keydown', (e) => {
  if (e.key === 'F4' && e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
    e.preventDefault()
    void tiny.api.call('quitApp', {})
  }
}, { capture: true })

// Links in rendered notes must open in the default browser, never replace the
// app page. Middle-click (auxclick) would otherwise ask for a new window.
function openLinksExternally(event: MouseEvent) {
  if (event.defaultPrevented || event.button > 1) return
  const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!link) return
  const href = link.getAttribute('href') ?? ''
  if (href.startsWith('#')) return
  event.preventDefault()
  if (/^(https?|mailto):/i.test(href)) void tiny.app.shell.open(link.href)
}
document.addEventListener('click', openLinksExternally, { capture: true })
document.addEventListener('auxclick', openLinksExternally, { capture: true })

// The browser's right-click menu has Back/Reload, which leave the app on a
// blank page. Text fields keep it (cut/copy/paste); Shift+right-click keeps
// it anywhere, for Inspect. Note cards show their own menu (App.tsx).
document.addEventListener('contextmenu', (event) => {
  if (event.shiftKey) return
  if ((event.target as Element | null)?.closest?.('input, textarea, [contenteditable]')) return
  event.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
