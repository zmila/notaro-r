import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { MarkdownContent } from './MarkdownContent'
import type { Note, NoteDraft } from '../types'

interface NoteDialogProps {
  note: Note | null
  open: boolean
  onClose: () => void
  onSave: (draft: NoteDraft) => Promise<void>
}

const emptyDraft: NoteDraft = { title: '', body: '', tags: '' }

export function NoteDialog({ note, open, onClose, onSave }: NoteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const tagsRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const focusBodyAfterToggle = useRef(false)
  const [draft, setDraft] = useState<NoteDraft>(emptyDraft)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    if (!focusBodyAfterToggle.current) return
    focusBodyAfterToggle.current = false
    if (preview) previewRef.current?.focus()
    else bodyRef.current?.focus()
  }, [preview])

  useEffect(() => {
    if (!open) return
    setDraft(note ? { title: note.title, body: note.body, tags: note.tags.join(', ') } : emptyDraft)
    setPreview(false)
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    titleRef.current?.focus()
  }, [note, open])

  function close() {
    dialogRef.current?.close()
    onClose()
  }

  async function save() {
    if (!draft.title.trim() && !draft.body.trim()) return
    await onSave(draft)
    close()
  }

  function switchMode(value: boolean) {
    focusBodyAfterToggle.current = true
    setPreview(value)
  }

  function focusBody(atEnd: boolean) {
    const body = bodyRef.current
    if (!body) {
      previewRef.current?.focus()
      return
    }
    body.focus()
    const position = atEnd ? body.value.length : 0
    body.setSelectionRange(position, position)
  }

  function focusTitleEnd() {
    const title = titleRef.current
    title?.focus()
    title?.setSelectionRange(title.value.length, title.value.length)
  }

  function focusTagsStart() {
    const tags = tagsRef.current
    tags?.focus()
    tags?.setSelectionRange(0, 0)
  }

  function formKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    const command = event.ctrlKey || event.metaKey
    if (event.key === 'Enter' && command) {
      event.preventDefault()
      void save()
    } else if (event.key === 'Tab' && command) {
      event.preventDefault()
      switchMode(!preview)
    }
  }

  function indent(outdent: boolean) {
    const body = bodyRef.current
    if (!body) return
    const value = body.value
    const start = body.selectionStart
    const end = body.selectionEnd
    if (start === end && !outdent) {
      body.setRangeText('\t', start, end, 'end')
      setDraft((current) => ({ ...current, body: body.value }))
      return
    }
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    const lineEndIndex = value.indexOf('\n', end)
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex
    const lines = value.slice(lineStart, lineEnd).split('\n')
    const transformed = lines.map((line) => {
      if (!outdent) return `\t${line}`
      return line.startsWith('\t') ? line.slice(1) : line.replace(/^ {1,4}/, '')
    }).join('\n')
    body.setRangeText(transformed, lineStart, lineEnd, 'select')
    setDraft((current) => ({ ...current, body: body.value }))
  }

  function bodyKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const command = event.ctrlKey || event.metaKey
    const body = event.currentTarget
    // Ctrl+Tab bubbles up to the form handler.
    if (event.key === 'Tab' && command) return
    if (event.key === 'Tab') {
      event.preventDefault()
      indent(event.shiftKey)
    } else if (event.key === 'ArrowUp' && !event.shiftKey
      && (command || !body.value.slice(0, body.selectionStart).includes('\n'))) {
      event.preventDefault()
      focusTitleEnd()
    } else if (event.key === 'ArrowDown' && !event.shiftKey
      && (command || !body.value.slice(body.selectionEnd).includes('\n'))) {
      event.preventDefault()
      focusTagsStart()
    }
  }

  return (
    <dialog ref={dialogRef} className="dialog" onCancel={(event) => { event.preventDefault(); close() }}>
      <form className="dialog-form" onKeyDown={formKeyDown} onSubmit={(event) => { event.preventDefault(); void save() }}>
        <div className="dialog-head">{note ? `(Edit Note ${note.id})` : '(New Note)'}</div>
        <input
          ref={titleRef}
          className="dialog-title"
          value={draft.title}
          placeholder="new note title"
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              focusBody(false)
            }
          }}
        />
        {preview ? (
          <MarkdownContent
            ref={previewRef}
            value={draft.body}
            className="dialog-body-preview"
            tabIndex={0}
          />
        ) : (
          <textarea
            ref={bodyRef}
            className="dialog-body"
            value={draft.body}
            placeholder="note text..."
            onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            onKeyDown={bodyKeyDown}
          />
        )}
        <input
          id="note-tags"
          ref={tagsRef}
          className="dialog-tags"
          value={draft.tags}
          placeholder="tags, comma separated"
          onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              focusBody(true)
            }
          }}
        />
        <div className="dialog-buttons">
          <div className="body-mode">
            <button type="button" className={`head-btn mode-button${!preview ? ' active' : ''}`} onClick={() => switchMode(false)}>Edit</button>
            <button type="button" className={`head-btn mode-button${preview ? ' active' : ''}`} onClick={() => switchMode(true)}>Preview</button>
          </div>
          <div className="dialog-actions">
            <button type="submit" className="head-btn dialog-btn">OK</button>
            <button type="button" className="head-btn dialog-btn" onClick={close}>Cancel</button>
          </div>
        </div>
      </form>
    </dialog>
  )
}
