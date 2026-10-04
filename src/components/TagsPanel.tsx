interface TagItem {
  name: string
  count: number
}

interface TagsPanelProps {
  tags: TagItem[]
  selected: string
  onSelect: (tag: string) => void
  onNewNote: () => void
}

export function TagsPanel({ tags, selected, onSelect, onNewNote }: TagsPanelProps) {
  return (
    <aside className="tags">
      <div className="tags-head">
        <button type="button" className="head-btn new-note" onClick={onNewNote}>New note +</button>
      </div>
      <ul className="tag-list">
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
