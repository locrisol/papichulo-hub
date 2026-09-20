import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { friendlyError } from '@/lib/errors'
import { fullDate, shortDate } from '@/lib/dates'
import { fmtHours } from '@/lib/roster'
import { shortClock } from '@/lib/clock'
import { readTimesheet, fileFits } from '@/lib/timesheetImport'
import { planImport } from '@/lib/timesheet'
import Modal from '@/components/ui/Modal'
import ErrorBanner from '@/components/ui/ErrorBanner'
import {
    modalFooter, secondaryButton, primaryButton, labelClass, fieldClass, rowButton,
} from '@/lib/controlStyles'

// Reading the till's report into a week.
//
// Three stages, and the middle one only when it is needed: pick the file, say
// who any name it has never seen belongs to, then a message saying what
// happened. **The message is the whole of the safety here.** Nothing stops at
// every row, on purpose: thirty five confirmations in one week is how somebody
// stops reading, and then the confirmation feels like a check while not being
// one. So the file goes in and the screen says plainly what it did.
//
// The one rule underneath it: **an empty box is filled without asking and a box
// somebody typed is never quietly replaced.** Everything else, an accepted
// roster time, an earlier import, a couple of minutes either way, gets on with
// it and is counted in a line you can read in two seconds.

export default function ImportDialog({
    restaurantId, restaurantName, weekStart, weekEnd, people, entries, absences,
    onClose, onDone,
}) {
    const { user } = useAuth()

    const [stage, setStage] = useState('pick')
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const [read, setRead] = useState(null)
    const [mappings, setMappings] = useState([])
    const [answers, setAnswers] = useState({})
    const [result, setResult] = useState(null)

    async function take(file) {
        setError('')
        if (!file) return
        setBusy(true)

        const text = await file.text()
        const held = readTimesheet(text)

        const fits = fileFits({ header: held, restaurantName, weekStart, weekEnd })
        if (!fits.ok) {
            setBusy(false)
            setError(refusal(fits, weekStart, weekEnd))
            return
        }

        const { data, error: failed } = await supabase
            .from('timesheet_names').select('name, employee_id, ignored')
            .eq('restaurant_id', restaurantId)

        setBusy(false)
        if (failed) { setError(friendlyError(failed)); return }

        setRead(held)
        setMappings(data || [])

        const plan = planImport({ shifts: held.shifts, mappings: data || [], entries, absences })
        setStage(plan.unknown.length ? 'names' : 'ready')
    }

    const plan = read
        ? planImport({
            shifts: read.shifts,
            mappings: [...mappings, ...Object.entries(answers)
                .filter(([, a]) => a && a !== 'once')
                .map(([name, a]) => ({
                    name,
                    employee_id: a === 'ignore' ? null : a,
                    ignored: a === 'ignore',
                }))],
            entries,
            absences,
        })
        : null

    // "Ignore this time" is answered and deliberately not remembered, so the
    // name still counts as unknown to the planner. It is filtered here instead.
    const waiting = (plan?.unknown || []).filter(name => !answers[name])

    async function apply() {
        setBusy(true)
        setError('')

        // Only what was answered for good. "This time" writes nothing, which is
        // the whole difference: remembering a wrong employee number would hide
        // a real person's hours the first week they worked.
        const remember = Object.entries(answers)
            .filter(([, a]) => a && a !== 'once')
            .filter(([name]) => !mappings.some(m => m.name === name))
            .map(([name, a]) => ({
                restaurant_id: restaurantId,
                name,
                employee_id: a === 'ignore' ? null : a,
                ignored: a === 'ignore',
                created_by: user?.id,
            }))

        if (remember.length) {
            const { error: failed } = await supabase.from('timesheet_names').insert(remember)
            if (failed) { setBusy(false); setError(friendlyError(failed)); return }
        }

        const made = []
        const changed = []

        for (const step of plan.steps) {
            if (step.action === 'ask' || step.action === 'same') continue

            const row = {
                starts_at: step.incoming.starts_at,
                ends_at: step.incoming.ends_at,
                source: 'import',
            }

            if (step.action === 'fill') {
                made.push({
                    restaurant_id: restaurantId,
                    employee_id: step.employee_id,
                    work_date: step.date,
                    kind: 'worked',
                    created_by: user?.id,
                    ...row,
                })
            } else {
                changed.push({ id: step.existing.id, row })
            }
        }

        if (made.length) {
            const { error: failed } = await supabase.from('timesheet_entries').insert(made)
            if (failed) { setBusy(false); setError(friendlyError(failed)); return }
        }
        for (const one of changed) {
            const { error: failed } = await supabase.from('timesheet_entries')
                .update(one.row).eq('id', one.id)
            if (failed) { setBusy(false); setError(friendlyError(failed)); return }
        }

        setBusy(false)
        setResult({
            shifts: made.length + changed.length,
            people: new Set(plan.steps.map(s => s.employee_id)).size,
            hours: read.shifts.reduce((t, s) => t + (Number(s.hours) || 0), 0),
            breaks: read.breaks.length,
            breakHours: read.breakHours,
            filled: plan.filled,
            rosterReplaced: plan.rosterReplaced,
            nudged: plan.nudged,
            unchanged: plan.unchanged,
            asks: plan.asks,
            ignored: plan.ignored.length,
        })
        setStage('done')
        onDone()
    }

    return (
        <Modal title="Read the till's report" onClose={onClose} width="max-w-lg">
            <div className="px-6 py-4">
                {error && <ErrorBanner className="mb-3">{error}</ErrorBanner>}

                {stage === 'pick' && (
                    <div>
                        <p className="text-sm text-muted mb-3">
                            The week of {shortDate(weekStart)} to {shortDate(weekEnd)}. The file says
                            which week and which restaurant it is for, so a wrong one is refused
                            before anything is written.
                        </p>
                        <label className={labelClass} htmlFor="till-file">The report, as a CSV</label>
                        <input
                            id="till-file"
                            type="file"
                            accept=".csv,text/csv"
                            disabled={busy}
                            className={fieldClass}
                            onChange={e => take(e.target.files?.[0])}
                        />
                        {busy && <p className="text-xs text-muted mt-2">Reading...</p>}
                    </div>
                )}

                {stage === 'names' && (
                    <Names
                        names={plan.unknown}
                        people={people}
                        answers={answers}
                        onAnswer={(name, value) => setAnswers(was => ({ ...was, [name]: value }))}
                    />
                )}

                {stage === 'ready' && <Ready plan={plan} read={read} />}

                {stage === 'done' && <Done result={result} people={people} />}
            </div>

            <div className={modalFooter}>
                {stage === 'names' && (
                    <>
                        <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                        <button
                            type="button"
                            disabled={waiting.length > 0}
                            onClick={() => setStage('ready')}
                            className={`${primaryButton} disabled:opacity-50`}
                        >
                            {waiting.length
                                ? `${waiting.length} still to answer`
                                : 'Carry on'}
                        </button>
                    </>
                )}
                {stage === 'ready' && (
                    <>
                        <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                        <button type="button" disabled={busy} onClick={apply} className={primaryButton}>
                            {busy ? 'Reading in...' : 'Read it in'}
                        </button>
                    </>
                )}
                {(stage === 'pick' || stage === 'done') && (
                    <button type="button" onClick={onClose} className={secondaryButton}>
                        {stage === 'done' ? 'Done' : 'Cancel'}
                    </button>
                )}
            </div>
        </Modal>
    )
}

