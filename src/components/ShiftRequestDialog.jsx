import { useState } from 'react'
import Modal from './Modal'
import { shortDate } from '../lib/dates'
import { dayName } from '../lib/events'
import { shortTime, endLabel, fmtHours, hoursForDate } from '../lib/roster'
import { modalFooter, secondaryButton, rowButton, badge } from '../lib/controlStyles'
import { NO_COLOUR } from '../lib/team'
import { windowOf, shortlist, hoursChange } from '../lib/shiftRequests'

// Asking somebody to take a shift, or asking for one of theirs.
//
// One dialog for both, because they are the same request read from the two
// ends. Opening it off your own shift fills in the giving half; opening it off
// somebody else's fills in the taking half. Either way what comes out is a give
// and a take with one of them possibly empty.
//
// It is one scrolling form and not a wizard. A wizard would be four screens on
// a phone for a thing somebody is doing while walking to the bus, and the whole
// point of the give and take shape is that you can see both halves at once.
export default function ShiftRequestDialog({
    mine, theirs, meId, weekShifts, employees, absences, dayNotes, openingHours,
    breakRules, onSend, onClose, saving,
}) {
    // Which end this was opened from. Giving is your shift going out; asking is
    // theirs coming in.
    const seed = mine || theirs
    const [giveShift, setGiveShift] = useState(mine || null)
    const [takeShift, setTakeShift] = useState(theirs || null)

    const [givePart, setGivePart] = useState(false)
    const [giveFrom, setGiveFrom] = useState(shortTime(mine?.starts_at) || '')
    const [giveTo, setGiveTo] = useState(shortTime(mine?.ends_at) || '')

    const [takePart, setTakePart] = useState(false)
    const [takeFrom, setTakeFrom] = useState(shortTime(theirs?.starts_at) || '')
    const [takeTo, setTakeTo] = useState(shortTime(theirs?.ends_at) || '')

    const [toEmployeeId, setToEmployeeId] = useState(theirs?.employee_id || '')
    const [message, setMessage] = useState('')

    const fieldCls =
        'w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent'
    const labelCls = 'text-xs text-gray-500 mb-1 block'
    const headCls = 'text-xs font-bold text-muted uppercase tracking-wider mb-2'

    const nameOf = id => employees.find(e => e.id === id)?.full_name || 'Somebody'
    const colourOf = id => employees.find(e => e.id === id)?.position_colour || NO_COLOUR
    const hoursOn = d => hoursForDate(openingHours, (dayNotes || []).find(n => n.note_date === d), d)

    const giveWindow = giveShift
        ? windowOf(giveShift, givePart ? giveFrom : null, givePart ? giveTo : null)
        : null
    const takeWindow = takeShift
        ? windowOf(takeShift, takePart ? takeFrom : null, takePart ? takeTo : null)
        : null

    // Who to ask, worked out from the hours actually being handed over rather
    // than from the day. Somebody already in that morning is not ruled out by a
    // shift in the evening, and they are the likeliest yes on the list.
    const list = giveShift && !theirs
        ? shortlist({
            date: giveShift.shift_date,
            window: giveWindow,
            employees,
            shifts: weekShifts,
            absences,
            askerId: meId,
        })
        : null

    // What the other person has that week, for the half that comes back. Only
    // their own days, and only the ones they are actually on.
    const theirWeek = toEmployeeId
        ? (weekShifts || [])
            .filter(s => s.employee_id === toEmployeeId && s.id !== takeShift?.id)
            .sort((a, b) => a.shift_date.localeCompare(b.shift_date))
        : []

    // The two halves, named by which end you came in from rather than by
    // which is the give and which is the take. From your own shift the seed is
    // the give and the other half is the take; from somebody else's it is the
    // other way round, and everything below reads the same either way.
    const otherHalf = mine ? takeShift : giveShift
    const setOtherHalf = mine ? setTakeShift : setGiveShift
    const otherPart = mine ? takePart : givePart
    const setOtherPart = mine ? setTakePart : setGivePart
    const setOtherTimes = (from, to) => {
        if (mine) { setTakeFrom(from); setTakeTo(to) } else { setGiveFrom(from); setGiveTo(to) }
    }
    const otherOptions = mine
        ? theirWeek
        : (weekShifts || [])
            .filter(s => s.employee_id === meId)
            .sort((a, b) => a.shift_date.localeCompare(b.shift_date))

    const draft = {
        from_employee_id: meId,
        to_employee_id: toEmployeeId,
        give_shift_id: giveShift?.id || null,
        give_from: giveShift && givePart ? giveFrom : null,
        give_to: giveShift && givePart ? giveTo : null,
        take_shift_id: takeShift?.id || null,
        take_from: takeShift && takePart ? takeFrom : null,
        take_to: takeShift && takePart ? takeTo : null,
        message: message.trim() || null,
    }

    const problem = (() => {
        if (!toEmployeeId) return 'Pick who you are asking.'
        if (givePart && giveWindow && giveWindow.from >= giveWindow.to) {
            return 'The hours you are giving finish before they start.'
        }
        if (takePart && takeWindow && takeWindow.from >= takeWindow.to) {
            return 'The hours you are asking for finish before they start.'
        }
        return ''
    })()

    const change = toEmployeeId ? hoursChange(draft, weekShifts, breakRules) : []

    const timeRow = (from, setFrom, to, setTo) => (
        <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
                <label className={labelCls}>From</label>
                <input type="time" value={from} onChange={e => setFrom(e.target.value)} className={fieldCls} />
            </div>
            <div>
                <label className={labelCls}>To</label>
                <input type="time" value={to} onChange={e => setTo(e.target.value)} className={fieldCls} />
            </div>
        </div>
    )

    const shiftLine = shift =>
        `${dayName(shift.shift_date)} ${shortDate(shift.shift_date)}, `
        + `${shortTime(shift.starts_at)} to ${endLabel(shift, hoursOn(shift.shift_date))}`

    return (
        <Modal
            title={mine ? 'Ask somebody to take this' : 'Ask for this shift'}
            onClose={onClose}
            width="max-w-xl"
        >
            <div className="px-6 py-4 overflow-y-auto">
                {/* What is on the table, said once at the top. Both halves are
                    below it and either can be empty, so this is the line that
                    says which way round the thing is. */}
                <div className="rounded-lg border border-border bg-gray-50 p-3 mb-4">
                    <p className="text-xs text-muted">{mine ? 'You are giving' : 'You are asking for'}</p>
                    <p className="font-semibold text-gray-900">{shiftLine(seed)}</p>
                    {!mine && <p className="text-xs text-muted mt-0.5">{nameOf(theirs.employee_id)}</p>}
                </div>

                {/* Whole or part. Part is the common case rather than the
                    awkward one: somebody rostered nine to nine wants rid of the
                    evening, not the day. */}
                <p className={headCls}>How much of it</p>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => (mine ? setGivePart(false) : setTakePart(false))}
                        className={rowButton((mine ? givePart : takePart) ? 'plain' : 'good')}
                    >
                        All of it
                    </button>
                    <button
                        type="button"
                        onClick={() => (mine ? setGivePart(true) : setTakePart(true))}
                        className={rowButton((mine ? givePart : takePart) ? 'good' : 'plain')}
                    >
                        Part of it
                    </button>
                </div>
                {mine
                    ? givePart && timeRow(giveFrom, setGiveFrom, giveTo, setGiveTo)
                    : takePart && timeRow(takeFrom, setTakeFrom, takeTo, setTakeTo)}

                {/* Who. Only when this started from your own shift: opening it
                    off somebody else's already answered it. */}
                {list && (
                    <>
                        <p className={`${headCls} mt-5`}>Who to ask</p>
                        <Group
                            title="Would finish their day"
                            hint="Already in that day and free for these hours. The likeliest yes."
                            entries={list.finishing}
                            chosen={toEmployeeId}
                            onPick={setToEmployeeId}
                            hoursOn={hoursOn}
                            colourOf={colourOf}
                        />
                        <Group
                            title="Free that day"
                            hint="Nothing on at all, so it is a day off you are asking for."
                            entries={list.free}
                            chosen={toEmployeeId}
                            onPick={setToEmployeeId}
                            hoursOn={hoursOn}
                            colourOf={colourOf}
                        />
                        <Group
                            title="Cannot"
                            hint="Already on those hours, or down as away."
                            entries={list.cannot}
                            chosen={toEmployeeId}
                            onPick={setToEmployeeId}
                            hoursOn={hoursOn}
                            colourOf={colourOf}
                            shut
                        />
                    </>
                )}

                {/* The other half. Nothing here is a plain cover; something
                    here is a trade, and it does not have to be the same day or
                    the same length as what is going the other way.

                    Which side it is depends on which end you came in from. From
                    your own shift you are picking one of theirs to take back;
                    from theirs you are picking one of yours to offer. */}
                {toEmployeeId && (
                    <>
                        <p className={`${headCls} mt-5`}>
                            {mine ? 'What you take back' : 'What you give back'}
                        </p>
                        <div className="space-y-1.5">
                            <button
                                type="button"
                                onClick={() => { setOtherHalf(null); setOtherPart(false) }}
                                className={`w-full text-left rounded-lg border p-2.5 text-sm transition-colors ${
                                    otherHalf
                                        ? 'border-border bg-white hover:bg-gray-50'
                                        : 'border-accent bg-accent-light'
                                }`}
                            >
                                <span className="font-semibold">Nothing</span>
                                <span className="text-muted">
                                    {mine ? ' just cover me' : ' I am only asking'}
                                </span>
                            </button>

                            {otherOptions.map(s => (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => {
                                        setOtherHalf(s)
                                        setOtherPart(false)
                                        setOtherTimes(shortTime(s.starts_at), shortTime(s.ends_at))
                                    }}
                                    className={`w-full text-left rounded-lg border p-2.5 text-sm transition-colors ${
                                        otherHalf?.id === s.id
                                            ? 'border-accent bg-accent-light'
                                            : 'border-border bg-white hover:bg-gray-50'
                                    }`}
                                >
                                    {shiftLine(s)}
                                </button>
                            ))}

                            {otherOptions.length === 0 && (
                                <p className="text-xs text-muted">
                                    {mine
                                        ? 'They have nothing else on that week, so there is nothing to take back.'
                                        : 'You have nothing else on that week, so there is nothing to offer.'}
                                </p>
                            )}
                        </div>

                        {otherHalf && (
                            <>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    <button
                                        type="button"
                                        onClick={() => setOtherPart(false)}
                                        className={rowButton(otherPart ? 'plain' : 'good')}
                                    >
                                        All of it
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setOtherPart(true)}
                                        className={rowButton(otherPart ? 'good' : 'plain')}
                                    >
                                        Part of it
                                    </button>
                                </div>
                                {otherPart && (mine
                                    ? timeRow(takeFrom, setTakeFrom, takeTo, setTakeTo)
                                    : timeRow(giveFrom, setGiveFrom, giveTo, setGiveTo))}
                            </>
                        )}
                    </>
                )}

                {/* The hours, both ways. He asked for this by name: a cover that
                    takes you to fifty hours is a different answer from one that
                    takes you to thirty, and neither of you can see that from the
                    week on its own. */}
                {change.length > 0 && (
                    <div className="rounded-lg border border-border bg-gray-50 p-3 mt-5">
                        <p className={headCls}>The week, after</p>
                        {change.map(row => (
                            <p key={row.employeeId} className="text-sm text-gray-800 flex items-center gap-2">
                                <span className="font-medium">
                                    {row.employeeId === meId ? 'You' : nameOf(row.employeeId)}
                                </span>
                                <span className="ml-auto text-muted">{fmtHours(row.before)}</span>
                                <span className="text-muted">to</span>
                                <span className="font-bold text-gray-900">{fmtHours(row.after)}</span>
                            </p>
                        ))}
                    </div>
                )}

                <label className={`${labelCls} mt-5`}>Anything to say</label>
                <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={2}
                    placeholder="Optional"
                    className={fieldCls}
                />

                {problem && <p className="text-sm text-amber-700 mt-3">{problem}</p>}
            </div>

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                <button
                    type="button"
                    disabled={!!problem || saving}
                    onClick={() => onSend(draft)}
                    className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold shadow-sm hover:brightness-95 disabled:opacity-50"
                >
                    {saving ? 'Sending...' : 'Send the ask'}
                </button>
            </div>
        </Modal>
    )
}

