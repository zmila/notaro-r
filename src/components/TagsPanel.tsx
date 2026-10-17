import { useEffect, useRef } from 'react'

interface TagItem {
  name: string
  count: number
}

interface TagsPanelProps {
  tags: TagItem[]
  selected: string
  onSelect: (tag: string) => void
}

export function TagsPanel({ tags, selected, onSelect }: TagsPanelProps) {
  const listRef = useRef<HTMLUListElement>(null)
  // A tag picked from a note may be far down the list.
  useEffect(() => {
    listRef.current?.querySelector('.tag-label.selected')?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <aside className="tags">
      <ul ref={listRef} className="tag-list">
        {tags.map((tag) => (
          <li className="tag" key={tag.name}>
            <button
              type="button"
              className={`tag-label${selected === tag.name ? ' selected' : ''}`}
              onClick={() => onSelect(tag.name)}
            >
              <span className="tag-name" title={tag.name}>{tag.name}</span>
              <span className="tag-count">{tag.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