// Why a file was turned away, in words rather than a code. The three are
// different mistakes and want different sentences: the wrong shop is not the
// wrong week, and a file that will not parse is a third thing.
function refusal(fits, weekStart, weekEnd) {
    if (fits.why === 'week') {
        return `That file is for ${fullDate(fits.from)} to ${fullDate(fits.to)}. `
            + `This week is ${fullDate(weekStart)} to ${fullDate(weekEnd)}. `
            + 'Open the week the file is for, or export the right one.'
    }
    if (fits.why === 'restaurant') {
        return `That file says it is for ${fits.found}, which is not the restaurant you are in.`
    }
    return 'That file does not look like a till report. Nothing in it says which week it covers.'
}

// A name the Hub has not seen. Four answers, and the difference between the
// last two is the whole reason there are both: "always" is a fact about an
// account, "this time" is a fact about one file.
function Names({ names, people, answers, onAnswer }) {
    return (
        <div>
            <p className="text-sm text-muted mb-4">
                The till spells names its own way and some of them are not people at all. Answered
                once and remembered, except the last one.
            </p>

            {names.map(name => (
                <div key={name} className="mb-4 pb-4 border-b border-border last:border-b-0 last:mb-0 last:pb-0">
                    <p className="text-sm font-semibold text-gray-900 mb-2 break-words">{name}</p>

                    <select
                        className={`${fieldClass} mb-2`}
                        value={typeof answers[name] === 'string' && answers[name] !== 'ignore' && answers[name] !== 'once'
                            ? answers[name] : ''}
                        onChange={e => onAnswer(name, e.target.value || null)}
                    >
                        <option value="">This is...</option>
                        {people.map(p => (
                            <option key={p.id} value={p.id}>{p.full_name}</option>
                        ))}
                    </select>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => onAnswer(name, 'ignore')}
                            className={rowButton(answers[name] === 'ignore' ? 'edit' : 'plain')}
                        >
                            Not a person, ignore always
                        </button>
                        <button
                            type="button"
                            onClick={() => onAnswer(name, 'once')}
                            className={rowButton(answers[name] === 'once' ? 'edit' : 'plain')}
                        >
                            Ignore this time
                        </button>
                    </div>

                    {answers[name] === 'once' && (
                        <p className="text-xs text-muted mt-2">
                            Dropped from this file only. It will ask again next week, which is right
                            if somebody typed the wrong employee number.
                        </p>
                    )}
                </div>
            ))}
        </div>
    )
}

