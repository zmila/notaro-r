// Shared behaviour of the Help windows (Keyboard Shortcuts, Markdown Syntax).

export function setupHelpWindow() {
  // No navigation inside a help window: external links go to the default
  // browser; links between the docs and to notes (#note-N) do nothing here.
  document.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest('a[href]')
    if (!link) return
    event.preventDefault()
    const href = link.getAttribute('href') ?? ''
    if (/^(https?:|mailto:)/i.test(href)) void window.tiny?.app?.shell?.open?.(href)
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') void window.tiny?.win?.close?.()
  })

  // Like the main window: a right-click must not offer the browser's Back/Reload.
  document.addEventListener('contextmenu', (event) => {
    if (!event.shiftKey) event.preventDefault()
  })
}
