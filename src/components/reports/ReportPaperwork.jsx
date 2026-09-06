import { shortDate } from '../../lib/dates'
import { paperworkState, permissionNeedsExpiry, daysUntil, WARN_DAYS } from '../../lib/reportPeople'

// The team's paperwork, read straight off the employee records.
//
// Names are deliberately left out. The counts and the dates are what an owner
// needs from a weekly report, and this section ends up in a mail that gets
// forwarded, so a list of who is out of date does not belong in it. Whoever is
// acting on it opens the team page, where the names are and where they can
// actually be fixed.
//
// When everything is in date it says one green line and stops. A section that
// writes four paragraphs to say nothing is a section people stop reading, and
// then miss the week it does say something.

function Line({ ok, children }) {
    return (
        <div className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
            ok ? 'border-border bg-app-bg' : 'border-accent/40 bg-accent-light/50'}`}>
            <span
                aria-hidden="true"
                className={`flex-shrink-0 font-bold ${ok ? 'text-green-700' : 'text-accent-ink'}`}
            >
                {ok ? '✓' : '!'}
            </span>
            <div className="flex-1 min-w-0 text-sm">{children}</div>
        </div>
    )
}

// The sentence a single kind of paperwork gets.
function Summary({ title, state, asOf, noun }) {
    if (state.total === 0) return null

    if (state.ok) {
        return (
            <Line ok>
                <b className="text-gray-900">{title}: all {state.total} in date.</b>
            </Line>
        )
    }

    const inDate = state.fine
    const bits = []
    if (state.expired.length) bits.push(`${state.expired.length} out of date`)
    if (state.expiring.length) bits.push(`${state.expiring.length} running out`)
    if (state.missing.length) bits.push(`${state.missing.length} never recorded`)

    return (
        <Line>
            <b className="text-gray-900">
                {title}: {inDate} of {state.total} in date.
            </b>
            <p className="text-muted mt-0.5">
                {bits.join(', ')}.
                {state.expiring.length > 0 && (() => {
                    const next = state.expiring[0]
                    const days = daysUntil(next.on, asOf)
                    return ` The next ${noun} runs out on ${shortDate(next.on)}, in ${days} ${days === 1 ? 'day' : 'days'}.`
                })()}
            </p>
        </Line>
    )
}

export default function ReportPaperwork({ employees, weekStart, asOf }) {
    const food = paperworkState(employees, 'food_safety_expires', asOf)
    // A citizen has no permit to expire, so a blank date on one is the right
    // answer rather than a gap in the records.
    const permits = paperworkState(
        employees, 'work_permission_expires', asOf, permissionNeedsExpiry)

    if (employees.length === 0) {
        return (
            <p className="text-sm text-muted">
                Nobody was on the books this week, so there is no paperwork to check.
            </p>
        )
    }

    return (
        <div>
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-2">
                Paperwork &middot; from the Hub
            </p>

            <div className="space-y-2">
                <Summary title="Food safety" state={food} asOf={asOf} noun="certificate" />
                <Summary title="Right to work" state={permits} asOf={asOf} noun="permission" />
            </div>

            <p className="text-xs text-muted mt-2">
                {employees.length} on the books in the week of {shortDate(weekStart)}, checked as things stand
                today. Anything inside {WARN_DAYS} days counts as running out, and anybody with no permit to
                expire counts as in date. Names are on the team page rather than in here, since this section
                goes out in a mail.
            </p>
        </div>
    )
}
