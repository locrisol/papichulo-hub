import { addDays } from '@/lib/dates'
import { DAY_NAMES } from '@/lib/events'
import { bandsForWeek, kindChip, kindDot, scopeLabel, timeLabel } from '@/lib/diary'
import DiaryChip from './DiaryChip'

// The month, as six weeks that do not change height as you step through them.
//
// A promotion running five days is one band across those five rather than the
// same chip printed five times. Five chips read as five things, and a week long
// offer is one thing: that is the whole reason ends_on exists rather than
// somebody entering a row a day.
//
// On a phone a cell is about fifty pixels and cannot hold a word, so it holds
// the date and a dot for each thing, and tapping the day opens it underneath in
// full. Both are in the markup at once with one hidden, the same way the events
// month does it: a media query cannot be got wrong on a resize, and there is no
// moment on load where the wrong one is showing.

// Three on a laptop before it says how many more. A cell that grows to fit
// everything makes the whole row grow, and one busy Friday should not make
// every week in the month taller.
const ROOM_FOR = 3

function BandRow({ bands, onOpen, canEdit }) {
    if (!bands.length) return null

    return (
        <div className="border-b border-border bg-white">
            {bands.map(({ entry, start, span, runsIn, runsOn }) => (
                <div key={entry.id} className="grid grid-cols-7 py-0.5">
                    {start > 0 && <div style={{ gridColumn: `span ${start}` }} />}
                    <div style={{ gridColumn: `span ${span}` }} className="px-0.5">
                        {(() => {
                            const look = `block w-full text-left truncate rounded-md border-l-[3px] px-1.5 py-0.5 text-[0.6875rem] font-bold ${kindChip(entry.kind)} ${runsIn ? 'rounded-l-none' : ''} ${runsOn ? 'rounded-r-none' : ''}`
                            const inside = <>{runsIn && '‹ '}{entry.title}{runsOn && ' ›'}</>
                            return canEdit
                                ? <button type="button" onClick={() => onOpen(entry)} className={look}>{inside}</button>
                                : <span className={look}>{inside}</span>
                        })()}
                    </div>
                </div>
            ))}
        </div>
    )
}

export default function DiaryMonth({
    viewMonth, today, byDate, selected, onSelect, onOpen, canEdit, restaurants,
}) {
    // Starts on the Sunday before the first, so the columns line up with the
    // day names above them.
    const gridStart = addDays(viewMonth, -new Date(`${viewMonth}T00:00:00`).getDay())
    const weeks = Array.from({ length: 6 }, (_, w) =>
        Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)))

    const month = viewMonth.slice(0, 7)
    const onSelectedDay = byDate[selected] || []

    function dayNumber(date) {
        const number = new Date(`${date}T00:00:00`).getDate()
        if (date === today) {
            return (
                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-accent text-white text-xs font-bold">
                    {number}
                </span>
            )
        }
        const tone = date.slice(0, 7) === month ? 'text-gray-700' : 'text-muted'
        return <span className={`text-xs font-bold ${tone}`}>{number}</span>
    }

    return (
        <div>
            <div className="grid grid-cols-7 bg-sidebar rounded-t-xl overflow-hidden">
                {DAY_NAMES.map(name => (
                    <div key={name} className="px-2 py-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-white">
                        <span className="hidden sm:inline">{name}</span>
                        <span className="sm:hidden">{name.slice(0, 1)}</span>
                    </div>
                ))}
            </div>

            {weeks.map(week => {
                const bands = bandsForWeek(
                    // A band is drawn from the entry, so only the diary items
                    // carry one. The Arena and the deliveries are single days
                    // by their nature.
                    [...new Map(week.flatMap(d => (byDate[d] || [])
                        .filter(i => i.source === 'diary')
                        .map(i => [i.entry.id, i.entry]))).values()],
                    week,
                )

                return (
                    <div key={week[0]}>
                        <BandRow bands={bands} onOpen={onOpen} canEdit={canEdit} />

                        <div className="grid grid-cols-7">
                            {week.map(date => {
                                const all = byDate[date] || []
                                // What the band already said is not repeated in
                                // the cell underneath it.
                                const inABand = new Set(bands.map(b => b.entry.id))
                                const items = all.filter(
                                    i => i.source !== 'diary' || !inABand.has(i.entry.id),
                                )
                                const dim = date.slice(0, 7) !== month

                                return (
                                    <div
                                        key={date}
                                        className={`border-r border-b border-border last:border-r-0 min-h-[3rem] sm:min-h-[6rem] ${dim ? 'bg-gray-50' : 'bg-white'}`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => onSelect(date)}
                                            aria-label={date}
                                            aria-pressed={selected === date}
                                            className={`w-full text-left px-1 pt-1 ${selected === date ? 'ring-2 ring-inset ring-accent' : ''}`}
                                        >
                                            {dayNumber(date)}

                                            {/* A phone: a dot each, because
                                                fifty pixels cannot hold a word
                                                and a row of "W..." says
                                                nothing. */}
                                            <span className="sm:hidden flex flex-wrap gap-0.5 mt-1 min-h-[0.6rem]">
                                                {items.slice(0, 6).map(item => (
                                                    <span
                                                        key={item.key}
                                                        className={`w-1.5 h-1.5 rounded-full ${kindDot(item.kind)}`}
                                                    />
                                                ))}
                                            </span>
                                        </button>

                                        <div className="hidden sm:flex flex-col gap-0.5 px-1 pb-1">
                                            {items.slice(0, ROOM_FOR).map(item => (
                                                <DiaryChip key={item.key} item={item} onOpen={onOpen} canEdit={canEdit} compact />
                                            ))}
                                            {items.length > ROOM_FOR && (
                                                <button
                                                    type="button"
                                                    onClick={() => onSelect(date)}
                                                    className="text-[0.65rem] font-semibold text-muted text-left px-1 hover:text-gray-700"
                                                >
                                                    +{items.length - ROOM_FOR} more
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )
            })}

            {/* The day you tapped, in full, under the grid.
                On a phone this is the only way to read a day at all, since a
                cell there holds dots. On a computer it is what makes "+2 more"
                honest: that button said there was something and then had
                nowhere to show it, which is a button that lies.
                So it is here on both, and it only hides itself on a computer
                when the day is empty, where a permanent "Nothing on" under
                every month would be noise. */}
            <div className={`border-t border-border bg-white p-3 rounded-b-xl ${
                onSelectedDay.length ? 'block' : 'block sm:hidden'
            }`}>
                <p className="text-xs font-bold uppercase tracking-wider text-muted mb-2">
                    {new Date(`${selected}T00:00:00`).toDateString()}
                </p>
                {onSelectedDay.length === 0 ? (
                    <p className="text-sm text-muted italic">Nothing on.</p>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        {onSelectedDay.map(item => (
                            <div key={item.key} className="flex flex-wrap items-baseline gap-x-2">
                                <span className="flex-1 min-w-0">
                                    <DiaryChip item={item} onOpen={onOpen} canEdit={canEdit} />
                                </span>
                                {item.source === 'diary' && (
                                    <span className="text-[0.65rem] text-muted whitespace-nowrap">
                                        {timeLabel(item.entry)}
                                        {' \u00b7 '}
                                        {scopeLabel(item.entry, restaurants)}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
