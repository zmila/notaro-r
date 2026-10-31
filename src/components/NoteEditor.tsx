import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { FindPanel } from './FindPanel'
import { MarkdownContent } from './MarkdownContent'
import { NoteTags } from './NoteTags'
import { SuggestPopup, type SuggestItem } from './SuggestPopup'
import { FIND_LIMIT, findMatches, matchIndexFrom, replaceAllEdit, type FindMatch, type FindOptions } from '../findText'
import { noteDates } from '../noteDates'
import { findLinkTargets, noteLabel, noteLinkMarkdown, noteLinkPrefixAt } from '../noteLinks'
import { extractTags, stripTagLine, tagPrefixAt } from '../noteTags'
import { textareaCaretRect, textareaTextStyle, type CaretRect } from '../textareaCaret'
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
  ref?: Ref<NoteEditorHandle>
}

export interface NoteEditorHandle {
  /** Ctrl+F / Ctrl+R: show the find panel (with the Replace row) and focus it */
  openFind: (replace: boolean) => void
}

// The body's text with the find matches marked, for the layer behind the textarea.
function findHits(text: string, matches: FindMatch[], current: number): ReactNode[] {
  const parts: ReactNode[] = []
  let at = 0
  matches.forEach((match, index) => {
    parts.push(text.slice(at, match.start))
    parts.push(<mark key={index} className={`find-hit${index === current ? ' current' : ''}`}>{text.slice(match.start, match.end)}</mark>)
    at = match.end
  })
  // A trailing newline makes a line in the textarea, but not in a div.
  parts.push(`${text.slice(at)} `)
  return parts
}

const MIN_BODY_HEIGHT = 120
// Typed characters after `#` or `[[` (or in a link label) before the popup shows.
const MIN_QUERY = 1

// Tags shown in the popup are short; note titles get more room.
const TAG_POPUP_CHARS = 20
const LINK_POPUP_CHARS = 48

interface Suggest {
  /** tags after `#word`, or notes to link after `[[` */
  kind: 'tag' | 'link'
  /** the text position the popup is shown at (the `#`, the `[[` or the link's `[`) */
  anchorAt: number
  /** highlight the first item at once (a `[[` query); otherwise wait for Down */
  eager: boolean
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
export function NoteEditor({ ref, note, initial, onSave, onCancel, onDirtyChange, tags, linkTargets }: NoteEditorProps) {
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

  // Find (and Replace) in the body. The current match is the first one at or
  // after `findAnchor`; `reveal` bumps select it and scroll it into view.
  const findRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [showReplace, setShowReplace] = useState(false)
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [findOptions, setFindOptions] = useState<FindOptions>({ matchCase: false, wholeWord: false, wildcards: false })
  const [findAnchor, setFindAnchor] = useState(0)
  const [reveal, setReveal] = useState(0)
  const [findFocus, setFindFocus] = useState({ target: 'find' as 'find' | 'replace', gen: 0 })
  const matches = useMemo(
    () => (findOpen && !preview ? findMatches(draft.body, query, findOptions) : []),
    [findOpen, preview, draft.body, query, findOptions],
  )
  const current = matchIndexFrom(matches, findAnchor)
  const findStatus = matches.length > 0
    ? `${current + 1} of ${matches.length}${matches.length >= FIND_LIMIT ? '+' : ''}`
    : (query ? 'No results' : '')

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
    // Find works on the text, not on the rendered preview.
    if (value) setFindOpen(false)
    focusBodyAfterToggle.current = true
    setPreview(value)
  }

  function openFind(replace: boolean) {
    const body = bodyRef.current
    let seed = query
    if (body) {
      const selected = body.value.slice(body.selectionStart, body.selectionEnd)
      if (selected && !selected.includes('\n') && selected.length <= 200) seed = selected
      setFindAnchor(body.selectionStart)
    } else if (preview) {
      if (previewRef.current) setHeight(previewRef.current.offsetHeight)
      setSuggest(null)
      setPreview(false)
    }
    setQuery(seed)
    setFindOpen(true)
    if (replace) setShowReplace(true)
    setFindFocus((focus) => ({ target: replace && seed ? 'replace' : 'find', gen: focus.gen + 1 }))
    setReveal((value) => value + 1)
  }

  useImperativeHandle(ref, () => ({ openFind }))

  function closeFind() {
    setFindOpen(false)
    // The current match stays selected.
    bodyRef.current?.focus()
  }

  function stepMatch(step: 1 | -1) {
    if (matches.length === 0) return
    const next = matches[(current + step + matches.length) % matches.length]
    setFindAnchor(next.start)
    setReveal((value) => value + 1)
  }

  // An edit made from the find panel: execCommand needs the textarea focused
  // (for Ctrl+Z), then the focus goes back to the panel.
  function editFromPanel(from: number, to: number, text: string) {
    const body = bodyRef.current
    if (!body) return
    const active = document.activeElement as HTMLElement | null
    body.focus({ preventScroll: true })
    replaceInBody(body, from, to, text)
    if (active && active !== body) active.focus({ preventScroll: true })
  }

  function replaceCurrent() {
    const match = matches[current]
    if (!match) return
    editFromPanel(match.start, match.end, replacement)
    setFindAnchor(match.start + replacement.length)
    setReveal((value) => value + 1)
  }

  function replaceAll() {
    const body = bodyRef.current
    if (!body) return
    const edit = replaceAllEdit(body.value, findMatches(body.value, query, findOptions, Infinity), replacement)
    if (!edit) return
    editFromPanel(edit.from, edit.to, edit.text)
    setFindAnchor(edit.from)
  }

  useEffect(() => {
    if (findFocus.gen === 0) return
    const input = findFocus.target === 'replace' ? replaceRef.current : findRef.current
    input?.focus()
    input?.select()
  }, [findFocus])

