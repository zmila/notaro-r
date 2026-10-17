/** Focus the open note editor's body (or preview) and bring it into view. */
export function revealNoteEditor() {
  const editor = document.querySelector<HTMLElement>('.note-editor')
  if (!editor) return
  editor.scrollIntoView({ block: 'nearest' })
  editor.querySelector<HTMLElement>('.editor-body, .editor-preview')?.focus({ preventScroll: true })
}
