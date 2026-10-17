import { useState } from 'react'

interface MonthGroup {
  year: string
  months: string[]
}

interface CalendarPanelProps {
  groups: MonthGroup[]
  selected: string | null
  onSelect: (month: string | null) => void
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
        const hasSelected = selected?.startsWith(`${group.year}-`) ?? false
        return (
          <section className={`year${open ? ' open' : ''}`} key={group.year}>
            <button
              type="button"
              className={`year-title${hasSelected ? ' has-selected' : ''}`}
              aria-expanded={open}
              title={`${open ? 'Collapse' : 'Expand'} ${group.year}`}
              onClick={() => toggleYear(group.year)}
            >
              <span className="year-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
              {group.year}
            </button>
            {open && (
              <ul className="months">
                {group.months.map((month) => {
                  const key = `${group.year}-${month}`
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        className={`month${selected === key ? ' selected' : ''}`}
                        onClick={() => onSelect(selected === key ? null : key)}
                      >
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
