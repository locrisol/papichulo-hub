import { maskTime, settleTime, shortClock } from '@/lib/clock'
import { kindOf, cellColour } from '@/lib/timesheet'
import { kindLabel as absenceLabel, takesHours } from '@/lib/absences'
import { removeButton } from '@/lib/controlStyles'

// One person, one day.
//
// The boxes hold digits and nothing else. The colons are put in as you pass
// them and taken out again when you delete back through, which is what makes
// backspace behave: it never lands on a colon and never has to be pressed
// twice. `maskTime` does that; the box only has to call it.
//
// Every day takes times, rostered or not. The first version of this left a day
// nobody planned as a dead cell, and he caught it: somebody can work a day at
// short notice, and a grid that will not let you type that is a grid you keep a
// second list beside.
//
// **The rostered time shows, and can never be taken.** It sits behind the box
// as a placeholder so you can see who was meant to be in, and that is all it
// does. Enter used to fill it in and he stopped that: what somebody was
// rostered for is never what goes to the accountant, only what the clock said
// is, and a key that puts the plan in the box makes it easy to file the plan as
// the record. That is the exact confusion this screen exists to end.

const box = 'block w-full font-sans text-xs tabular-nums tracking-tight text-center '
    + 'border border-gray-300 rounded px-1 py-0.5 bg-white text-gray-900 '
    + 'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 '
    + 'placeholder:text-gray-300 disabled:bg-gray-50 disabled:text-gray-400'

export default function TimeCell({
    cell, at, canEdit = true, onType, onSettle, onState, onClear, onAdd, onOpen,
}) {
    const { entries, absence, rostered, unplanned } = cell

    // Holiday and off sick take the day: there are no times to hold. Training
    // and a trial are worked time and keep their boxes, which is the thing the
    // first design got wrong.
    if (absence) {
        // **The figure a holiday carries belongs to the whole holiday, not to
        // this day.** It used to be a box in the cell holding the run's total,
        // so a holiday of fifteen hours over three days showed 15 on each of
        // them and invited somebody to edit a run from one day of it. That is
        // the same confusion as the bug he found: a figure that looks like this
        // day's and is not.
        //
        // So the cell shows this day's share and nothing else, and the way to
        // change the run is to open the day, where the box can be labelled
        // properly and say what it is for. What Team put in stands until
        // somebody changes it there or here on purpose.
        const runs = takesHours(absence.kind)
        const share = cell.holidayHours

        return (
            <div className="flex items-start gap-1">
                <button
                    type="button"
                    onClick={onOpen}
                    disabled={!canEdit}
                    title={canEdit ? 'Open the day' : undefined}
                    className="text-left disabled:cursor-default"
                >
                    <span
                        className="inline-block text-[0.58rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-white whitespace-nowrap"
                        style={{ backgroundColor: cellColour({ absence }) }}
                    >
                        {absenceLabel(absence.kind)}
                    </span>
                    {runs && (
                        absence.hours == null
                            ? (
                                <span className="block text-[0.62rem] font-semibold text-accent-ink mt-0.5">
                                    no hours yet
                                </span>
                            )
                            : (
                                <span className="block text-[0.62rem] text-gray-500 tabular-nums mt-0.5">
                                    {share.toFixed(2)} this day
                                </span>
                            )
                    )}
                </button>
                {canEdit && (
                    <button
                        type="button"
                        onClick={onClear}
                        aria-label="Delete this time off"
                        className={`${removeButton} ml-auto`}
                    >
                        &times;
                    </button>
                )}
            </div>
        )
    }

    // An empty day still gets one pair, so it can be typed into.
    const spans = entries.length ? entries : [{ id: null, starts_at: '', ends_at: '' }]
    const full = entries.length > 0 && entries.every(e => e.starts_at && e.ends_at)

    return (
        <div>
            {spans.map((entry, i) => (
                <div key={entry.id || `new-${i}`} className="mb-0.5 last:mb-0">
                    <Box
                        entry={entry}
                        field="starts_at"
                        at={{ ...at, s: i, i: 0 }}
                        suggest={rostered[i]?.starts_at}
                        canEdit={canEdit}
                        onType={onType}
                        onSettle={onSettle}
                        onState={onState}
                    />
                    <Box
                        entry={entry}
                        field="ends_at"
                        at={{ ...at, s: i, i: 1 }}
                        suggest={rostered[i]?.ends_at}
                        canEdit={canEdit}
                        muted
                        onType={onType}
                        onSettle={onSettle}
                        onState={onState}
                    />
                </div>
            ))}

            <UnderLine cell={cell} unplanned={unplanned} canEdit={canEdit} onOpen={onOpen} />

            {/* A split shift is a second span, not a cell that holds two of
                everything. Offered only once the first one is finished, so it
                never sits there inviting a half filled row. */}
            {canEdit && full && (
                <button
                    type="button"
                    onClick={onAdd}
                    className="mt-0.5 text-[0.6rem] font-semibold text-accent-ink hover:underline"
                >
                    + another
                </button>
            )}
        </div>
    )
}

