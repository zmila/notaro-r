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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
