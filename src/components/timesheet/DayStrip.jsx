import { dayName, dayNumber, fullDayLabel } from '@/lib/dates'

// The seven days of the week as a strip, the day's name over its date, all
// seven in one row even on a phone. The Day view picks one with it; All days
// jumps down to one. It said only "11 Oct", and which day of the week that
// was is the first thing anybody asks of a timesheet.
export default function DayStrip({ dates, picked = null, onPick }) {
    return (
        <div className="grid grid-cols-7 gap-1 sm:max-w-xl">
            {dates.map(date => {
                const on = picked === date
                return (
                    <button
                        key={date}
                        type="button"
                        onClick={() => onPick(date)}
                        aria-label={fullDayLabel(date)}
                        aria-pressed={picked == null ? undefined : on}
                        className={`py-1.5 rounded-lg border text-center leading-tight transition-colors ${on
                            ? 'bg-accent-light border-accent text-accent-ink'
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    >
                        <span className="block text-[0.65rem] font-semibold uppercase tracking-wide">{dayName(date)}</span>
                        <span className="block text-sm font-bold tabular-nums">{dayNumber(date)}</span>
                    </button>
                )
            })}
        </div>
    )
}