function Box({ entry, field, at, suggest, canEdit, muted, onType, onSettle, onState }) {
    return (
        <input
            type="text"
            inputMode="numeric"
            disabled={!canEdit}
            className={`${box} ${muted ? 'text-gray-500' : ''}`}
            value={entry[field] || ''}
            placeholder={shortClock(suggest) || ''}
            data-entry={entry.id || ''}
            data-field={field}
            data-r={at.r}
            data-d={at.d}
            data-s={at.s}
            data-i={at.i}
            aria-label={field === 'starts_at' ? 'Clock in' : 'Clock out'}
            onChange={e => {
                const typed = e.target.value.trim().toLowerCase()
                // A letter is a state for the whole day rather than a time.
                // Nothing that belongs in a clock has a letter in it.
                const letter = typed.slice(-1)
                if (/[a-z]/.test(letter)) {
                    onState(letter)
                    return
                }
                onType(entry, field, maskTime(e.target.value))
            }}
            onBlur={e => onSettle(entry, field, settleTime(e.target.value))}
        />
    )
}

// The small grey line. Two things on it, and only one of them is typed: the
// roster drawn in, which nobody writes, and the note, which is how he tells the
// accountant why a shift ran long or finished early.
//
// It is also the way in to writing one. Pressing it opens the day, because a
// cell with a text box in it stops being a grid.
function UnderLine({ cell, unplanned, canEdit, onOpen }) {
    const bits = []
    const first = cell.entries[0]

    if (first?.starts_at) {
        if (unplanned) bits.push('not rostered')
        else {
            const plan = cell.rostered[0]
            const differs = plan && (shortClock(plan.starts_at) !== shortClock(first.starts_at)
                || shortClock(plan.ends_at) !== shortClock(first.ends_at))
            if (differs) bits.push(`for ${shortClock(plan.starts_at)}–${shortClock(plan.ends_at)}`)
        }
    }

    // The comment is kept out of the line rather than joined onto the end of
    // it. Everything else under a cell is the app talking, and this is the one
    // thing on the screen he wrote himself, on its own line with a mark down
    // the side of it, which is also what stops a sentence reading as though it
    // were part of the rostered times in front of it.
    const note = cell.entries.map(e => e.note).filter(Boolean)[0]

    const kind = cell.entries.find(e => e.kind !== 'worked')
    if (kind) bits.unshift(kindOf(kind.kind).label)

    // Hours the till's report does not have, on a week it covered. Two ways
    // to get there and they want different words: a time off the report that
    // somebody moved, or a shift typed onto a day the report says nothing
    // about. Asked for on the cell as well as in the banner, because the
    // banner names a person and this says which day.
    if (cell.unexplained) {
        const moved = cell.entries.some(e => e.source === 'corrected')
        bits.push(moved ? 'changed, say why' : 'not on the report, say why')
    }

    // Nothing to say and nothing typed yet. A quiet way in rather than no way
    // in at all.
    //
    // Two different offers, because they answer two different questions. A day
    // with times on it can carry a note saying why a figure is what it is. A
    // day with a rostered shift and nothing on it is the one the report block
    // is waiting for, and **the reason is the other way of answering it**: the
    // block has always said "times or a reason" and there was no way to give
    // the second one unless it was a holiday or a sick day.
    if (!bits.length && !note) {
        const wanted = first?.starts_at || cell.unanswered
        if (!canEdit || !wanted) return null
        return (
            <button
                type="button"
                onClick={onOpen}
                className={`block text-[0.62rem] mt-0.5 hover:text-accent-ink ${
                    first?.starts_at ? 'text-gray-300' : 'text-accent-ink font-semibold'
                }`}
            >
                + comment
            </button>
        )
    }

    // It wraps rather than running on. A comment is as long as it needs to be
    // and the column is a fixed width, so the alternative to two lines is a
    // sentence disappearing off the side of the cell.
    const line = (
        <>
            {bits.length > 0 && (
                <span
                    className={`block text-[0.62rem] tabular-nums break-words leading-snug mt-0.5 ${
                        unplanned || cell.unexplained ? 'text-accent-ink font-semibold' : 'text-gray-400'
                    }`}
                >
                    {bits.join(' · ')}
                </span>
            )}
            {note && (
                <span className="block text-[0.62rem] italic text-gray-600 break-words leading-snug mt-0.5 pl-1.5 border-l-2 border-accent/50">
                    {note}
                </span>
            )}
        </>
    )

    if (!canEdit) return line

    return (
        <button
            type="button"
            onClick={onOpen}
            title="Open the day to write a note"
            className="block text-left w-full hover:opacity-70"
        >
            {line}
        </button>
    )
}