// One block of the shortlist.
//
// The three groups are separated and labelled rather than sorted into one list,
// because which group somebody is in is the answer. A name on its own does not
// tell you that Ben is coming in anyway and Cara is not.
function Group({ title, hint, entries, chosen, onPick, hoursOn, colourOf, shut = false }) {
    if (!entries?.length) return null

    return (
        <div className="mb-3">
            <p className="text-xs font-semibold text-gray-700">{title}</p>
            <p className="text-[0.6875rem] text-muted mb-1.5">{hint}</p>
            <div className="space-y-1.5">
                {entries.map(entry => (
                    <button
                        key={entry.person.id}
                        type="button"
                        disabled={shut}
                        onClick={() => onPick(entry.person.id)}
                        className={`w-full flex items-center gap-2 rounded-lg border p-2.5 text-sm text-left transition-colors ${
                            shut
                                ? 'border-border bg-gray-50 opacity-60 cursor-not-allowed'
                                : chosen === entry.person.id
                                    ? 'border-accent bg-accent-light'
                                    : 'border-border bg-white hover:bg-gray-50'
                        }`}
                    >
                        <span
                            className="w-1.5 h-6 rounded-full flex-shrink-0"
                            style={{ backgroundColor: colourOf(entry.person.id) }}
                        />
                        <span className="font-medium text-gray-900">{entry.person.full_name}</span>
                        <span className="ml-auto text-xs text-muted text-right">
                            {entry.why === 'away'
                                ? <span className={`${badge} bg-gray-200 text-gray-700`}>Not available</span>
                                : entry.shifts.length === 0
                                    ? 'Nothing on'
                                    : entry.shifts.map(s => (
                                        <span key={s.id} className="block">
                                            {shortTime(s.starts_at)} to {endLabel(s, hoursOn(s.shift_date))}
                                        </span>
                                    ))}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    )
}
