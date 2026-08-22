import { addDays, monthStart, addMonths, monthLabel, shortDate } from '../lib/dates'
import { DAY_NAMES, LEGEND, categoryStyle, categoryDot, dayName } from '../lib/events'
import { cardEdge, cardHeader } from '../lib/controlStyles'

// The month grid.
//
// The same month drawn two ways, and which one you get is decided by the width
// of the screen rather than by a setting.
//
// On a laptop a cell holds the names, which is what a month view is for. On a
// phone seven columns leave about fifty pixels each, which is not enough for a
// word, and the old screen proved it: a twelve night Westlife run drew as
// twelve chips all reading "W...". So on a phone a cell holds the date and a
// coloured dot for each event, you tap a day, and it opens underneath in full.
// Nothing is ever cut off, because nothing is asked to fit.
//
// Both are in the markup at once and one is hidden, rather than measuring the
// window in JavaScript. A media query cannot be got wrong on a resize, and
// there is no moment on load where the wrong one is showing.
export default function EventMonth({
    viewMonth,
    setViewMonth,
    today,
    byDate,
    selected,
    onSelect,
    onOpenEvent,
}) {
    // Six weeks always, so the grid does not change height as you move between
    // months. It starts on the Sunday before the first, so the columns line up.
    const gridStart = addDays(viewMonth, -new Date(viewMonth + 'T00:00:00').getDay())
    const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

    const selectedEvents = byDate[selected] || []

    function cellTone(date, inMonth) {
        if (!inMonth) return 'bg-gray-50'
        return date < today ? 'bg-gray-50/50' : 'bg-white'
    }

    function dateNumber(date, inMonth) {
        const d = new Date(date + 'T00:00:00')
        if (date === today) {
            return (
                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-accent text-white text-xs font-bold">
                    {d.getDate()}
                </span>
            )
        }
        return (
            <span className={`text-xs ${
                !inMonth ? 'text-gray-300' : date < today ? 'text-gray-400' : 'text-gray-600'
            }`}>
                {d.getDate()}
                {d.getDate() === 1 && (
                    <span className="ml-1 font-semibold">
                        {d.toLocaleDateString('en-IE', { month: 'short' })}
                    </span>
                )}
            </span>
        )
    }

    return (
        <div className={`${cardEdge} bg-white overflow-hidden`}>
            <div className={`${cardHeader} flex items-center justify-between gap-3`}>
                <span>{monthLabel(viewMonth)}</span>
                <span className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => setViewMonth(addMonths(viewMonth, -1))}
                        className="px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 transition-colors"
                        aria-label="Previous month"
                    >
                        ‹
                    </button>
                    {viewMonth !== monthStart(today) && (
                        <button
                            type="button"
                            onClick={() => setViewMonth(monthStart(today))}
                            className="px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 transition-colors normal-case tracking-normal"
                        >
                            Today
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                        className="px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 transition-colors"
                        aria-label="Next month"
                    >
                        ›
                    </button>
                </span>
            </div>

            <div className="grid grid-cols-7 border-b border-border bg-gray-50">
                {DAY_NAMES.map(d => (
                    <div key={d} className="px-1 py-2 text-center text-[10px] sm:text-xs font-bold text-muted uppercase tracking-wider">
                        {d}
                    </div>
                ))}
            </div>

            {/* The phone grid: a date and its dots, nothing that can be cut off. */}
            <div className="grid grid-cols-7 sm:hidden">
                {days.map(date => {
                    const events = byDate[date] || []
                    const inMonth = date.slice(0, 7) === viewMonth.slice(0, 7)
                    return (
                        <button
                            key={date}
                            type="button"
                            onClick={() => onSelect(date)}
                            aria-pressed={date === selected}
                            className={`aspect-square border-b border-r border-border [&:nth-child(7n)]:border-r-0 flex flex-col items-center justify-center gap-1 transition-colors ${
                                date === selected ? 'bg-accent-light ring-2 ring-accent ring-inset' : cellTone(date, inMonth)
                            }`}
                        >
                            {dateNumber(date, inMonth)}
                            {/* Four is all that fits across a cell, and no day
                                at this venue has ever had more than two. */}
                            <span className="flex gap-0.5 h-1.5">
                                {events.slice(0, 4).map(e => (
                                    <span key={e.id} className={`w-1.5 h-1.5 rounded-full ${categoryDot(e.category)} ${inMonth ? '' : 'opacity-40'}`} />
                                ))}
                            </span>
                        </button>
                    )
                })}
            </div>

            {/* The laptop grid: room for the names, so it shows them. */}
            <div className="hidden sm:grid grid-cols-7">
                {days.map(date => {
                    const events = byDate[date] || []
                    const inMonth = date.slice(0, 7) === viewMonth.slice(0, 7)
                    const faded = date < today || !inMonth
                    return (
                        <div
                            key={date}
                            className={`min-h-24 border-b border-r border-border [&:nth-child(7n)]:border-r-0 p-1.5 ${cellTone(date, inMonth)}`}
                        >
                            <div className="mb-1">{dateNumber(date, inMonth)}</div>
                            <div className="space-y-1">
                                {events.map(e => (
                                    <button
                                        key={e.id}
                                        type="button"
                                        onClick={() => onOpenEvent(e)}
                                        className={`w-full text-left text-xs px-1.5 py-1 rounded border leading-tight transition-shadow hover:shadow-sm ${categoryStyle(e.category)} ${faded ? 'opacity-50' : ''}`}
                                    >
                                        <span className="block truncate font-medium">{e.name}</span>
                                        {e.event_time && (
                                            <span className="block opacity-70">{e.event_time.slice(0, 5)}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* The day you tapped, on a phone only. On a laptop the names are
                already in the cell and clicking one opens it. */}
            <div className="sm:hidden border-t border-border p-4">
                <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">
                    {dayName(selected)} {shortDate(selected)}
                </p>
                {selectedEvents.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Nothing on. An ordinary night.</p>
                ) : (
                    <div className="divide-y divide-border">
                        {selectedEvents.map(e => (
                            <button
                                key={e.id}
                                type="button"
                                onClick={() => onOpenEvent(e)}
                                className="w-full text-left flex gap-3 py-2 first:pt-0 last:pb-0"
                            >
                                <span className={`w-1 rounded-full flex-shrink-0 ${categoryDot(e.category)}`} />
                                <span>
                                    <span className="block text-sm font-medium text-gray-900">{e.name}</span>
                                    <span className="block text-xs text-muted">
                                        {e.event_time ? `Doors ${e.event_time.slice(0, 5)}` : 'Time not given'}
                                        {e.category && ` · ${e.category}`}
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Only on a phone, where the colour is the only thing saying what
                kind of night it is. On a laptop the chip carries the name. */}
            <div className="sm:hidden flex flex-wrap gap-x-3 gap-y-1.5 border-t border-border px-4 py-2.5">
                {LEGEND.map(c => (
                    <span key={c} className="flex items-center gap-1.5 text-[11px] text-gray-600">
                        <span className={`w-2 h-2 rounded-full ${categoryDot(c)}`} />
                        {c === 'Arts & Theatre' ? 'Arts' : c === 'Miscellaneous' ? 'Other' : c}
                    </span>
                ))}
            </div>
        </div>
    )
}
