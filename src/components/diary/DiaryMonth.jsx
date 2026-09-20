import { addDays, fullDate, dayMonth } from '@/lib/dates'
import { DAY_NAMES, dayName } from '@/lib/events'
import { bankHolidayOn, BANK_HOLIDAY_INK, BANK_HOLIDAY_WASH } from '@/lib/bankHolidays'
import { card, closeButton } from '@/lib/controlStyles'
import { bandsForWeek, kindChip, kindDot, kindRing, scopeLabel, timeLabel } from '@/lib/diary'
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

// A day opened out, under the week it is in.
//
// On a phone this is the only way to read a day at all, since a cell there
// holds coloured dots and nothing else. On a computer it is what makes "+2
// more" honest: that button said there was something and then had nowhere to
// show it, which is a button that lies.
//
// It hides itself on a computer when the day is empty, because a permanent
// "Nothing on" sitting inside every month is noise. On a phone it stays, since
// there it is the answer to a tap and an empty answer is still an answer.
//
// **It is a card with a point on it, not a grey band across the month**, and
// the difference is what he objected to. Drawn as a band it read as a gap in
// the grid: nothing tied it to the square that was pressed, the bands of the
// week below appeared to belong to it, and there was no way out of it except
// pressing the same day again, which nobody would guess.
//
// So it wears the heading every other card in this app wears, a filled dark
// row with the day on it and a way to shut it, and a notch above it sits under
// the column it belongs to. The notch is the whole point: it is the only thing
// that says which of the seven squares this is about.
//
// Still under its own row rather than in a dialog. A dialog would cover the
// month you are reading and move the square out from under the press, and this
// was already moved once, from the foot of the month, for being too far from
// what you pressed.
function DayPanel({ date, column, items, restaurants, onOpen, onClose, canEdit }) {
    return (
        <div className={`border-b border-border bg-app-bg px-2 sm:px-3 pt-2 pb-3 ${items.length ? 'block' : 'block sm:hidden'}`}>
            <div className="relative">
                {/* Under the middle of its own column, so seven identical
                    squares stop being interchangeable. Hidden on a phone,
                    where a column is too narrow to point at anything. */}
                <span
                    aria-hidden="true"
                    className="hidden sm:block absolute -top-1.5 w-3 h-3 rotate-45 bg-sidebar"
                    style={{ left: `calc(${(column + 0.5) * (100 / 7)}% - 0.375rem)` }}
                />
                <div className={`${card} overflow-hidden`}>
                    <div className="flex items-center justify-between gap-3 bg-sidebar px-3 py-2">
                        <p className="text-sm font-bold text-white">
                            {dayName(date)} {dayMonth(date)}
                        </p>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={`Close ${fullDate(date)}`}
                            className={closeButton}
                        >
                            &#215;
                        </button>
                    </div>

                    {items.length === 0 ? (
                        <p className="text-sm text-muted italic px-3 py-2.5">Nothing on.</p>
                    ) : (
                        <div className="flex flex-col gap-1.5 px-3 py-2.5">
                            {items.map(item => (
                                <div key={item.key} className="flex flex-wrap items-baseline gap-x-2">
                                    {/* Sized to something a person reads rather
                                        than to the width of the month. A chip
                                        stretched across a wide screen reads as
                                        an empty row with a word at one end. */}
                                    <span className="min-w-0 w-full sm:w-auto sm:min-w-[16rem] sm:max-w-md">
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

                const holdsSelected = week.includes(selected)

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

                                // The calendar is the one screen where a bank
                                // holiday is the whole point of looking, and it
                                // was the one screen that did not know. Worked
                                // out from the date, so every month back and
                                // forward has them without anybody typing one.
                                const holiday = bankHolidayOn(date)

                                return (
                                    <div
                                        key={date}
                                        className={`relative border-r border-b border-border last:border-r-0 min-h-[3rem] sm:min-h-[6rem] ${dim ? 'bg-gray-50' : 'bg-white'} ${selected === date ? 'ring-2 ring-inset ring-accent' : ''}`}
                                        style={holiday && !dim ? { backgroundColor: BANK_HOLIDAY_WASH } : undefined}
                                    >
                                        {/* The whole square opens the day, not
                                            just the number in the corner of it.
                                            A button laid under the contents
                                            rather than wrapped around them,
                                            because the chips are buttons of
                                            their own and a button inside a
                                            button is not a thing. */}
                                        <button
                                            type="button"
                                            onClick={() => onSelect(date)}
                                            aria-label={fullDate(date)}
                                            aria-pressed={selected === date}
                                            className="absolute inset-0 w-full h-full"
                                        />
                                        <div className="relative pointer-events-none px-1 pt-1">
                                            {dayNumber(date)}
                                            {/* Named, not just tinted. A wash
                                                on its own is one more colour to
                                                learn; the words are the whole
                                                point of a calendar. */}
                                            {holiday && (
                                                <span
                                                    className="ml-1 text-[0.6rem] font-bold"
                                                    style={{ color: BANK_HOLIDAY_INK }}
                                                >
                                                    {holiday.short}
                                                </span>
                                            )}

                                            {/* A phone: a dot each, because
                                                fifty pixels cannot hold a word
                                                and a row of "W..." says
                                                nothing.

                                                Hollow for anything nobody has
                                                checked. It is the only thing
                                                this screen can say about that,
                                                and without it a listing waiting
                                                on somebody looks exactly like
                                                one they settled last week. */}
                                            <span className="sm:hidden flex flex-wrap gap-0.5 mt-1 min-h-[0.6rem]">
                                                {items.slice(0, 6).map(item => (
                                                    <span
                                                        key={item.key}
                                                        className={`w-1.5 h-1.5 rounded-full ${
                                                            item.checked === false
                                                                ? kindRing(item.kind)
                                                                : kindDot(item.kind)
                                                        }`}
                                                    />
                                                ))}
                                            </span>
                                        </div>

                                        <div className="relative hidden sm:flex flex-col gap-0.5 px-1 pb-1">
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

                        {/* The day opens under its own row rather than at the
                            foot of the month. At the bottom it was six weeks
                            away from the square you clicked, which is why he
                            could barely see it: you press a cell in the second
                            week and the answer appears below the sixth. */}
                        {holdsSelected && (
                            <DayPanel
                                date={selected}
                                column={week.indexOf(selected)}
                                items={onSelectedDay}
                                restaurants={restaurants}
                                onOpen={onOpen}
                                onClose={() => onSelect(selected)}
                                canEdit={canEdit}
                            />
                        )}
                    </div>
                )
            })}

        </div>
    )
}
