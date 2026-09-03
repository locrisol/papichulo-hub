import Modal from './Modal'
import { shortDate } from '../lib/dates'
import { dayName } from '../lib/events'
import { shortTime, endLabel, fmtHours, hoursForDate } from '../lib/roster'
import { modalFooter, secondaryButton, rowButton, badge } from '../lib/controlStyles'
import {
    windowOf, isWholeShift, hoursChange, weekAfter, newFindings,
} from '../lib/shiftRequests'

// What two people have agreed between them, waiting on somebody to say yes.
//
// The last step, and the only one that touches the roster. Two people agreeing
// is not a change: they can agree to something that puts one of them over their
// visa hours or leaves nobody on the till at six, and neither of them can see
// that from where they are standing.
//
// So this screen does three things before it offers the button. It says what
// would move, it says what each of them would end up working, and it runs the
// week's own checks against the week as it would be and shows only what is new.
// A warning that was already there is not this swap's fault and putting it here
// would train somebody to press through all of them.
//
// Approving does not unpublish the week. An approved change is the roster now.
export default function RequestDeskModal({
    requests, shifts, employees, breakRules, dayNotes, openingHours, check,
    saving, onApprove, onRefuse, onClose,
}) {
    const nameOf = id => employees.find(e => e.id === id)?.full_name || 'Somebody'
    const hoursOn = d => hoursForDate(openingHours, (dayNotes || []).find(n => n.note_date === d), d)
    const before = check ? check(shifts) : []

    return (
        <Modal title="Changes to approve" onClose={onClose} width="max-w-2xl">
            <div className="px-6 py-4 overflow-y-auto space-y-4">
                {requests.length === 0 && (
                    <p className="text-sm text-muted">
                        Nothing waiting. Anything two people agree between them turns up here.
                    </p>
                )}

                {requests.map(request => {
                    const after = weekAfter(request, shifts, breakRules)
                    const change = hoursChange(request, shifts, breakRules)
                    const broke = check ? newFindings(before, check(after.shifts)) : []

                    const half = (shiftId, from, to, takerId) => {
                        const shift = shifts.find(s => s.id === shiftId)
                        if (!shift) return null
                        const window = windowOf(shift, from, to)
                        const whole = isWholeShift(shift, from, to)
                        return {
                            key: shiftId,
                            taker: nameOf(takerId),
                            owner: nameOf(shift.employee_id),
                            date: shift.shift_date,
                            when: whole
                                ? `${shortTime(shift.starts_at)} to ${endLabel(shift, hoursOn(shift.shift_date))}`
                                : `${shortTime(window.from)} to ${shortTime(window.to)}`,
                            whole,
                        }
                    }

                    const halves = [
                        half(request.give_shift_id, request.give_from, request.give_to, request.to_employee_id),
                        half(request.take_shift_id, request.take_from, request.take_to, request.from_employee_id),
                    ].filter(Boolean)

                    // Two shifts that end up touching become one, and the break
                    // is worked out again for the length that makes. It is
                    // worth saying out loud: it is the part nobody expects and
                    // the part that would otherwise underpay somebody.
                    const joined = after.removedIds.length > 0

                    return (
                        <div key={request.id} className="rounded-lg border border-border bg-white p-4">
                            <p className="text-sm font-semibold text-gray-900 mb-2">
                                {nameOf(request.from_employee_id)} and {nameOf(request.to_employee_id)} agreed this
                            </p>

                            {halves.map(part => (
                                <p key={part.key} className="text-sm text-gray-800">
                                    <span className="font-medium">{part.taker}</span> takes{' '}
                                    {dayName(part.date)} {shortDate(part.date)}, {part.when}
                                    <span className="text-muted"> from {part.owner}</span>
                                    {!part.whole && <span className="text-muted"> (part of it)</span>}
                                </p>
                            ))}

                            {request.message && (
                                <p className="text-sm text-gray-600 mt-2 italic">{request.message}</p>
                            )}

                            <div className="rounded-lg bg-gray-50 border border-border p-3 mt-3">
                                <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1.5">
                                    The week, after
                                </p>
                                {change.map(row => (
                                    <p key={row.employeeId} className="text-sm flex items-center gap-2">
                                        <span className="font-medium text-gray-800">{nameOf(row.employeeId)}</span>
                                        <span className="ml-auto text-muted">{fmtHours(row.before)}</span>
                                        <span className="text-muted">to</span>
                                        <span className="font-bold text-gray-900">{fmtHours(row.after)}</span>
                                    </p>
                                ))}
                                {joined && (
                                    <p className="text-xs text-muted mt-2">
                                        Two shifts end up touching, so they become one and the break is
                                        worked out again for the whole of it.
                                    </p>
                                )}
                            </div>

                            {broke.length > 0 && (
                                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mt-3">
                                    <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1.5">
                                        This would break
                                    </p>
                                    {broke.map((f, i) => (
                                        <p key={i} className="text-sm text-amber-800 flex items-start gap-2">
                                            <span className={`${badge} ${
                                                f.level === 'block' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                                            }`}>
                                                {f.level === 'block' ? 'Stops it' : 'Warning'}
                                            </span>
                                            <span>{f.text}</span>
                                        </p>
                                    ))}
                                </div>
                            )}

                            <div className="flex flex-wrap gap-2 mt-3">
                                <button
                                    type="button"
                                    disabled={saving || broke.some(f => f.level === 'block')}
                                    onClick={() => onApprove(request)}
                                    className={rowButton('good')}
                                >
                                    Approve
                                </button>
                                <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => onRefuse(request)}
                                    className={rowButton('danger')}
                                >
                                    Do not approve
                                </button>
                                {broke.some(f => f.level === 'block') && (
                                    <span className="text-xs text-red-700 self-center">
                                        Something here stops the week going out, so it cannot be approved
                                        as it stands.
                                    </span>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>Close</button>
            </div>
        </Modal>
    )
}
