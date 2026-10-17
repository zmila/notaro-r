import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
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

interface NoteEditorProps {
  /** the edited note; null for a new one */
  note: Note | null
  /** the draft at open time; the editor is dirty while it differs from it */
  initial: NoteDraft
  onSave: (draft: NoteDraft) => Promise<void>
  onCancel: () => void
  onDirtyChange: (dirty: boolean) => void
}

const MIN_BODY_HEIGHT = 120

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

// The note card in edit mode: a toolbar on top, then the title and the body
// sharing one border. The body's bottom-right corner resizes it.
export function NoteEditor({ note, initial, onSave, onCancel, onDirtyChange }: NoteEditorProps) {
  const cardRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const focusBodyAfterToggle = useRef(false)
  const lastFormat = useRef({ format: '', time: 0 })
  const renumbering = useRef(false)
  const saving = useRef(false)
  const [draft, setDraft] = useState<NoteDraft>(initial)
  const [preview, setPreview] = useState(false)
  // Shared by the body and the preview, so switching keeps the size.
  const [height, setHeight] = useState<number | undefined>(undefined)
  const dirty = draft.title !== initial.title || draft.body !== initial.body

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  // Fit the body to its text at first (within limits), show the card, focus the title.
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (body) {
      const max = Math.max(MIN_BODY_HEIGHT, Math.round(window.innerHeight * 0.6))
      setHeight(Math.min(max, Math.max(MIN_BODY_HEIGHT, body.scrollHeight + 2)))
    }
    cardRef.current?.scrollIntoView({ block: 'nearest' })
    titleRef.current?.focus({ preventScroll: true })
  }, [])

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

  async function save() {
    if (saving.current) return
    if (!draft.title.trim() && !draft.body.trim()) {
      if (!note) onCancel()
      return
    }
    saving.current = true
    try {
      await onSave(draft)
    } finally {
      saving.current = false
    }
  }

  function switchMode(value: boolean) {
    if (value === preview) return
    const current = preview ? previewRef.current : bodyRef.current
    if (current) setHeight(current.offsetHeight)
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

  function cardKeyDown(event: KeyboardEvent<HTMLElement>) {
    const command = event.ctrlKey || event.metaKey
    if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    } else if (event.key === 'Enter' && command) {
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
    // Ctrl+Tab bubbles up to the card handler.
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
    }
  }

  return (
    <article
      ref={cardRef}
      className="note note-editor editing"
      data-note-id={note?.id}
      onKeyDown={cardKeyDown}
      onContextMenu={(event) => {
        // Text fields keep the native menu (cut/copy/paste); no note menu here.
        event.stopPropagation()
        if (!(event.target as Element).closest('input, textarea')) event.preventDefault()
      }}
    >
      <div className="editor-bar">
        <div className="body-mode">
          <button type="button" className={`head-btn editor-btn mode-button${!preview ? ' active' : ''}`} title="Edit (Ctrl+Tab)" onClick={() => switchMode(false)}>Edit</button>
          <button type="button" className={`head-btn editor-btn mode-button${preview ? ' active' : ''}`} title="Preview (Ctrl+Tab)" onClick={() => switchMode(true)}>Preview</button>
        </div>
        <span className="editor-label">{note ? `Note ${note.id}` : 'New note'}{dirty ? ' •' : ''}</span>
        <div className="editor-actions">
          <button type="button" className="head-btn editor-btn editor-ok" title="Save (Ctrl+Enter)" onClick={() => void save()}>OK</button>
          <button type="button" className="head-btn editor-btn" title="Cancel (Esc)" onClick={onCancel}>Cancel</button>
        </div>
      </div>
      <input
        ref={titleRef}
        className="editor-title"
        value={draft.title}
        placeholder="note title"
        onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            focusBody(false)
          } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault()
            void save()
          }
        }}
      />
      {preview ? (
        <MarkdownContent
          ref={previewRef}
          value={draft.body}
          className="editor-preview"
          tabIndex={0}
          style={{ height }}
        />
      ) : (
        <textarea
          ref={bodyRef}
          className="editor-body"
          value={draft.body}
          placeholder="note text… (#tags anywhere)"
          style={{ height }}
          onChange={bodyChange}
          onKeyDown={bodyKeyDown}
        />
      )}
    </article>
  )
}
