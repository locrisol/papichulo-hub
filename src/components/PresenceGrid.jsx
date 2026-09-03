import { DAY_NAMES } from '../lib/events'
import { NO_COLOUR } from '../lib/team'
import { barFor } from '../lib/presence'

// The week on a phone.
//
// A row per person and seven cells, and every cell is a small bar showing which
// part of the day that person covers. The left of a cell is the morning and the
// right is the evening, so a half filled cell on the left is somebody who
// finishes at three, which is the person you want when you are trying to give
// away an evening.
//
// It is deliberately a picture rather than a timetable. There is no room for
// times at this width and there is no need for them either: the exact hours are
// one tap away, and the thing you are scanning for is a shape.
//
// The letters across the top are the days. One letter each, because the cells
// are about thirty pixels wide and a cell is not allowed to be as wide as the
// word Wednesday.
export default function PresenceGrid({
    dates, rows, span, colourOf, meId, today, isAway, isClosed, selected, onSelect,
}) {
    const away =
        'repeating-linear-gradient(45deg, rgba(100,116,139,0.16) 0, rgba(100,116,139,0.16) 3px, transparent 3px, transparent 7px)'

    const columns = 'grid grid-cols-[minmax(0,4.5rem)_repeat(7,minmax(0,1fr))] gap-x-0.5'

    return (
        <div>
            <div className={`${columns} mb-1`}>
                <span />
                {dates.map((d, i) => (
                    <span
                        key={d}
                        className={`text-center text-[0.625rem] font-bold leading-tight ${
                            d === today ? 'text-accent-ink' : 'text-muted'
                        }`}
                    >
                        <span className="block">{DAY_NAMES[i].slice(0, 1)}</span>
                        <span className="block font-normal opacity-70">{Number(d.slice(8))}</span>
                    </span>
                ))}
            </div>

            <div className="space-y-0.5">
                {rows.map(row => {
                    const colour = colourOf(row.employee.id) || NO_COLOUR
                    const isMe = row.employee.id === meId
                    // First names only. The column is about ninety pixels wide
                    // and a surname pushes the grid off the screen, so the full
                    // name lives in the panel underneath where there is room
                    // for it.
                    const first = String(row.employee.full_name || '').split(' ')[0]

                    return (
                        <div
                            key={row.employee.id}
                            className={`${columns} items-center rounded ${isMe ? 'bg-accent-light/50' : ''}`}
                        >
                            <span className={`truncate text-[0.6875rem] leading-tight pl-1 pr-0.5 ${
                                isMe ? 'font-bold text-accent-ink' : 'font-medium text-gray-800'
                            }`}>
                                {first}
                            </span>

                            {row.days.map(day => {
                                const shut = isClosed?.(day.date)
                                const off = isAway?.(row.employee.id, day.date)
                                const picked = selected
                                    && selected.employeeId === row.employee.id
                                    && selected.date === day.date

                                return (
                                    <button
                                        key={day.date}
                                        type="button"
                                        onClick={() => onSelect?.(row.employee.id, day.date)}
                                        aria-label={`${row.employee.full_name}, ${day.date}`}
                                        aria-pressed={!!picked}
                                        style={off && !shut ? { backgroundImage: away } : undefined}
                                        className={`relative h-9 rounded-sm border transition-colors ${
                                            picked
                                                ? 'border-accent ring-2 ring-accent'
                                                : shut
                                                    ? 'border-red-200 bg-red-50'
                                                    : day.date === today
                                                        ? 'border-accent/40 bg-accent-light/40'
                                                        : 'border-gray-200 bg-gray-50'
                                        }`}
                                    >
                                        {day.shifts.map(s => {
                                            const bar = barFor(s, span)
                                            if (!bar) return null
                                            return (
                                                <span
                                                    key={s.id}
                                                    className="absolute top-1 bottom-1 rounded-sm"
                                                    style={{
                                                        left: `${bar.left}%`,
                                                        width: `${bar.width}%`,
                                                        backgroundColor: colour,
                                                    }}
                                                />
                                            )
                                        })}
                                    </button>
                                )
                            })}
                        </div>
                    )
                })}
            </div>

            {/* Said once, at the bottom, because a grid of coloured bars is not
                self explanatory the first time somebody opens it and is
                obvious every time after. */}
            <p className="text-[0.625rem] text-muted mt-2 leading-snug">
                Each bar is the part of the day somebody is in. Left is the morning, right is the
                evening. Tap any square for the times.
            </p>
        </div>
    )
}
