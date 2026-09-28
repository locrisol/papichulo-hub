import { shortDate } from '@/lib/dates'
import { daysUntil, WARN_DAYS } from '@/lib/reportPeople'

// The team's paperwork, read straight off the employee records.
//
// Names, the same as the mail. They were left out here once, to keep them out
// of a mail that gets forwarded, and then the mail took them on because "two
// certificates run out this month" sends somebody off to find out who. The page
// is where the draft is read before it goes out, so it says what the mail will
// say, from the same paperworkFor.
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

// Whether a renewal was applied for, under the name, as the mail has it. Only
// the right to work carries it at all: see names() in reportPeople.js.
function Renewal({ person }) {
    if (person.applied === undefined) return null
    if (!person.applied) return <span className="block text-xs text-red-700">No renewal applied for</span>
    const late = person.on && person.applied > person.on
    return (
        <span className="block text-xs text-muted">
            Renewal applied for {shortDate(person.applied)}{late ? ', after it ran out' : ''}
        </span>
    )
}

// One kind of problem and who has it, one to a line.
function Who({ label, people }) {
    if (people.length === 0) return null
    return (
        <div className="mt-1.5">
            <p className="text-muted">{label}</p>
            <ul className="mt-0.5 space-y-0.5">
                {people.map((person, at) => (
                    <li key={at} className="text-gray-900">
                        {person.name}
                        {person.on && <span className="text-muted"> ({shortDate(person.on)})</span>}
                        <Renewal person={person} />
                    </li>
                ))}
            </ul>
        </div>
    )
}

// What a single kind of paperwork gets.
function Summary({ title, state, asOf, noun }) {
    if (state.total === 0) return null

    if (state.ok) {
        return (
            <Line ok>
                <b className="text-gray-900">{title}: all {state.total} in date.</b>
            </Line>
        )
    }

    const next = state.expiring[0]
    const days = next ? daysUntil(next.on, asOf) : null

    return (
        <Line>
            <b className="text-gray-900">
                {title}: {state.fine} of {state.total} in date.
            </b>
            <Who label="Out of date:" people={state.expired} />
            <Who label="Runs out soon:" people={state.expiring} />
            <Who label="Nothing on file:" people={state.missing} />
            {next && (
                <p className="text-muted mt-1.5">
                    The next {noun} runs out on {shortDate(next.on)}, in {days} {days === 1 ? 'day' : 'days'}.
                </p>
            )}
        </Line>
    )
}

// `paperwork` is paperworkFor's: the people checked, and both kinds summed up.
export default function ReportPaperwork({ paperwork, weekStart, asOf }) {
    if (paperwork.people === 0) {
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
                <Summary title="Food safety" state={paperwork.food} asOf={asOf} noun="certificate" />
                <Summary title="Right to work" state={paperwork.permits} asOf={asOf} noun="permission" />
            </div>

            <p className="text-xs text-muted mt-2">
                {paperwork.people} on the books in the week of {shortDate(weekStart)}, checked as things stand
                today, leaving out anybody who has left since. Anything inside {WARN_DAYS} days counts as running
                out, and anybody with no permit to expire counts as in date.
            </p>
        </div>
    )
}
