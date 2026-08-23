import { DAY_NAMES, categoryDot, agendaRows, statusNote } from '../lib/events'
import { cardEdge, cardHeader } from '../lib/controlStyles'

// What is coming up, as a list of the days that have something on.
//
// The days with nothing are not drawn at all. A month grid is five screens of
// mostly empty boxes on a phone, and this is the same information in about one.
// That is not a replacement for the calendar, it is the other half of it: the
// calendar is for the shape of a month, this is for what is actually happening.
//
// Three levels, and each one looks different enough to read at a glance:
//
//   Coming up   the card's own bar, dark green like every other card
//   September   a warm band with the month written out
//   This week   a narrow grey band, the same grey that means "not part of the
//               reconciliation" on the weekly sales grid, so it separates
//               without shouting over the events under it
//
// The month is written out in full. It is a heading, not a table column, and
// "Sept" only saves four letters in a place where the month is the thing you
// are looking for.
export default function EventAgenda({ events, today, onOpenEvent, footnote }) {
    const rows = agendaRows(events, today)

    function eventLine(e) {
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
    }

    return (
        <div className={`${cardEdge} bg-white overflow-hidden`}>
            <div className={cardHeader}>Coming up</div>

            {rows.length === 0 ? (
                <p className="p-5 text-sm text-gray-400 italic">Nothing scheduled yet.</p>
            ) : (
                rows.map(row => {
                    if (row.type === 'month') {
                        return (
                            <p
                                key={row.key}
                                className="bg-accent-light border-y border-accent/40 px-4 py-2 font-serif text-base font-bold text-sidebar"
                            >
                                {row.label}
                            </p>
                        )
                    }

                    if (row.type === 'week') {
                        return (
                            <p
                                key={row.key}
                                className="bg-gray-100 border-b border-border px-4 py-1.5 text-[0.6875rem] font-bold text-gray-600 uppercase tracking-wider"
                            >
                                {row.label}
                            </p>
                        )
                    }

                    const d = new Date(row.date + 'T00:00:00')
                    return (
                        <div key={row.key} className="flex gap-3 px-4 py-3 border-b border-border">
                            {/* The date in its own column, so the eye runs down
                                one edge instead of hunting for it at the start
                                of a sentence. Only the day number, since the
                                month band above it says the rest. */}
                            <div className="w-10 flex-shrink-0 text-center">
                                <p className="text-[0.625rem] font-bold text-muted uppercase tracking-wider">
                                    {DAY_NAMES[d.getDay()]}
                                </p>
                                <p className={`font-serif text-xl font-bold leading-none ${
                                    row.date === today ? 'text-accent' : 'text-gray-900'
                                }`}>
                                    {d.getDate()}
                                </p>
                            </div>

                            <div className="flex-1 min-w-0 space-y-2">
                                {row.events.map(eventLine)}
                            </div>
                        </div>
                    )
                })
            )}

            <p className="text-xs text-gray-400 px-4 py-4">{footnote}</p>
        </div>
    )
}
