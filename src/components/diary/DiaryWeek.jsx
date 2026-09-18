import { weekDates, shortDate } from '@/lib/dates'
import { DAY_NAMES } from '@/lib/events'
import { bandsForWeek, kindChip } from '@/lib/diary'
import DiaryChip from './DiaryChip'

// One week, which is the shape anybody rostering is actually working in.
//
// Seven columns on a laptop and seven rows on a phone. Turning it rather than
// scrolling it sideways, for the same reason the Also on grid does: a phone has
// plenty of the one direction and none of the other, and a name that has
// scrolled off the left is a time you cannot place.

export default function DiaryWeek({ weekStart, today, byDate, onOpen, onAdd }) {
    const dates = weekDates(weekStart)
    const bands = bandsForWeek(
        [...new Map(dates.flatMap(d => (byDate[d] || [])
            .filter(i => i.source === 'diary')
            .map(i => [i.entry.id, i.entry]))).values()],
        dates,
    )
    const inABand = new Set(bands.map(b => b.entry.id))
    const rest = date => (byDate[date] || [])
        .filter(i => i.source !== 'diary' || !inABand.has(i.entry.id))

    return (
        <div>
            {/* What runs across the week, above everything, once. */}
            {bands.length > 0 && (
                <div className="hidden sm:block border-b border-border p-1">
                    {bands.map(({ entry, start, span, runsIn, runsOn }) => (
                        <div key={entry.id} className="grid grid-cols-7 py-0.5">
                            {start > 0 && <div style={{ gridColumn: `span ${start}` }} />}
                            <div style={{ gridColumn: `span ${span}` }} className="px-0.5">
                                <button
                                    type="button"
                                    onClick={() => onOpen(entry)}
                                    className={`block w-full text-left truncate rounded-md border-l-[3px] px-2 py-1 text-xs font-bold ${kindChip(entry.kind)}`}
                                >
                                    {runsIn && '‹ '}{entry.title}{runsOn && ' ›'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-7">
                {dates.map((date, i) => (
                    <div
                        key={date}
                        className={`border-b sm:border-b-0 sm:border-r border-border last:border-r-0 last:border-b-0 ${date === today ? 'bg-accent-light/40' : 'bg-white'}`}
                    >
                        <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-gray-50 sm:bg-transparent border-b border-border">
                            <span className={`text-xs font-bold ${date === today ? 'text-accent-ink' : 'text-gray-700'}`}>
                                {DAY_NAMES[i]} {shortDate(date)}
                            </span>
                            <button
                                type="button"
                                onClick={() => onAdd(date)}
                                aria-label={`Add something on ${date}`}
                                className="text-muted hover:text-accent-ink text-base leading-none px-1"
                            >
                                +
                            </button>
                        </div>

                        <div className="flex flex-col gap-1 p-1.5 sm:min-h-[8rem]">
                            {/* On a phone the band is repeated into each day it
                                covers, because there are no columns to run
                                across. It is the same entry and it says so by
                                being the same chip. */}
                            <span className="sm:hidden contents">
                                {bands.filter(b => dates.indexOf(date) >= b.start
                                    && dates.indexOf(date) < b.start + b.span)
                                    .map(b => (
                                        <button
                                            key={b.entry.id}
                                            type="button"
                                            onClick={() => onOpen(b.entry)}
                                            className={`block w-full text-left truncate rounded-md border-l-[3px] px-1.5 py-1 text-xs font-bold ${kindChip(b.entry.kind)}`}
                                        >
                                            {b.entry.title}
                                        </button>
                                    ))}
                            </span>

                            {rest(date).map(item => (
                                <DiaryChip key={item.key} item={item} onOpen={onOpen} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
