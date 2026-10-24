import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { MarkdownContent } from './MarkdownContent'
import { NoteTags } from './NoteTags'
import { SuggestPopup, type SuggestItem } from './SuggestPopup'
import { noteDates } from '../noteDates'
import { findLinkTargets, noteLabel, noteLinkMarkdown, noteLinkPrefixAt } from '../noteLinks'
import { extractTags, stripTagLine, tagPrefixAt } from '../noteTags'
import { textareaCaretRect, type CaretRect } from '../textareaCaret'
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
  /** existing tags, offered while a `#tag` is typed */
  tags: string[]
  /** notes offered after `[[` (a link to another note), in this order */
  linkTargets: Note[]
}

const MIN_BODY_HEIGHT = 120
// Typed characters after `#` before existing tags are offered.
const MIN_TAG_PREFIX = 2

// Tags shown in the popup are short; note titles get more room.
const TAG_POPUP_CHARS = 20
const LINK_POPUP_CHARS = 48

interface Suggest {
  /** tags after `#word`, or notes to link after `[[` */
  kind: 'tag' | 'link'
  /** the text position the popup is shown at (the `#` or the `[[`) */
  anchorAt: number
  items: SuggestItem[]
  /** highlighted item; -1 until Down moves into the list */
  active: number
  anchor: CaretRect
}

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
export function NoteEditor({ note, initial, onSave, onCancel, onDirtyChange, tags, linkTargets }: NoteEditorProps) {
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
  const [suggest, setSuggestState] = useState<Suggest | null>(null)
  // Mirrors `suggest` synchronously: onSelect can run before the state lands.
  const suggestOpen = useRef(false)
  const inserting = useRef(false)
  // The `[[` (its position) whose popup Esc closed; -1 for none.
  const dismissedLink = useRef(-1)
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
    setSuggest(null)
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

  function setSuggest(next: Suggest | null | ((current: Suggest | null) => Suggest | null)) {
    if (next === null) suggestOpen.current = false
    else if (typeof next !== 'function') suggestOpen.current = true
    setSuggestState(next)
  }

  // Offer notes to link for the `[[query` at the caret, else existing tags for
  // the `#tag` there. Typing may open the popup; caret moves (`open` false)
  // only update or close it.
  function refreshSuggest(body: HTMLTextAreaElement, open: boolean) {
    if (!open && !suggestOpen.current) return
    const next = body.selectionStart === body.selectionEnd ? suggestAt(body.value, body.selectionStart) : null
    if (!next) {
      if (suggestOpen.current) setSuggest(null)
      return
    }
    const anchor = textareaCaretRect(body, next.anchorAt)
    suggestOpen.current = true
    setSuggestState((current) => {
      // Keep the highlighted item while it is still listed. The link popup
      // highlights its first note at once ([[ asks for it); the tag popup waits for Down.
      const kept = current && current.kind === next.kind && current.active >= 0
        ? next.items.findIndex((item) => item.key === current.items[current.active]?.key)
        : -1
      const active = kept >= 0 ? kept : (next.kind === 'link' || (current && current.active >= 0) ? 0 : -1)
      return { ...next, anchor, active }
    })
  }

  function suggestAt(value: string, caret: number): Omit<Suggest, 'anchor' | 'active'> | null {
    const link = noteLinkPrefixAt(value, caret)
    if (link && link.start !== dismissedLink.current) {
      dismissedLink.current = -1
      const items = findLinkTargets(linkTargets, link.query, note?.id ?? null).map((target) => ({
        key: String(target.id),
        label: noteLabel(target),
        hint: `${target.id} · ${target.updated_at.slice(0, 10)}`,
      }))
      return items.length > 0 ? { kind: 'link', anchorAt: link.start, items } : null
    }
    if (!link) dismissedLink.current = -1
    const token = link ? null : tagPrefixAt(value, caret)
    const prefix = token?.prefix.toLocaleLowerCase() ?? ''
    const matches = token && prefix.length >= MIN_TAG_PREFIX
      ? tags.filter((tag) => tag.toLocaleLowerCase().startsWith(prefix))
      : []
    if (!token || matches.length === 0 || (matches.length === 1 && matches[0].toLocaleLowerCase() === prefix)) return null
    return { kind: 'tag', anchorAt: token.start - 1, items: matches.map((tag) => ({ key: tag, label: tag })) }
  }

  function replaceInBody(body: HTMLTextAreaElement, from: number, to: number, text: string) {
    inserting.current = true
    try {
      applyEdit(body, { from, to, text, selectionStart: from + text.length, selectionEnd: from + text.length })
    } finally {
      inserting.current = false
    }
    setDraft((current) => ({ ...current, body: body.value }))
  }

  function pickSuggestion(index: number) {
    const body = bodyRef.current
    const item = suggest?.items[index]
    const kind = suggest?.kind
    setSuggest(null)
    if (!body || !item) return
    if (kind === 'link') {
      const token = noteLinkPrefixAt(body.value, body.selectionStart)
      const target = linkTargets.find((candidate) => String(candidate.id) === item.key)
      if (token && target) replaceInBody(body, token.start, token.end, noteLinkMarkdown(target))
      return
    }
    const token = tagPrefixAt(body.value, body.selectionStart)
    if (!token) return
    const space = /\s/.test(body.value[token.end] ?? '') ? '' : ' '
    replaceInBody(body, token.start, token.end, item.key + space)
  }

  // Keys for the open popup; true when handled.
  function suggestKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!suggest || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.nativeEvent.isComposing) return false
    const last = suggest.items.length - 1
    const move = (active: number) => setSuggest({ ...suggest, active })
    if (event.key === 'Escape') {
      // Typing on after this `[[` should not bring the notes back.
      if (suggest.kind === 'link') dismissedLink.current = suggest.anchorAt
      setSuggest(null)
    } else if (event.key === 'ArrowDown') move(Math.min(last, suggest.active + 1))
    else if (suggest.active < 0) return false
    else if (event.key === 'ArrowUp') move(suggest.active - 1)
    else if (event.key === 'PageDown') move(Math.min(last, suggest.active + 5))
    else if (event.key === 'PageUp') move(Math.max(0, suggest.active - 5))
    else if (event.key === 'Enter') pickSuggestion(suggest.active)
    else return false
    event.preventDefault()
    event.stopPropagation()
    return true
  }

  // Keep the popup at the caret while the page, the list or the textarea scrolls.
  const suggesting = suggest !== null
  useEffect(() => {
    if (!suggesting) return
    const follow = (event: Event) => {
      const body = bodyRef.current
      if (!body || (event.target instanceof Element && event.target.closest('.tag-suggest'))) return
      setSuggestState((current) => current && { ...current, anchor: textareaCaretRect(body, current.anchorAt) })
    }
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)
    return () => {
      window.removeEventListener('scroll', follow, true)
      window.removeEventListener('resize', follow)
    }
  }, [suggesting])

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
    if (!inserting.current && !renumbering.current) refreshSuggest(body, !inputType.startsWith('history'))
  }

  function applyFormat(body: HTMLTextAreaElement, format: FormatCommand) {
    lastFormat.current = { format, time: performance.now() }
    applyFormatEdit(body, format)
    setDraft((current) => ({ ...current, body: body.value }))
  }

  function bodyKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const command = event.ctrlKey || event.metaKey
    const body = event.currentTarget
    if (suggestKeyDown(event)) return
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
        {note && <time className="editor-dates">{noteDates(note)}</time>}
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
        <>
          <MarkdownContent
            ref={previewRef}
            value={stripTagLine(draft.body)}
            className="editor-preview"
            tabIndex={0}
            style={{ height }}
          />
          <NoteTags tags={extractTags(draft.body)} />
        </>
      ) : (
        <textarea
          ref={bodyRef}
          className="editor-body"
          value={draft.body}
          placeholder="note text… (#tags anywhere, [[ links another note)"
          style={{ height }}
          onChange={bodyChange}
          onKeyDown={bodyKeyDown}
          onSelect={(event) => refreshSuggest(event.currentTarget, false)}
          onBlur={() => setSuggest(null)}
        />
      )}
      {suggest && !preview && (
        <SuggestPopup
          items={suggest.items}
          active={suggest.active}
          anchor={suggest.anchor}
          maxChars={suggest.kind === 'link' ? LINK_POPUP_CHARS : TAG_POPUP_CHARS}
          onPick={pickSuggestion}
        />
      )}
    </article>
  )
}
