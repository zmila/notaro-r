import type { KeyboardEvent, MouseEvent, Ref } from 'react'
import type { FindOptions } from '../findText'

interface FindPanelProps {
  query: string
  replacement: string
  options: FindOptions
  showReplace: boolean
  /** e.g. `2 of 5`, `No results`, or empty */
  status: string
  hasMatches: boolean
  findRef: Ref<HTMLInputElement>
  replaceRef: Ref<HTMLInputElement>
  onQuery: (value: string) => void
  onReplacement: (value: string) => void
  onOption: (name: keyof FindOptions) => void
  onToggleReplace: () => void
  onNext: () => void
  onPrevious: () => void
  onReplace: () => void
  onReplaceAll: () => void
  onClose: () => void
}

// Buttons keep the focus in the input that was typed into.
const keepFocus = (event: MouseEvent) => event.preventDefault()

const OPTIONS: { name: keyof FindOptions, label: string, title: string, className?: string }[] = [
  { name: 'matchCase', label: 'Aa', title: 'Match Case' },
  { name: 'wholeWord', label: 'ab', title: 'Match Whole Word', className: 'find-opt-word' },
  { name: 'wildcards', label: '*?', title: 'Use * and ? Wildcards (\\* and \\? find the characters)' },
]

// Find (and Replace) in the edited note's text, shown above it.
export function FindPanel(props: FindPanelProps) {
  const { query, replacement, options, showReplace, status, hasMatches, findRef, replaceRef } = props

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) return
    const inReplace = (event.target as HTMLElement).classList.contains('find-panel-replace')
    if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      // Not the card's Escape (which would cancel the edit).
      event.preventDefault()
      event.stopPropagation()
      props.onClose()
    } else if (event.key === 'F3' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault()
      event.stopPropagation()
      if (event.shiftKey) props.onPrevious()
      else props.onNext()
    } else if (event.key === 'Enter' && inReplace && event.ctrlKey && event.altKey) {
      event.preventDefault()
      event.stopPropagation()
      props.onReplaceAll()
    } else if (event.key === 'Enter' && !event.ctrlKey && !event.altKey && !event.metaKey
      && (event.target as HTMLElement).tagName === 'INPUT') {
      // Ctrl+Enter still reaches the card (save).
      event.preventDefault()
      event.stopPropagation()
      if (inReplace && !event.shiftKey) props.onReplace()
      else if (event.shiftKey) props.onPrevious()
      else props.onNext()
    }
  }

  return (
    <div className="find-panel" role="search" onKeyDown={keyDown}>
      <button
        type="button"
        className="find-btn find-expand"
        title="Toggle Replace (Ctrl+R)"
        aria-label="Toggle Replace"
        aria-expanded={showReplace}
        onMouseDown={keepFocus}
        onClick={props.onToggleReplace}
      >{showReplace ? '⌄' : '›'}</button>
      <div className="find-rows">
        <div className="find-row">
          <div className="find-field">
            <input
              ref={findRef}
              className="find-panel-input"
              value={query}
              placeholder="Find"
              aria-label="Find in note"
              spellCheck={false}
              onChange={(event) => props.onQuery(event.target.value)}
            />
            {OPTIONS.map((option) => (
              <button
                key={option.name}
                type="button"
                className={`find-opt${option.className ? ` ${option.className}` : ''}${options[option.name] ? ' active' : ''}`}
                title={option.title}
                aria-pressed={options[option.name]}
                onMouseDown={keepFocus}
                onClick={() => props.onOption(option.name)}
              >{option.label}</button>
            ))}
          </div>
          <span className={`find-status${query && !hasMatches ? ' none' : ''}`}>{status}</span>
          <button type="button" className="find-btn" title="Previous Match (Shift+Enter)" aria-label="Previous match" disabled={!hasMatches} onMouseDown={keepFocus} onClick={props.onPrevious}>↑</button>
          <button type="button" className="find-btn" title="Next Match (Enter)" aria-label="Next match" disabled={!hasMatches} onMouseDown={keepFocus} onClick={props.onNext}>↓</button>
          <button type="button" className="find-btn" title="Close (Esc)" aria-label="Close" onMouseDown={keepFocus} onClick={props.onClose}>×</button>
        </div>
        {showReplace && (
          <div className="find-row">
            <div className="find-field">
              <input
                ref={replaceRef}
                className="find-panel-input find-panel-replace"
                value={replacement}
                placeholder="Replace"
                aria-label="Replace with"
                spellCheck={false}
                onChange={(event) => props.onReplacement(event.target.value)}
              />
            </div>
            <button type="button" className="find-btn find-text-btn" title="Replace (Enter)" disabled={!hasMatches} onMouseDown={keepFocus} onClick={props.onReplace}>Replace</button>
            <button type="button" className="find-btn find-text-btn" title="Replace All (Ctrl+Alt+Enter)" disabled={!hasMatches} onMouseDown={keepFocus} onClick={props.onReplaceAll}>All</button>
          </div>
        )}
      </div>
    </div>
  )
}
