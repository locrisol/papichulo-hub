import { addDays, weekDates, shortDate, dayMonth, weekStartOf } from '../lib/dates'
import { DAY_NAMES, categoryDot, statusNote } from '../lib/events'
import { cardEdge, cardHeader } from '../lib/controlStyles'

// A week at a time.
//
// Seven days across the top with a dot under the ones that have something on,
// and the whole week written out underneath with the names, the doors times and
// the quiet nights included.
//
// This is what a phone opens on, because a week is the thing you roster. A
// month is the right shape for planning at a desk and the wrong shape for
// standing in the restaurant on a Tuesday wondering about Thursday.
//
// The quiet nights are listed rather than skipped. On this screen an empty
// Wednesday is information: it is the night nobody is coming in for a concert.
export default function EventWeek({ weekStart, setWeekStart, today, byDate, onOpenEvent }) {
    const days = weekDates(weekStart)
    const thisWeek = weekStartOf(today)

    return (
        <div className={`${cardEdge} bg-white overflow-hidden`}>
            <div className={`${cardHeader} flex items-center justify-between gap-3`}>
                <span className="truncate">
                    {weekStart === thisWeek ? 'This week'
                        : weekStart === addDays(thisWeek, 7) ? 'Next week'
                            : `Week of ${dayMonth(weekStart)}`}
                </span>
                <span className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => setWeekStart(addDays(weekStart, -7))}
                        className="px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 transition-colors"
                        aria-label="Previous week"
                    >
                        ‹
                    </button>
                    {weekStart !== thisWeek && (
                        <button
                            type="button"
                            onClick={() => setWeekStart(thisWeek)}
                            className="px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 transition-colors normal-case tracking-normal"
                        >
                            Today
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setWeekStart(addDays(weekStart, 7))}
                        className="px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 transition-colors"
                        aria-label="Next week"
                    >
                        ›
                    </button>
                </span>
            </div>

            {/* The strip is a map of the week, not a control that hides things.
                Tapping a day scrolls it into view rather than filtering the list
                down to it, because seven days fit on one screen and hiding six
                of them to see one would be a step backwards. */}
            <div className="grid grid-cols-7 border-b border-border">
                {days.map(date => {
                    const events = byDate[date] || []
                    const d = new Date(date + 'T00:00:00')
                    return (
                        <a
                            key={date}
                            href={`#day-${date}`}
                            className={`flex flex-col items-center gap-1 py-2 border-r border-border last:border-r-0 transition-colors ${
                                date === today ? 'bg-accent-light' : 'hover:bg-gray-50'
                            }`}
                        >
                            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                                {DAY_NAMES[d.getDay()]}
                            </span>
                            {date === today ? (
                                <span className="inline-flex items-center justify-center min-w-6 h-6 px-1 rounded-full bg-accent text-white text-sm font-bold">
                                    {d.getDate()}
                                </span>
                            ) : (
                                <span className={`text-sm h-6 flex items-center ${date < today ? 'text-gray-400' : 'text-gray-800'}`}>
                                    {d.getDate()}
                                </span>
                            )}
                            <span className="h-1.5 flex gap-0.5">
                                {events.slice(0, 3).map(e => (
                                    <span key={e.id} className={`w-1.5 h-1.5 rounded-full ${categoryDot(e.category)}`} />
                                ))}
                            </span>
                        </a>
                    )
                })}
            </div>

            <div className="p-4">
                {days.map(date => {
                    const events = byDate[date] || []
                    const d = new Date(date + 'T00:00:00')
                    return (
                        <div key={date} id={`day-${date}`} className="scroll-mt-4 py-2 first:pt-0">
                            <div className={`flex items-baseline gap-2 pb-1.5 border-b ${
                                date === today ? 'border-accent' : 'border-border'
                            }`}>
                                <span className={`text-sm font-bold ${
                                    events.length === 0 ? 'text-gray-400'
                                        : date === today ? 'text-accent' : 'text-gray-900'
                                }`}>
                                    {DAY_NAMES[d.getDay()]}
                                </span>
                                <span className="text-xs text-muted">{shortDate(date)}</span>
                                {date === today && (
                                    <span className="text-[10px] font-bold text-accent uppercase tracking-wider">Today</span>
                                )}
                            </div>

                            {events.length === 0 ? (
                                <p className="text-xs text-gray-400 italic py-2">Nothing on</p>
                            ) : (
                                events.map(e => {
                                    const note = statusNote(e.status)
                                    return (
                                        <button
                                            key={e.id}
                                            type="button"
                                            onClick={() => onOpenEvent(e)}
                                            className="w-full text-left flex gap-3 py-2 hover:bg-gray-50 transition-colors rounded-lg"
                                        >
                                            <span className={`w-1 rounded-full flex-shrink-0 ${categoryDot(e.category)}`} />
                                            <span className="min-w-0">
                                                <span className="block text-sm font-medium text-gray-900">{e.name}</span>
                                                <span className="block text-xs text-muted">
                                                    {e.event_time ? `Doors ${e.event_time.slice(0, 5)}` : 'Time not given'}
                                                    {e.category && ` · ${e.category}`}
                                                </span>
                                                {note && (
                                                    <span className={`block text-xs mt-0.5 ${note.tone === 'bad' ? 'text-red-700' : 'text-amber-700'}`}>
                                                        {note.text}
                                                    </span>
                                                )}
                                            </span>
                                        </button>
                                    )
                                })
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
