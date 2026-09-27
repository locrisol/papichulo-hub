import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { friendlyError } from '@/lib/errors'
import { fmtMoney, num } from '@/lib/format'
import { shortDate, fullDate, addDays, todayISO } from '@/lib/dates'
import { DAY_NAMES } from '@/lib/events'
import {
    readWeeklySales, salesFileFits, matchTillLines, planSalesImport, lineByDay,
} from '@/lib/salesImport'
import Modal from '@/components/ui/Modal'
import ErrorBanner from '@/components/ui/ErrorBanner'
import {
    modalFooter, secondaryButton, primaryButton, labelClass, fieldClass, compactField,
    checkbox, checkRow,
} from '@/lib/controlStyles'

// Reading the till's weekly report into the sales grid.
//
// The same three steps as the Timesheet's upload: pick the file, answer for
// anything the Hub cannot place, then read what will happen before it does.
// The middle step only appears when something needs an answer, which after
// the first week is almost never.
//
// **It fills the grid and writes nothing.** The boxes turn green the same as
// if they had been typed, the Reconciliation row checks every day, and the
// week is saved with Save week like any other. Only the answers marked to be
// remembered are written straight away, because they are about the till and
// not about this week.

export default function SalesImportDialog({
    restaurantId, restaurantName, weekStart, days, tenders, shownTenders,
    trackingPlatforms, loading, onGoToWeek, onFill, onClose,
}) {
    const { user } = useAuth()

    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const [read, setRead] = useState(null)
    const [remembered, setRemembered] = useState([])
    const [answers, setAnswers] = useState({})
    const [asked, setAsked] = useState(false)

    const weekEnd = addDays(weekStart, 6)
    const active = tenders.filter(t => t.is_active)

    async function take(file) {
        setError('')
        if (!file) return
        setBusy(true)

        const held = readWeeklySales(await file.text())

        const { data, error: failed } = await supabase
            .from('sales_tender_names').select('name, tender_key')
            .eq('restaurant_id', restaurantId)

        setBusy(false)
        if (failed) { setError(friendlyError(failed)); return }

        const known = data || []
        const firstAnswers = {}
        for (const m of matchTillLines({ lines: held.lines, tenders, remembered: known })) {
            if (!m.key && m.guess) firstAnswers[m.name] = { key: m.guess, remember: true }
        }

        setRemembered(known)
        setAnswers(firstAnswers)
        setAsked(false)
        setRead(held)
    }

    function startAgain() {
        setRead(null)
        setError('')
    }

    const fits = read ? salesFileFits({ read, restaurantName, weekStart }) : null

    // The week the file is for has to be the one on screen AND loaded. Right
    // after the arrows move there is a moment where the page has the new week
    // and the old week's boxes.
    const weekHere = fits?.ok && !loading && read.days.every(d => days[d.date])

    const matches = read ? matchTillLines({ lines: read.lines, tenders, remembered }) : []
    const unknown = matches.filter(m => !m.key)
    const waiting = unknown.filter(m => !answers[m.name]?.key)

    const places = {}
    for (const m of matches) places[m.name] = m.key || answers[m.name]?.key || null

    const plan = weekHere && !waiting.length
        ? planSalesImport({ read, places, days, shownTenders, trackingPlatforms, today: todayISO() })
        : null

    const stage = !read ? 'pick'
        : !fits.ok ? 'refused'
        : !weekHere ? 'opening'
        : unknown.length && !asked ? 'ask'
        : 'ready'

    const toFill = plan ? Object.keys(plan.days).length : 0

    async function fill() {
        setBusy(true)
        setError('')

        // Only "this is our row", and only rows answered in this file. A
        // mistake put under another row is not kept, so the next one is asked
        // about rather than quietly put in the same place.
        const remember = unknown
            .filter(m => answers[m.name]?.remember && answers[m.name]?.key !== 'out')
            .map(m => ({
                restaurant_id: restaurantId,
                name: m.name,
                tender_key: answers[m.name].key,
                created_by: user?.id,
            }))

        if (remember.length) {
            const { error: failed } = await supabase
                .from('sales_tender_names')
                .upsert(remember, { onConflict: 'restaurant_id,name' })
            if (failed) { setBusy(false); setError(friendlyError(failed)); return }
        }

        setBusy(false)
        onFill(plan.days)
    }

    return (
        <Modal title="Upload the till's report" onClose={onClose} width="max-w-lg">
            <div className="px-6 py-4">
                {error && <ErrorBanner className="mb-3">{error}</ErrorBanner>}

                {stage === 'pick' && (
                    <div>
                        <p className="text-sm text-muted mb-3">
                            The week of {shortDate(weekStart)} to {shortDate(weekEnd)}. The file says
                            which week and which restaurant it is for, so a wrong one is turned away
                            before anything changes. Nothing is saved until you press Save week.
                        </p>
                        <label className={labelClass} htmlFor="till-sales-file">
                            The Weekly Sales Summary, exported as XML
                        </label>
                        <input
                            id="till-sales-file"
                            type="file"
                            accept=".xml,text/xml,application/xml"
                            disabled={busy}
                            className={fieldClass}
                            onChange={e => take(e.target.files?.[0])}
                        />
                        {busy && <p className="text-xs text-muted mt-2">Reading...</p>}

                        <Steps />
                    </div>
                )}

                {stage === 'refused' && (
                    <div>
                        <p className="text-sm text-gray-900 mb-3">{refusal(fits, weekStart, weekEnd)}</p>
                    </div>
                )}

                {stage === 'opening' && (
                    <p className="text-sm text-muted">Opening the week of {shortDate(read.from)}...</p>
                )}

                {stage === 'ask' && (
                    <Questions
                        read={read}
                        unknown={unknown}
                        active={active}
                        restaurantName={restaurantName}
                        answers={answers}
                        onAnswer={(name, answer) => setAnswers(was => ({ ...was, [name]: answer }))}
                    />
                )}

                {stage === 'ready' && plan && <Ready read={read} plan={plan} />}
            </div>

            <div className={modalFooter}>
                {stage === 'refused' && (
                    <>
                        <button type="button" onClick={startAgain} className={secondaryButton}>
                            Choose another file
                        </button>
                        {/* The week opens on this week and the report is for
                            the one before, so this is the usual way in rather
                            than a mistake. The file stays read. */}
                        {fits.why === 'week' && (
                            <button
                                type="button"
                                onClick={() => onGoToWeek(fits.from)}
                                className={primaryButton('md', 'good')}
                            >
                                Open {shortDate(fits.from)} to {shortDate(fits.to)}
                            </button>
                        )}
                    </>
                )}
                {stage === 'ask' && (
                    <>
                        <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                        <button
                            type="button"
                            disabled={waiting.length > 0}
                            onClick={() => setAsked(true)}
                            className={primaryButton()}
                        >
                            {waiting.length ? `${waiting.length} still to answer` : 'Continue'}
                        </button>
                    </>
                )}
                {stage === 'ready' && (
                    <>
                        {unknown.length > 0 && (
                            <button type="button" onClick={() => setAsked(false)} className={secondaryButton}>
                                Back
                            </button>
                        )}
                        <button type="button" onClick={onClose} className={secondaryButton}>
                            {toFill ? 'Cancel' : 'Close'}
                        </button>
                        {toFill > 0 && (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={fill}
                                className={primaryButton('md', 'good')}
                            >
                                {busy ? 'Filling in...' : 'Fill in the week'}
                            </button>
                        )}
                    </>
                )}
                {(stage === 'pick' || stage === 'opening') && (
                    <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                )}
            </div>
        </Modal>
    )
}

