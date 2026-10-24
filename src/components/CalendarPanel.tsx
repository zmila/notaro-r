import { useState } from 'react'
import { modifierToggle } from '../multiSelect'

interface MonthGroup {
  year: string
  months: string[]
}

interface CalendarPanelProps {
  groups: MonthGroup[]
  // `YYYY-MM` keys; empty: no month filter.
  selected: readonly string[]
  // toggle: Ctrl/Cmd+click adds or removes the month instead of picking only it.
  onSelect: (month: string, toggle: boolean) => void
}

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december']

export function CalendarPanel({ groups, selected, onSelect }: CalendarPanelProps) {
  // Years start collapsed; a year is shown expanded only after a click on its header.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())

  function toggleYear(year: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(year)) next.delete(year)
      else next.add(year)
      return next
    })
  }

  return (
    <div className="calendar">
      {groups.map((group) => {
        const open = expanded.has(group.year)
        const picked = selected.filter((month) => month.startsWith(`${group.year}-`)).length
        return (
          <section className={`year${open ? ' open' : ''}`} key={group.year}>
            <button
              type="button"
              className={`year-title${picked > 0 ? ' has-selected' : ''}`}
              aria-expanded={open}
              title={`${open ? 'Collapse' : 'Expand'} ${group.year}${picked > 0 ? ` (${picked} selected)` : ''}`}
              onClick={() => toggleYear(group.year)}
            >
              <span className="year-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
              {group.year}
              {picked > 0 && <span className="year-picked">✓{picked > 1 ? picked : ''}</span>}
            </button>
            {open && (
              <ul className="months">
                {group.months.map((month) => {
                  const key = `${group.year}-${month}`
                  const isSelected = selected.includes(key)
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        className={`month${isSelected ? ' selected' : ''}`}
                        title="Click: show this month only (again: all); Ctrl+click: add or remove it"
                        aria-pressed={isSelected}
                        onClick={(event) => onSelect(key, modifierToggle(event))}
                      >
                        <span className="month-mark" aria-hidden="true">{isSelected ? '✓' : ''}</span>
                        {month} {MONTH_NAMES[Number(month) - 1]}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
