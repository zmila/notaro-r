import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { CaretRect } from '../textareaCaret'

const VISIBLE_ROWS = 5

export interface SuggestItem {
  key: string
  label: string
  /** dimmed text after the label (e.g. a note's id and date) */
  hint?: string
}

interface SuggestPopupProps {
  items: SuggestItem[]
  /** highlighted row; -1 while the keyboard is still in the textarea */
  active: number
  anchor: CaretRect
  /** the popup's width limit, in characters */
  maxChars: number
  onPick: (index: number) => void
}

// Existing tags (or notes to link) matching what is typed, under (or above)
// the caret. It never takes the focus: the editor drives it from the textarea's keys.
export function SuggestPopup({ items, active, anchor, maxChars, onPick }: SuggestPopupProps) {
  const ref = useRef<HTMLDivElement>(null)
  const longest = Math.min(maxChars, Math.max(...items.map((item) => item.label.length + (item.hint ? item.hint.length + 2 : 0))))

  useLayoutEffect(() => {
    const popup = ref.current
    if (!popup) return
    const { width, height } = popup.getBoundingClientRect()
    const below = anchor.bottom + 2
    const top = below + height <= window.innerHeight - 4 ? below : Math.max(4, anchor.top - height - 2)
    popup.style.top = `${top}px`
    popup.style.left = `${Math.max(4, Math.min(anchor.left, window.innerWidth - width - 4))}px`
  }, [anchor, items])

  useLayoutEffect(() => {
    const popup = ref.current
    const row = active >= 0 ? popup?.children[active] as HTMLElement | undefined : undefined
    if (!popup || !row) return
    if (row.offsetTop < popup.scrollTop) popup.scrollTop = row.offsetTop
    else if (row.offsetTop + row.offsetHeight > popup.scrollTop + popup.clientHeight) {
      popup.scrollTop = row.offsetTop + row.offsetHeight - popup.clientHeight
    }
  }, [active, items])

  return createPortal(
    <div
      ref={ref}
      className="tag-suggest"
      role="listbox"
      style={{
        width: `calc(${longest + 1}ch + 14px${items.length > VISIBLE_ROWS ? ' + 12px' : ''})`,
        maxHeight: `calc(${VISIBLE_ROWS} * var(--tag-row) + 2px)`,
      }}
      // Keep the focus (and caret) in the textarea; it also lets the
      // scrollbar work without closing the popup.
      onMouseDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {items.map((item, index) => (
        <div
          key={item.key}
          role="option"
          aria-selected={index === active}
          className={`tag-suggest-item${index === active ? ' active' : ''}`}
          title={item.label.length + (item.hint ? item.hint.length + 2 : 0) > maxChars ? item.label : undefined}
          onClick={() => onPick(index)}
        >
          <span className="suggest-label">{item.label}</span>
          {item.hint && <span className="suggest-hint">{item.hint}</span>}
        </div>
      ))}
    </div>,
    document.body,
  )
}