function dayLabel(date) {
    return `${DAY_NAMES[new Date(date + 'T00:00:00').getDay()]} ${shortDate(date)}`
}

function dayList(dates) {
    const names = dates.map(dayLabel)
    if (names.length <= 1) return names[0] || ''
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// Why a file was turned away, one sentence per mistake.
function refusal(fits, weekStart, weekEnd) {
    if (fits.why === 'week') {
        return `That file is for ${shortDate(fits.from)} to ${shortDate(fits.to)}, `
            + `and this is the week of ${shortDate(weekStart)} to ${shortDate(weekEnd)}.`
    }
    if (fits.why === 'range') {
        return `That file covers ${fullDate(fits.from)} to ${fullDate(fits.to)}. `
            + 'It has to be one week, Sunday to Saturday, so export it again for just the one week.'
    }
    if (fits.why === 'restaurant') {
        return `That file says it is for ${fits.found}, which is not the restaurant you are in.`
    }
    if (fits.why === 'not-sales') {
        return 'That file is not the Weekly Sales Summary. If it is the hours report, '
            + 'it goes in on the Timesheet.'
    }
    return 'That file does not look like a till report. Nothing in it says which week it covers.'
}

// A line on the till the Hub cannot place. Where its money goes, and whether
// that is the answer every week or only this once.
function Questions({ read, unknown, active, restaurantName, answers, onAnswer }) {
    return (
        <div>
            <p className="text-sm text-muted mb-4">
                The till has {unknown.length === 1 ? 'a line' : 'lines'} this restaurant does not
                have a row for. Say where the money goes, or leave it out.
            </p>

            {unknown.map(m => {
                const answer = answers[m.name] || {}
                const row = active.find(t => t.key === answer.key)
                const spread = lineByDay(read, m.name)
                const total = spread.reduce((t, d) => t + d.amount, 0)
                const guess = active.find(t => t.key === m.guess)

                return (
                    <div key={m.name} className="mb-4 pb-4 border-b border-border last:border-b-0 last:mb-0 last:pb-0">
                        <div className="flex items-baseline justify-between gap-3 mb-1">
                            <p className="text-sm font-semibold text-gray-900 break-words">{m.name}</p>
                            <p className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                                {fmtMoney(total)}
                            </p>
                        </div>
                        <p className="text-xs text-muted mb-2">
                            {guess
                                ? `Looks like your ${guess.label} row under the till's own name.`
                                : m.retired
                                    ? `${m.name} is retired at ${restaurantName}, so this was probably rung up by mistake.`
                                    : `${restaurantName} has no ${m.name} row on its till receipt.`}
                            {/* The days only when there are few enough to
                                read. A mistake is usually one day, and that
                                day is what somebody needs to go and check;
                                CASH on all seven is just a list of numbers. */}
                            {spread.length > 0 && spread.length <= 3 && (
                                <>
                                    {' '}
                                    {spread.map(d => `${dayLabel(d.date)} ${fmtMoney(d.amount)}`).join(', ')}.
                                </>
                            )}
                            {spread.length > 3 && (
                                <>
                                    {' '}
                                    {spread.length === read.days.length ? 'Every day this week.' : `On ${spread.length} days this week.`}
                                </>
                            )}
                        </p>

                        <label className="sr-only" htmlFor={`place-${m.name}`}>Where {m.name} goes</label>
                        <select
                            id={`place-${m.name}`}
                            className={compactField}
                            value={answer.key || ''}
                            onChange={e => {
                                const key = e.target.value || null
                                onAnswer(m.name, key ? { key, remember: key === m.guess } : null)
                            }}
                        >
                            <option value="">Put it under...</option>
                            {active.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                            <option value="out">Leave it out</option>
                        </select>

                        {row && (
                            <label className={`${checkRow} mt-2 cursor-pointer`}>
                                <input
                                    type="checkbox"
                                    checked={!!answer.remember}
                                    onChange={e => onAnswer(m.name, { ...answer, remember: e.target.checked })}
                                    className={checkbox}
                                />
                                <span className="text-sm text-gray-700">
                                    Remember that {m.name} on the till is our {row.label}.
                                    Leave this off for a mistake.
                                </span>
                            </label>
                        )}

                        {answer.key === 'out' && total !== 0 && (
                            <p className="text-xs text-accent-ink mt-2">
                                {dayList(spread.map(d => d.date))} will not add up, and the
                                Reconciliation row will show it.
                            </p>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

// What filling it in will do, before it does it.
function Ready({ read, plan }) {
    const gross = read.days.reduce((t, d) => t + num(d.gross), 0)
    const net = read.days.reduce((t, d) => t + num(d.net), 0)
    const toFill = Object.keys(plan.days).length
    const unexplained = plan.outBy.filter(o => !plan.leftOut.some(l => l.dates.includes(o.date)))

    return (
        <div>
            <p className="text-sm text-gray-900 mb-1">
                <strong>{shortDate(read.from)} to {shortDate(read.to)}</strong>, {read.restaurant}
            </p>
            <p className="text-sm text-muted mb-3 tabular-nums">
                Gross {fmtMoney(gross)} · Net {fmtMoney(net)}
            </p>

            {toFill === 0 && (
                <p className="text-sm text-gray-900 mb-3">
                    Everything here already matches the till&apos;s report. There is nothing to fill in.
                </p>
            )}

            <ul className="text-sm text-gray-900 space-y-1.5 mb-3">
                {plan.filled.length > 0 && (
                    <Line tick>{plan.filled.length} day{plan.filled.length === 1 ? '' : 's'} to fill in</Line>
                )}
                {plan.same.length > 0 && toFill > 0 && (
                    <Line quiet>{plan.same.length} already exactly the same</Line>
                )}
                {plan.changed.map(c => (
                    <Line key={c.date} warn>
                        <strong>{dayLabel(c.date)}</strong> will change:{' '}
                        {c.diffs.map(d => `${d.label} ${fmtMoney(d.was)} here, ${fmtMoney(d.now)} on the till`).join('; ')}
                    </Line>
                ))}
                {plan.opened.map(o => (
                    <Line key={o.date} warn>
                        <strong>{dayLabel(o.date)}</strong> was marked closed. The till took {fmtMoney(o.gross)},
                        so it will be opened.
                    </Line>
                ))}
                {plan.leftOut.map(l => (
                    <Line key={l.name} warn>
                        {l.name}, {fmtMoney(l.total)}, left out. {dayList(l.dates)} will not add up.
                    </Line>
                ))}
                {unexplained.map(o => (
                    <Line key={o.date} warn>
                        <strong>{dayLabel(o.date)}</strong> does not add up on the till&apos;s own report,
                        {' '}{fmtMoney(o.amount)} out.
                    </Line>
                ))}
                {plan.nothing.length > 0 && (
                    <Line quiet>
                        {dayList(plan.nothing)}: nothing on the till, so left empty. Tick Closed if you were shut.
                    </Line>
                )}
                {plan.kept.length > 0 && (
                    <Line quiet>
                        {dayList(plan.kept)}: nothing on the till, and there are figures here. Left as they are.
                    </Line>
                )}
                {plan.notOver.length > 0 && (
                    <Line quiet>
                        {dayList(plan.notOver)}: not over yet, so left for later.
                    </Line>
                )}
                {toFill > 0 && plan.outBy.length === 0 && (
                    <Line tick>Every day adds up to its gross</Line>
                )}
            </ul>

            {toFill > 0 && (
                <p className="text-xs text-muted">
                    The online platforms and staff food are not in this report and stay as they are.
                    Nothing is saved until you press Save week.
                </p>
            )}
        </div>
    )
}

// Where the file comes from, because nobody remembers a path through somebody
// else's till.
function Steps() {
    const steps = [
        'In Pixel Point, press Sales on the right, then Weekly Sales Summary Report.',
        'Set it to one week, Sunday to Saturday.',
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

const Line = ({ children, tick, quiet, warn }) => (
    <li className="flex gap-2">
        <span className={quiet ? 'text-muted' : warn ? 'text-accent-ink' : 'text-green-700'}>
            {quiet ? '–' : warn ? '!' : tick ? '✓' : '•'}
        </span>
        <span className={quiet ? 'text-muted' : ''}>{children}</span>
    </li>
)
