// The read-only tags row at the bottom of a note; clicks are handled by the card.
export function NoteTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null
  return (
    <div className="note-tags">
      {tags.map((tag, index) => (
        <span key={`${index}:${tag}`}  className="note-tag" data-tag={tag}>#{tag}</span>
      ))}
    </div>
  )
}
