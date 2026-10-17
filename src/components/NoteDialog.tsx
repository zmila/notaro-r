import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { MarkdownContent } from './MarkdownContent'
import {
  formatCommands,
  formatMarkdown,
  formatShortcuts,
  type FormatCommand,
  type FormatEdit,
} from '../markdownFormat'
import { continueList, indentLines, renumberLists } from '../markdownLists'
import type { Note, NoteDraft } from '../types'

interface NoteDialogProps {
  note: Note | null
  /** pre-filled content for a new note (e.g. pasted from the clipboard) */
  initial?: NoteDraft | null
  open: boolean
  onClose: () => void
  onSave: (draft: NoteDraft) => Promise<void>
}

const emptyDraft: NoteDraft = { title: '', body: '', tags: '' }

function applyEdit(body: HTMLTextAreaElement, edit: FormatEdit) {
  body.setSelectionRange(edit.from, edit.to)
  // insertText keeps the change on the native undo stack (Ctrl+Z).
  const inserted = edit.text
    ? document.execCommand('insertText', false, edit.text)
    : edit.from === edit.to || document.execCommand('delete')
  if (!inserted) body.setRangeText(edit.text, edit.from, edit.to)
  body.setSelectionRange(edit.selectionStart, edit.selectionEnd)
}

function applyFormatEdit(body: HTMLTextAreaElement, format: FormatCommand) {
  applyEdit(body, formatMarkdown(body.value, body.selectionStart, body.selectionEnd, format))
}

export function NoteDialog({ note, initial, open, onClose, onSave }: NoteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const tagsRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const focusBodyAfterToggle = useRef(false)
  const lastFormat = useRef({ format: '', time: 0 })
  const renumbering = useRef(false)
  const [draft, setDraft] = useState<NoteDraft>(emptyDraft)
  const [preview, setPreview] = useState(false)

  // The Format menu's accelerators reach us here; the keydown path below
  // covers the same keys when the page gets them first.
  useEffect(() => tiny.menu.on((id) => {
    const format = id.startsWith('format:') ? id.slice('format:'.length) as FormatCommand : null
    const body = bodyRef.current
    if (!format || !formatCommands.has(format) || !body || document.activeElement !== body) return
    const last = lastFormat.current
    if (last.format === format && performance.now() - last.time < 300) return
    applyFormatEdit(body, format)
    setDraft((current) => ({ ...current, body: body.value }))
  }), [])

  useEffect(() => {
    if (!focusBodyAfterToggle.current) return
    focusBodyAfterToggle.current = false
    if (preview) previewRef.current?.focus()
    else bodyRef.current?.focus()
  }, [preview])

  useEffect(() => {
    if (!open) return
    setDraft(note ? { title: note.title, body: note.body, tags: note.tags.join(', ') } : initial ?? emptyDraft)
    setPreview(false)
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    titleRef.current?.focus()
  }, [initial, note, open])

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
    const edit = indentLines(body.value, body.selectionStart, body.selectionEnd, outdent)
    if (edit) applyEdit(body, edit)
    else if (!outdent) applyEdit(body, { from: body.selectionStart, to: body.selectionEnd, text: '\t', selectionStart: body.selectionStart + 1, selectionEnd: body.selectionStart + 1 })
    else return
    setDraft((current) => ({ ...current, body: body.value }))
  }

  // Keeps an edited ordered list counting 1, 2, 3… — after Enter, Tab, typing
  // or deleting items. It runs once the input event is over (Chromium refuses
  // a nested execCommand), so it lands as its own undo step; undo/redo
  // themselves are left as they are.
  function bodyChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const body = event.currentTarget
    const inputType = (event.nativeEvent as InputEvent).inputType ?? ''
    const previous = draft.body
    if (!renumbering.current && !inputType.startsWith('history')) {
      queueMicrotask(() => {
        if (document.activeElement !== body) return
        const edit = renumberLists(previous, body.value, body.selectionStart, body.selectionEnd)
        if (!edit) return
        renumbering.current = true
        try {
          applyEdit(body, edit)
        } finally {
          renumbering.current = false
        }
        setDraft((current) => ({ ...current, body: body.value }))
      })
    }
    setDraft((current) => ({ ...current, body: body.value }))
  }

  function applyFormat(body: HTMLTextAreaElement, format: FormatCommand) {
    lastFormat.current = { format, time: performance.now() }
    applyFormatEdit(body, format)
    setDraft((current) => ({ ...current, body: body.value }))
  }

  function bodyKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const command = event.ctrlKey || event.metaKey
    const body = event.currentTarget
    // Ctrl+Tab bubbles up to the form handler.
    if (event.key === 'Tab' && command) return
    const format = command && !event.shiftKey && !event.altKey ? formatShortcuts[event.key.toLowerCase()] : undefined
    if (format) {
      event.preventDefault()
      applyFormat(body, format)
    } else if (event.key === 'Enter' && !command && !event.shiftKey && !event.altKey && !event.nativeEvent.isComposing) {
      const edit = continueList(body.value, body.selectionStart, body.selectionEnd)
      if (!edit) return
      event.preventDefault()
      applyEdit(body, edit)
      setDraft((current) => ({ ...current, body: body.value }))
    } else if (event.key === 'Tab') {
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
            onChange={bodyChange}
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
