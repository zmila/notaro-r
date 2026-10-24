import { useEffect, useRef } from 'react'
import { modifierToggle } from '../multiSelect'

interface TagItem {
  name: string
  count: number
}

interface TagsPanelProps {
  tags: TagItem[]
  // Empty: `all`.
  selected: readonly string[]
  // toggle: Ctrl/Cmd+click adds or removes the tag instead of picking only it.
  onSelect: (tag: string, toggle: boolean) => void
}

export function TagsPanel({ tags, selected, onSelect }: TagsPanelProps) {
  const listRef = useRef<HTMLUListElement>(null)
  // A tag picked from a note may be far down the list; the last one picked is shown.
  const last = selected.at(-1)
  useEffect(() => {
    if (last === undefined) return
    listRef.current?.querySelector(`[data-tag="${CSS.escape(last)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [last])

  // `all` stays above the scrolling list.
  const all = tags.find((tag) => tag.name === 'all')

  function button(tag: TagItem, isSelected: boolean, title: string, onClick: (toggle: boolean) => void) {
    return (
      <button
        type="button"
        className={`tag-label${isSelected ? ' selected' : ''}`}
        data-tag={tag.name}
        title={title}
        aria-pressed={isSelected}
        onClick={(event) => onClick(modifierToggle(event))}
      >
        <span className="tag-name">{tag.name}</span>
        <span className="tag-count">{tag.count}</span>
      </button>
    )
  }

  return (
    <aside className="tags">
      {all && (
        <div className="tag-all">
          {button(all, selected.length === 0, 'Show notes of all tags', () => onSelect('all', false))}
        </div>
      )}
      <ul ref={listRef} className="tag-list">
        {tags.filter((tag) => tag !== all).map((tag) => (
          <li className="tag" key={tag.name}>
            {button(tag, selected.includes(tag.name), `${tag.name}\nCtrl+click: add to / remove from the selected tags`,
              (toggle) => onSelect(tag.name, toggle))}
          </li>
        ))}
      </ul>
    </aside>
  )
}
