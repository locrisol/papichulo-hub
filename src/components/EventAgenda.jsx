import { DAY_NAMES, categoryDot, groupByWeek, weekTitle, statusNote } from '../lib/events'
import { cardEdge, cardHeader } from '../lib/controlStyles'

// What is coming up, as a list of the days that have something on.
//
// The days with nothing are not drawn at all. A month grid is five screens of
// mostly empty boxes on a phone, and this is the same information in about one.
// That is not a replacement for the calendar, it is the other half of it: the
// calendar is for the shape of a month, this is for what is actually happening.
//
// Broken into weeks, Sunday to Saturday, the same weeks the sales and cost
// screens use. This week and next week are named rather than dated because
// those are the two being rostered.
//
// The week band is the app's own grey, the one that already means "not part of
// the reconciliation" on the weekly sales grid. A boundary marker rather than a
// heading, so it separates without shouting over the events under it.
export default function EventAgenda({ events, today, onOpenEvent, footnote }) {
    const weeks = groupByWeek(events)

    return (
        <div className={`${cardEdge} bg-white overflow-hidden`}>
            <div className={cardHeader}>Coming up</div>

            {weeks.length === 0 ? (
                <p className="p-5 text-sm text-gray-400 italic">Nothing scheduled yet.</p>
            ) : (
                weeks.map(week => {
                    // The days inside the week, each with its own events.
                    const days = []
                    for (const e of week.events) {
                        const last = days[days.length - 1]
                        if (last && last.date === e.event_date) last.events.push(e)
                        else days.push({ date: e.event_date, events: [e] })
                    }

                    return (
                        <div key={week.weekStart}>
                            <p className="bg-gray-100 border-y border-border px-4 py-1.5 text-[11px] font-bold text-gray-600 uppercase tracking-wider">
                                {weekTitle(week.weekStart, today)}
                            </p>

                            {days.map(day => {
                                const d = new Date(day.date + 'T00:00:00')
                                return (
                                    <div key={day.date} className="flex gap-3 px-4 py-3 border-b border-border last:border-b-0">
                                        {/* The date in its own column, so the eye
                                            runs down one edge instead of hunting
                                            for it at the start of a sentence. */}
                                        <div className="w-10 flex-shrink-0 text-center">
                                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider">
                                                {DAY_NAMES[d.getDay()]}
                                            </p>
                                            <p className={`font-serif text-xl font-bold leading-none ${
                                                day.date === today ? 'text-accent' : 'text-gray-900'
                                            }`}>
                                                {d.getDate()}
                                            </p>
                                        </div>

                                        <div className="flex-1 min-w-0 space-y-2">
                                            {day.events.map(e => {
                                                const note = statusNote(e.status)
                                                return (
                                                    <button
                                                        key={e.id}
                                                        type="button"
                                                        onClick={() => onOpenEvent(e)}
                                                        className="w-full text-left flex gap-2.5"
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
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )
                })
            )}

            <p className="text-xs text-gray-400 px-4 py-4 border-t border-border">{footnote}</p>
        </div>
    )
}