  // The highlight layer sits exactly over the textarea's text area (without
  // its scrollbar) and wraps the text the same way.
  useLayoutEffect(() => {
    const body = bodyRef.current
    const backdrop = backdropRef.current
    if (!findOpen || !body || !backdrop) return
    const place = () => {
      for (const [name, value] of Object.entries(textareaTextStyle(body))) backdrop.style.setProperty(name, value)
      Object.assign(backdrop.style, {
        top: `${body.offsetTop + body.clientTop}px`,
        left: `${body.offsetLeft + body.clientLeft}px`,
        width: `${body.clientWidth}px`,
        height: `${body.clientHeight}px`,
      })
      backdrop.scrollTop = body.scrollTop
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(body)
    return () => observer.disconnect()
  }, [findOpen, preview])

  // Text changes re-render the layer; keep it scrolled with the textarea.
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (backdropRef.current && body) backdropRef.current.scrollTop = body.scrollTop
  })

  // Select the current match and scroll it into view (the textarea, then the notes list).
  useLayoutEffect(() => {
    const body = bodyRef.current
    const backdrop = backdropRef.current
    const match = matches[current]
    if (reveal === 0 || !body || !backdrop || !match) return
    body.setSelectionRange(match.start, match.end)
    const mark = backdrop.querySelector<HTMLElement>('.find-hit.current')
    if (!mark) return
    const top = mark.offsetTop
    const bottom = top + mark.offsetHeight
    if (top < body.scrollTop || bottom > body.scrollTop + body.clientHeight) {
      body.scrollTop = Math.max(0, top - body.clientHeight / 3)
    }
    backdrop.scrollTop = body.scrollTop
    mark.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    body.scrollTop = backdrop.scrollTop
    // Only the reveal requests move the selection, not every recomputed match list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal])

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
      // Keep the highlighted item while it is still listed. A `[[` popup
      // highlights its first note at once ([[ asks for it); the tag popup and
      // one over a finished link's label wait for Down, so Enter stays a newline.
      const kept = current && current.kind === next.kind && current.active >= 0
        ? next.items.findIndex((item) => item.key === current.items[current.active]?.key)
        : -1
      const active = kept >= 0 ? kept : (next.eager || (current && current.active >= 0) ? 0 : -1)
      return { ...next, anchor, active }
    })
  }

  function suggestAt(value: string, caret: number): Omit<Suggest, 'anchor' | 'active'> | null {
    const link = noteLinkPrefixAt(value, caret)
    if (link && link.start !== dismissedLink.current) {
      dismissedLink.current = -1
      if (link.query.trim().length < MIN_QUERY) return null
      const items = findLinkTargets(linkTargets, link.query, note?.id ?? null).map((target) => ({
        key: String(target.id),
        label: noteLabel(target),
        hint: `${target.id} · ${target.updated_at.slice(0, 10)}`,
      }))
      const eager = value.startsWith('[[', link.start)
      return items.length > 0 ? { kind: 'link', anchorAt: link.start, eager, items } : null
    }
    if (!link) dismissedLink.current = -1
    const token = link ? null : tagPrefixAt(value, caret)
    const prefix = token?.prefix.toLocaleLowerCase() ?? ''
    const matches = token && prefix.length >= MIN_QUERY
      ? tags.filter((tag) => tag.toLocaleLowerCase().startsWith(prefix))
      : []
    if (!token || matches.length === 0 || (matches.length === 1 && matches[0].toLocaleLowerCase() === prefix)) return null
    return { kind: 'tag', anchorAt: token.start - 1, eager: false, items: matches.map((tag) => ({ key: tag, label: tag })) }
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
    if (event.key === 'Escape' && findOpen && !event.nativeEvent.isComposing) {
      event.preventDefault()
      event.stopPropagation()
      closeFind()
    } else if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    } else if (event.key === 'F3' && findOpen && !command && !event.altKey) {
      event.preventDefault()
      stepMatch(event.shiftKey ? -1 : 1)
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
      {findOpen && !preview && (
        <FindPanel
          query={query}
          replacement={replacement}
          options={findOptions}
          showReplace={showReplace}
          status={findStatus}
          hasMatches={matches.length > 0}
          findRef={findRef}
          replaceRef={replaceRef}
          onQuery={(value) => {
            setQuery(value)
            setReveal((gen) => gen + 1)
          }}
          onReplacement={setReplacement}
          onOption={(name) => {
            setFindOptions((options) => ({ ...options, [name]: !options[name] }))
            setReveal((gen) => gen + 1)
          }}
          onToggleReplace={() => {
            setShowReplace(!showReplace)
            setFindFocus((focus) => ({ target: showReplace ? 'find' : 'replace', gen: focus.gen + 1 }))
          }}
          onNext={() => stepMatch(1)}
          onPrevious={() => stepMatch(-1)}
          onReplace={replaceCurrent}
          onReplaceAll={replaceAll}
          onClose={closeFind}
        />
      )}
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
        <div className={`editor-body-wrap${findOpen ? ' finding' : ''}`}>
          {findOpen && (
            <div ref={backdropRef} className="find-backdrop" aria-hidden="true">
              {findHits(draft.body, matches, current)}
            </div>
          )}
          <textarea
            ref={bodyRef}
            className="editor-body"
            value={draft.body}
            placeholder="note text… (#tags anywhere, [[ links another note)"
            style={{ height }}
            onChange={bodyChange}
            onKeyDown={bodyKeyDown}
            onScroll={(event) => {
              if (backdropRef.current) backdropRef.current.scrollTop = event.currentTarget.scrollTop
            }}
            onSelect={(event) => refreshSuggest(event.currentTarget, false)}
            onBlur={() => setSuggest(null)}
          />
        </div>
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
