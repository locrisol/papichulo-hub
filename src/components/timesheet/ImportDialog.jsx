import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { friendlyError } from '@/lib/errors'
import { fullDate, shortDate } from '@/lib/dates'
import { fmtHours } from '@/lib/roster'
import { shortClock } from '@/lib/clock'
import { readTimesheet, fileFits, insideWeek, sameTimeWho } from '@/lib/timesheetImport'
import { planImport, guestName, guestFromTill, guestNameProblem, GUEST_LABEL } from '@/lib/timesheet'
import Modal from '@/components/ui/Modal'
import ErrorBanner from '@/components/ui/ErrorBanner'
import {
    modalFooter, secondaryButton, primaryButton, labelClass, fieldClass, rowButton, hintClass, fieldError,
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

//
// A name can also be **somebody from another restaurant** (his, 9 November
// 2026): her shifts go in under a name typed here, which starts as one made
// from the till's. She is not remembered for good, because she came for that
// week; her rows keep what the till called her instead, so the same report
// read in again finds her and does not ask twice.
export default function ImportDialog({
    restaurantId, restaurantName, weekStart, weekEnd, people, team = people, entries, absences,
    onClose, onDone,
}) {
    const { user } = useAuth()

    const [stage, setStage] = useState('pick')
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const [read, setRead] = useState(null)
    const [mappings, setMappings] = useState([])
    const [answers, setAnswers] = useState({})
    // The names the file asked about, held from the first look. Answers fold
    // into the plan as they are given, so the plan's own list shrinks while
    // somebody is still typing a name into it.
    const [asked, setAsked] = useState([])
    // What each till name was called last time it came as somebody from
    // another restaurant, to start the box from.
    const [lastTime, setLastTime] = useState({})
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

        // Only the days of the week that is open. A range picked by hand
        // often takes in a day either side.
        const mine = insideWeek(held, weekStart, weekEnd)
        setRead(mine)
        setMappings(data || [])

        const plan = planImport({ shifts: mine.shifts, mappings: data || [], entries, absences })
        setAsked(plan.unknown)
        if (plan.unknown.length) {
            // Only a help: a read that fails, or a database without the
            // column yet, starts the box from the till's name instead.
            const { data: before } = await supabase.from('timesheet_entries')
                .select('till_name, person_name, work_date, source, note')
                .eq('restaurant_id', restaurantId)
                .is('employee_id', null)
                .in('till_name', plan.unknown)
                .order('work_date', { ascending: false })
            const names = {}
            for (const row of before || []) {
                if (!names[row.till_name] && guestName(row.person_name)) names[row.till_name] = guestName(row.person_name)
            }
            setLastTime(names)
        }
        setStage(plan.unknown.length ? 'names' : 'ready')
    }

    // Why the name typed for somebody from another restaurant will not do, or
    // ''. Never somebody on the team, and never the name given to another till
    // name in this same file.
    function guestProblem(till) {
        const answer = answers[till]
        if (!answer || typeof answer !== 'object') return ''
        const others = Object.entries(answers)
            .filter(([name, a]) => name !== till && a && typeof a === 'object')
            .map(([, a]) => a.guest)
        return guestNameProblem(answer.guest, { team, guests: others })
    }

    const plan = read
        ? planImport({
            shifts: read.shifts,
            mappings: [...mappings, ...Object.entries(answers)
                .filter(([name, a]) => a && a !== 'once' && !guestProblem(name))
                .map(([name, a]) => (typeof a === 'object'
                    ? { name, guest: guestName(a.guest) }
                    : { name, employee_id: a === 'ignore' ? null : a, ignored: a === 'ignore' }))],
            entries,
            absences,
        })
        : null

    // "Ignore this time" is answered and deliberately not remembered, so the
    // name still counts as unknown to the planner. It is filtered here instead.
    // A name for somebody from another restaurant counts once it would do.
    const waiting = asked.filter(name => !answers[name] || guestProblem(name))

    async function apply() {
        setBusy(true)
        setError('')

        // Only what was answered for good. "This time" writes nothing, which is
        // the whole difference: remembering a wrong employee number would hide
        // a real person's hours the first week they worked.
        //
        // Somebody from another restaurant is never remembered either: she
        // came for that week, and her rows carry what the till called her.
        const remember = Object.entries(answers)
            .filter(([, a]) => typeof a === 'string' && a !== 'once')
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
        // Hers apart, so a file with nobody from another restaurant in it
        // writes exactly what it always wrote.
        const theirs = []
        const changed = []

        for (const step of plan.steps) {
            if (step.action === 'ask' || step.action === 'same') continue

            const row = {
                starts_at: step.incoming.starts_at,
                ends_at: step.incoming.ends_at,
                source: 'import',
            }

            if (step.action === 'fill' && step.person_name) {
                theirs.push({
                    restaurant_id: restaurantId,
                    employee_id: null,
                    person_name: step.person_name,
                    till_name: step.till_name,
                    work_date: step.date,
                    kind: 'worked',
                    created_by: user?.id,
                    ...row,
                })
            } else if (step.action === 'fill') {
                made.push({
                    restaurant_id: restaurantId,
                    employee_id: step.employee_id,
                    work_date: step.date,
                    kind: 'worked',
                    created_by: user?.id,
                    ...row,
                })
            } else {
                // A row of hers typed by hand that the till now confirms takes
                // the till's name too, so the next read of the file finds it.
                changed.push({ id: step.existing.id, row: step.person_name ? { ...row, till_name: step.till_name } : row })
            }
        }

        for (const rows of [made, theirs]) {
            if (!rows.length) continue
            const { error: failed } = await supabase.from('timesheet_entries').insert(rows)
            if (failed) { setBusy(false); setError(friendlyError(failed)); return }
        }
        for (const one of changed) {
            const { error: failed } = await supabase.from('timesheet_entries')
                .update(one.row).eq('id', one.id)
            if (failed) { setBusy(false); setError(friendlyError(failed)); return }
        }

        // The week keeps the fact that the file was read in, and from then on a
        // rostered shift with nothing against it is taken as not worked rather
        // than as a question for somebody to answer. The file answered it.
        //
        // After the rows, and it does not stop the import if it fails: the
        // hours are the thing that had to be saved, and a week that is asked
        // one question too many is a smaller fault than one that loses a day.
        const { error: notMarked } = await supabase.from('timesheet_weeks')
            .upsert({
                restaurant_id: restaurantId,
                week_start: weekStart,
                imported_at: new Date().toISOString(),
                imported_by: user?.id,
            }, { onConflict: 'restaurant_id,week_start' })

        setBusy(false)
        if (notMarked) setError(friendlyError(notMarked))
        setResult({
            shifts: made.length + theirs.length + changed.length,
            people: new Set(plan.steps.map(s => s.employee_id || `guest:${s.person_name}`)).size,
            guests: plan.guests,
            hours: read.shifts.reduce((t, s) => t + (Number(s.hours) || 0), 0),
            breaks: read.breaks.length,
            breakHours: read.breakHours,
            sameTime: read.sameTime,
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
        <Modal title="Upload the till's report" onClose={onClose} width="max-w-lg">
            <div className="px-6 py-4">
                {error && <ErrorBanner className="mb-3">{error}</ErrorBanner>}

                {stage === 'pick' && (
                    <div>
                        <p className="text-sm text-muted mb-3">
                            The week of {shortDate(weekStart)} to {shortDate(weekEnd)}. The file says
                            which days and which restaurant it is for, so a wrong one is refused
                            before anything is written. It can cover more than the week; anything
                            outside is left for the week it belongs to.
                        </p>
                        {/* XML for preference. Crystal will export this ten
                            ways and XML is the only one with named fields and
                            ISO timestamps in it: the CSV works and is proven,
                            but it is read by counting along from a marker, so a
                            column moving would make it quietly wrong. */}
                        <label className={labelClass} htmlFor="till-file">
                            The report. Export it as XML if you can, or CSV.
                        </label>
                        <input
                            id="till-file"
                            type="file"
                            accept=".xml,.csv,text/xml,application/xml,text/csv"
                            disabled={busy}
                            className={fieldClass}
                            onChange={e => take(e.target.files?.[0])}
                        />
                        {busy && <p className="text-xs text-muted mt-2">Reading...</p>}

                        <Steps />
                    </div>
                )}

                {stage === 'names' && (
                    <Names
                        names={asked}
                        people={people}
                        answers={answers}
                        lastTime={lastTime}
                        problemFor={guestProblem}
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
                            className={primaryButton()}
                        >
                            {waiting.length
                                ? `${waiting.length} still to answer`
                                : 'Continue'}
                        </button>
                    </>
                )}
                {stage === 'ready' && (
                    <>
                        <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                        {/* Green rather than the accent orange. Every other
                            primary button in the app sends something out or
                            saves something; this one brings a file in, and it
                            is the last press before a week is written to. */}
                        <button
                            type="button"
                            disabled={busy}
                            onClick={apply}
                            className={primaryButton('md', 'good')}
                        >
                            {busy ? 'Importing...' : 'Import'}
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
        return `That file covers ${fullDate(fits.from)} to ${fullDate(fits.to)}, `
            + `which does not take in the whole of ${fullDate(weekStart)} to ${fullDate(weekEnd)}. `
            + 'Open the week the file is for, or export one that covers this one.'
    }
    if (fits.why === 'restaurant') {
        return `That file says it is for ${fits.found}, which is not the restaurant you are in.`
    }
    return 'That file does not look like a till report. Nothing in it says which week it covers.'
}

// A name the Hub has not seen. Five answers, and the difference between the
// two ignores is the whole reason there are both: "always" is a fact about an
// account, "this time" is a fact about one file. Somebody from another
// restaurant is in the list with the team, because that is where somebody
// looking for who this is will look.
function Names({ names, people, answers, lastTime, problemFor, onAnswer }) {
    return (
        <div>
            <p className="text-sm text-muted mb-4">
                Some names from the till do not match anyone on the team, and some are not people.
                A person you pick and Not a person are remembered. Ignore this time and From
                another restaurant are not.
            </p>

            {names.map(name => {
                const answer = answers[name]
                const guest = Boolean(answer) && typeof answer === 'object'
                const problem = guest ? problemFor(name) : ''
                return (
                <div key={name} className="mb-4 pb-4 border-b border-border last:border-b-0 last:mb-0 last:pb-0">
                    <p className="text-sm font-semibold text-gray-900 mb-2 break-words">{name}</p>

                    <select
                        aria-label={`Who ${name} is`}
                        className={`${fieldClass} mb-2`}
                        value={guest ? 'guest'
                            : typeof answer === 'string' && answer !== 'ignore' && answer !== 'once' ? answer : ''}
                        onChange={e => onAnswer(name, e.target.value === 'guest'
                            ? { guest: lastTime[name] || guestFromTill(name) }
                            : e.target.value || null)}
                    >
                        <option value="">Pick a person</option>
                        {people.map(p => (
                            <option key={p.id} value={p.id}>{p.full_name}</option>
                        ))}
                        <option value="guest">{GUEST_LABEL}</option>
                    </select>

                    {guest && (
                        <div className="mb-2">
                            <label className={labelClass} htmlFor={`guest-${name}`}>Their name</label>
                            <input
                                id={`guest-${name}`}
                                type="text"
                                autoComplete="off"
                                className={fieldClass}
                                value={answer.guest}
                                onChange={e => onAnswer(name, { guest: e.target.value })}
                            />
                            {problem
                                ? <p className={fieldError}>{problem}</p>
                                : (
                                    <p className={hintClass}>
                                        Their name on the timesheet and in the hours, marked {GUEST_LABEL.toLowerCase()}.
                                        Make it different from everybody on the team, for example with a surname.
                                        {lastTime[name] ? ` Last time this name was ${lastTime[name]}.` : ''}
                                    </p>
                                )}
                        </div>
                    )}

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

                    {answer === 'once' && (
                        <p className="text-xs text-muted mt-2">
                            Skipped for this file only. You will be asked again the next time this name
                            appears.
                        </p>
                    )}
                </div>
                )
            })}
        </div>
    )
}

// Where the file comes from, because nobody remembers a path through somebody
// else's till and the report is four menus in. His words, and the format
// matters: the same report exports ten ways and only two of them can be read.
function Steps() {
    const steps = [
        'In Pixel Point, go to Employee, then Time Cards.',
        'Choose the Employee Shift Summary with Overtime.',
        'Set the dates so they take in the whole week, then run it.',
        'Press Export, and choose XML as the file format and All Pages.',
        'If the browser says the download was blocked, choose Keep.',
    ]

    return (
        <div className="mt-4 pt-3 border-t border-border">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
                Where the file comes from
            </p>
            <ol className="text-xs text-muted list-decimal pl-4 space-y-1">
                {steps.map(step => <li key={step}>{step}</li>)}
            </ol>
        </div>
    )
}

// The weeks the rest of the file belongs to, named rather than counted, so the
// answer to "where did the other half go" is on the screen that dropped them.
function otherWeeks(read) {
    const weeks = (read?.outsideWeeks || []).map(shortDate)
    if (!weeks.length) return ''
    if (weeks.length === 1) return `the week of ${weeks[0]}`
    return `the weeks of ${weeks.slice(0, -1).join(', ')} and ${weeks[weeks.length - 1]}`
}

function sameTimeWords(count) {
    return `${count} ${count === 1 ? 'line' : 'lines'} dropped with the same clock in and clock out time`
}

function Ready({ plan, read }) {
    return (
        <div>
            <p className="text-sm text-gray-900 mb-3">
                <strong>{read.shifts.length} shifts</strong> for this week.
            </p>
            <ul className="text-sm text-gray-900 space-y-1 mb-3">
                <Line>{plan.filled} day{plan.filled === 1 ? '' : 's'} with nothing on {plan.filled === 1 ? 'it' : 'them'} yet</Line>
                {plan.rosterReplaced > 0 && <Line>{plan.rosterReplaced} already here, to be replaced by the clock</Line>}
                {plan.nudged > 0 && <Line>{plan.nudged} typed by hand, out by under an hour</Line>}
                {plan.unchanged > 0 && <Line>{plan.unchanged} already exactly right</Line>}
                {plan.guests.map(g => (
                    <Line key={g.name}>
                        {g.name}, from another restaurant: {g.shifts} shift{g.shifts === 1 ? '' : 's'}
                        {g.already ? ', already on this week' : ''}
                    </Line>
                ))}
                {read.breaks.length > 0 && (
                    <Line>
                        {read.breaks.length} break lines dropped, worth {fmtHours(read.breakHours)} hours.
                        Breaks are paid here.
                    </Line>
                )}
                {/* No work at all, and kept they came to 24 hours each. Said
                    rather than dropped quietly, and named, because one may be
                    somebody whose real shift the till never caught. */}
                {read.sameTime.length > 0 && (
                    <Line>{sameTimeWords(read.sameTime.length)}: {sameTimeWho(read.sameTime)}.</Line>
                )}
                {/* A file often covers more than one week: his real export ran
                    the 6th to the 19th. Only the week on screen is written to,
                    so the rest are named rather than dropped quietly, and the
                    same file read in again on that week picks them up. */}
                {read.outside > 0 && (
                    <Line>
                        {read.outside} for {otherWeeks(read)}. Open that week and upload
                        the same file to import them.
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
                {result.shifts} shift{result.shifts === 1 ? '' : 's'} imported
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
                {result.sameTime.length > 0 && (
                    <Line tick>{sameTimeWords(result.sameTime.length)}: {sameTimeWho(result.sameTime)}</Line>
                )}
                {result.guests.length > 0 && (
                    <Line tick>
                        {result.guests.map(g => g.name).join(', ')} from another restaurant
                    </Line>
                )}
                {result.ignored > 0 && <Line quiet>{result.ignored} lines skipped, not people</Line>}
            </ul>

            {result.asks.length > 0 && (
                <div className="border-t border-border pt-3">
                    <p className="text-sm font-bold text-accent-ink mb-2">
                        {result.asks.length} need{result.asks.length === 1 ? 's' : ''} checking. Nothing was overwritten.
                    </p>
                    <ul className="text-xs text-muted space-y-1 tabular-nums">
                        {result.asks.map((ask, i) => (
                            <li key={i}>
                                <span className="font-semibold text-gray-900">
                                    {ask.person_name || nameOf(ask.employee_id)}, {shortDate(ask.date)}
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
        <span className={quiet ? 'text-muted' : 'text-green-700'}>{tick || quiet ? (quiet ? '—' : '✓') : '•'}</span>
        <span className={quiet ? 'text-muted' : ''}>{children}</span>
    </li>
)