function Ready({ plan, read }) {
    return (
        <div>
            <p className="text-sm text-gray-900 mb-3">
                <strong>{read.shifts.length} shifts</strong> in the file.
            </p>
            <ul className="text-sm text-gray-900 space-y-1 mb-3">
                <Line>{plan.filled} day{plan.filled === 1 ? '' : 's'} with nothing on {plan.filled === 1 ? 'it' : 'them'} yet</Line>
                {plan.rosterReplaced > 0 && <Line>{plan.rosterReplaced} already here, to be replaced by the clock</Line>}
                {plan.nudged > 0 && <Line>{plan.nudged} typed by hand, out by under an hour</Line>}
                {plan.unchanged > 0 && <Line>{plan.unchanged} already exactly right</Line>}
                {read.breaks.length > 0 && (
                    <Line>
                        {read.breaks.length} break lines dropped, worth {fmtHours(read.breakHours)} hours.
                        Breaks are paid here.
                    </Line>
                )}
            </ul>
            {plan.asks.length > 0 && (
                <p className="text-sm text-accent-ink">
                    <strong>{plan.asks.length} will be left alone</strong> for you to look at afterwards.
                    Nothing you typed is overwritten.
                </p>
            )}
        </div>
    )
}

function Done({ result, people }) {
    const nameOf = id => people.find(p => p.id === id)?.full_name || 'Somebody'

    return (
        <div>
            <p className="text-base font-bold text-gray-900 mb-3">
                {result.shifts} shift{result.shifts === 1 ? '' : 's'} read in
            </p>

            <ul className="text-sm text-gray-900 space-y-1.5 mb-4">
                <Line tick>{result.filled} filled in, {result.rosterReplaced} replaced by the clock</Line>
                {result.nudged > 0 && <Line tick>{result.nudged} typed times moved by under an hour</Line>}
                {result.unchanged > 0 && <Line quiet>{result.unchanged} already exactly right</Line>}
                {result.breaks > 0 && (
                    <Line tick>
                        {result.breaks} break lines dropped, worth {fmtHours(result.breakHours)} hours
                    </Line>
                )}
                {result.ignored > 0 && <Line quiet>{result.ignored} lines skipped, not people</Line>}
            </ul>

            {result.asks.length > 0 && (
                <div className="border-t border-border pt-3">
                    <p className="text-sm font-bold text-accent-ink mb-2">
                        {result.asks.length} need{result.asks.length === 1 ? 's' : ''} you. Nothing was overwritten.
                    </p>
                    <ul className="text-xs text-muted space-y-1 tabular-nums">
                        {result.asks.map((ask, i) => (
                            <li key={i}>
                                <span className="font-semibold text-gray-900">
                                    {nameOf(ask.employee_id)}, {shortDate(ask.date)}
                                </span>
                                {' · '}
                                {ask.why === 'absence'
                                    ? 'marked off here, and the file has a shift'
                                    : `here ${shortClock(ask.existing?.starts_at)}, file ${shortClock(ask.incoming.starts_at)}`}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}

const Line = ({ children, tick, quiet }) => (
    <li className="flex gap-2">
        <span className={quiet ? 'text-muted' : 'text-green-700'}>{tick || quiet ? (quiet ? '–' : '✓') : '•'}</span>
        <span className={quiet ? 'text-muted' : ''}>{children}</span>
    </li>
)
