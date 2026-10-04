import type { SortDirection, SortField } from '../types'

interface ToolbarProps {
  search: string
  visibleCount: number
  onSearchChange: (value: string) => void
  onSearch: () => void
}

export function Toolbar({
  search,
  visibleCount,
  onSearchChange,
  onSearch,
}: ToolbarProps) {
  return (
    <>
      <div className="toolbar">
        <label className="find-label" htmlFor="find-input">Find:</label>
        <input
          id="find-input"
          className="find-input"
          value={search}
          placeholder="filter notes..."
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') onSearch() }}
        />
        <button type="button" className="head-btn find-btn" title="Find" onClick={onSearch}>Find</button>
        <output className="visible-count" aria-live="polite">{visibleCount}</output>
      </div>
    </>
  )
}

interface SortControlsProps {
  field: SortField
  direction: SortDirection
  onFieldChange: (value: SortField) => void
  onDirectionChange: () => void
}

export function SortControls({ field, direction, onFieldChange, onDirectionChange }: SortControlsProps) {
  return (
    <div className="sort">
      <select
        className="sort-field"
        aria-label="Sort field"
        value={field}
        onChange={(event) => onFieldChange(event.target.value as SortField)}
      >
        <option value="created">created</option>
        <option value="updated">updated</option>
        <option value="title">title</option>
      </select>
      <button type="button" className="head-btn sort-dir" title="Sort direction" onClick={onDirectionChange}>
        {direction}
      </button>
    </div>
  )
}
