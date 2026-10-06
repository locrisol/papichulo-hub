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
            Applied to renew on {shortDate(person.applied)}{late ? ', after it expired' : ''}
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
            <Who label="Expired:" people={state.expired} />
            <Who label="Expires soon:" people={state.expiring} />
            <Who label="Nothing on file:" people={state.missing} />
            {next && (
                <p className="text-muted mt-1.5">
                    The next {noun} expires on {shortDate(next.on)}, in {days} {days === 1 ? 'day' : 'days'}.
                </p>
            )}
        </Line>
    )
}

// The printed allergen sheet, only while a new one is due. His ask of 29
// September. The words are reprintDue's, the same the Public Allergens page
// shows, so the report and the page cannot say it two different ways.
function AllergenSheet({ due }) {
    if (!due) return null
    return (
        <Line>
            <b className="text-gray-900">Allergen sheet:</b>
            <p className="text-gray-900 mt-0.5">{due.words}</p>
        </Line>
    )
}

// `paperwork` is paperworkFor's: the people checked, and both kinds summed up.
// `allergenSheet` is reprintDue's answer, null while the sheet is not due.
// `sent` is the day a sent report was checked on, null while it is a draft.
export default function ReportPaperwork({ paperwork, weekStart, asOf, allergenSheet = null, sent = null }) {
    if (paperwork.people === 0) {
        return (
            <div className="space-y-2">
                <p className="text-sm text-muted">
                    Nobody was on the team this week, so there is no paperwork to check.
                </p>
                <AllergenSheet due={allergenSheet} />
            </div>
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
                <AllergenSheet due={allergenSheet} />
            </div>

            <p className="text-xs text-muted mt-2">
                {paperwork.people != null ? `${paperwork.people} on` : 'Everybody on'} the team in the week of {shortDate(weekStart)},
                {' '}{sent ? `checked on ${shortDate(sent)}, when the report was sent` : 'checked as of today'},
                leaving out anybody who has left since. Anything that expires within {WARN_DAYS} days counts as
                expiring soon, and anybody with no permit to expire counts as in date.
            </p>
        </div>
    )
}
