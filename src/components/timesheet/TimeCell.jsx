import { maskTime, settleTime, shortClock } from '@/lib/clock'
import { kindOf, cellColour } from '@/lib/timesheet'
import { kindLabel as absenceLabel, takesHours } from '@/lib/absences'
import { numberField } from '@/lib/numberInput'

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

const box = 'block w-full font-sans text-xs tabular-nums tracking-tight '
    + 'border border-gray-300 rounded px-1 py-0.5 bg-white text-gray-900 '
    + 'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 '
    + 'placeholder:text-gray-300 disabled:bg-gray-50 disabled:text-gray-400'

export default function TimeCell({
    cell, at, canEdit = true, onType, onSettle, onState, onClear, onAdd, onHours,
}) {
    const { entries, absence, rostered, unplanned } = cell

    // Holiday and off sick take the day: there are no times to hold. Training
    // and a trial are worked time and keep their boxes, which is the thing the
    // first design got wrong.
    if (absence) {
        // A holiday carries the hours it comes to off the payslip, and nothing
        // here should guess them. The roster's own dialog leaves the figure
        // empty for somebody to type, so this does too: it is a box, not a
        // default. A holiday spanning several days holds one figure for the
        // whole run, which is why the box shows the run's number and the grey
        // line under it says what this day's share is.
        const runs = takesHours(absence.kind)
        const share = cell.holidayHours
        const many = absence.starts_on !== absence.ends_on

        return (
            <div>
                <div className="flex items-start gap-1">
                    <span
                        className="inline-block text-[0.58rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-white whitespace-nowrap"
                        style={{ backgroundColor: cellColour({ absence }) }}
                    >
                        {absenceLabel(absence.kind)}
                    </span>
                    {canEdit && (
                        <button
                            type="button"
                            onClick={onClear}
                            aria-label="Clear the day"
                            className="ml-auto text-gray-400 hover:text-gray-900 leading-none px-1 rounded"
                        >
                            &times;
                        </button>
                    )}
                </div>

                {runs && (
                    <input
                        {...numberField({
                            value: absence.hours == null ? '' : String(absence.hours),
                            onChange: onHours,
                            decimals: 2,
                        })}
                        disabled={!canEdit}
                        aria-label="Holiday hours"
                        placeholder="hours"
                        className={`${box} mt-1 text-right ${absence.hours == null ? 'border-accent' : ''}`}
                    />
                )}

                {runs && many && absence.hours != null && (
                    <span className="block text-[0.62rem] text-gray-400 tabular-nums mt-0.5">
                        {share.toFixed(2)} this day
                    </span>
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

            <UnderLine cell={cell} unplanned={unplanned} />

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

// The small grey line. Never typed: it is the roster, drawn in, and only when
// the day did not go to plan. The note, which is typed, sits on the same line
// so a cell never grows a third row for it.
function UnderLine({ cell, unplanned }) {
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

    const note = cell.entries.map(e => e.note).filter(Boolean)[0]
    if (note) bits.push(`“${note}”`)

    const kind = cell.entries.find(e => e.kind !== 'worked')
    if (kind) bits.unshift(kindOf(kind.kind).label)

    if (!bits.length) return null

    return (
        <span
            className={`block text-[0.62rem] tabular-nums whitespace-nowrap mt-0.5 ${
                unplanned ? 'text-accent-ink font-semibold' : 'text-gray-400'
            }`}
        >
            {bits.join(' · ')}
        </span>
    )
}
