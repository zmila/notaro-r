import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { CaretRect } from '../textareaCaret'

const VISIBLE_ROWS = 5
const MAX_WIDTH_CHARS = 20

interface TagSuggestProps {
  tags: string[]
  /** highlighted row; -1 while the keyboard is still in the textarea */
  active: number
  anchor: CaretRect
  onPick: (tag: string) => void
}

// Existing tags matching the one being typed, under (or above) the caret.
// It never takes the focus: the editor drives it from the textarea's keys.
export function TagSuggest({ tags, active, anchor, onPick }: TagSuggestProps) {
  const ref = useRef<HTMLDivElement>(null)
  const longest = Math.min(MAX_WIDTH_CHARS, Math.max(...tags.map((tag) => tag.length)))

  useLayoutEffect(() => {
    const popup = ref.current
    if (!popup) return
    const { width, height } = popup.getBoundingClientRect()
    const below = anchor.bottom + 2
    const top = below + height <= window.innerHeight - 4 ? below : Math.max(4, anchor.top - height - 2)
    popup.style.top = `${top}px`
    popup.style.left = `${Math.max(4, Math.min(anchor.left, window.innerWidth - width - 4))}px`
  }, [anchor, tags])

  useLayoutEffect(() => {
    const popup = ref.current
    const row = active >= 0 ? popup?.children[active] as HTMLElement | undefined : undefined
    if (!popup || !row) return
    if (row.offsetTop < popup.scrollTop) popup.scrollTop = row.offsetTop
    else if (row.offsetTop + row.offsetHeight > popup.scrollTop + popup.clientHeight) {
      popup.scrollTop = row.offsetTop + row.offsetHeight - popup.clientHeight
    }
  }, [active, tags])

  return createPortal(
    <div
      ref={ref}
      className="tag-suggest"
      role="listbox"
      style={{
        width: `calc(${longest + 1}ch + 14px${tags.length > VISIBLE_ROWS ? ' + 12px' : ''})`,
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
      {tags.map((tag, index) => (
        <div
          key={tag}
          role="option"
          aria-selected={index === active}
          className={`tag-suggest-item${index === active ? ' active' : ''}`}
          title={tag.length > MAX_WIDTH_CHARS ? tag : undefined}
          onClick={() => onPick(tag)}
        >{tag}</div>
      ))}
    </div>,
    document.body,
  )
}
