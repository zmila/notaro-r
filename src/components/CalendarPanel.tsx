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
  return (
    <div className="calendar">
      {groups.map((group) => (
        <section className="year" key={group.year}>
          <div className="year-title">{group.year}</div>
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
        </section>
      ))}
    </div>
  )
}
