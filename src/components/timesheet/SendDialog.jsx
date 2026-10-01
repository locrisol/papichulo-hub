import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { todayISO, addDays, shortDate, stampDateTime } from '@/lib/dates'
import { periodWords, periodIsOver, periodDates } from '@/lib/payPeriod'
import { personWeek, unanswered, personPeriod } from '@/lib/timesheet'
import { timesheetPdf } from '@/lib/timesheetPdf'
import { sendTimesheet, sentWords } from '@/lib/timesheetMail'
import { friendlyError } from '@/lib/errors'
import Modal from '@/components/ui/Modal'
import ErrorBanner from '@/components/ui/ErrorBanner'
import AutoTextarea from '@/components/ui/AutoTextarea'
import Recipients from '@/components/reports/Recipients'
import {
    modalFooter, secondaryButton, primaryButton, labelClass, fieldClass,
} from '@/lib/controlStyles'

// Sending the hours to whoever does the payroll.
//
// **A pay period, not a week.** His, 23 September 2026: the payroll runs every
// two weeks and always has, so a weekly mail left her adding two of them
// together before she could run anything. The Hub still works in weeks
// everywhere else, because a roster and a report and a week's takings are
// weeks. Only what leaves the building changed.
//
// **Hours and comments. No money, and nothing about the roster.** The rate on
// an employee is what they cost the company, not what they are paid, and the
// accountant has no use for a plan she cannot check. Both are enforced where
// the mail is built, and said here so somebody pressing the button knows what
// they are sending.
//
// The list is the restaurant's own and nobody is on it by role. It is not the
// report's list: that one carries the week's takings and goes to the owners.
//
// `canSend` is whether this person sends it, which is a store manager or a
// super admin, the same as the report. An owner gets the PDF and the list to
// read, and none of the sending: the mail function refuses them and the list
// is kept on the restaurant row, which they cannot change. What the fortnight
// is missing is said to both, because the PDF is missing it too.
export default function SendDialog({
    period, restaurant, filedAt, canSend = true, onClose, onKeepList, onSent,
}) {
    const [extras, setExtras] = useState(restaurant?.timesheet_recipients || [])
    const [comment, setComment] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [said, setSaid] = useState('')

    // **The block has to cover both weeks, so both weeks are read here.**
    //
    // The screen behind this one shows one week and knows only about that one.
    // A period that went out with a day nobody accounted for in its other half
    // would be exactly the thing the block exists to stop, so the dialog asks
    // for the whole fourteen days itself rather than trusting what is on
    // screen.
    const [loading, setLoading] = useState(true)
    const [waiting, setWaiting] = useState([])
    // Kept from the same read the block uses, so the paper and the mail are
    // built from one set of rows rather than two.
    const [rows, setRows] = useState(null)
    const [making, setMaking] = useState(false)

    useEffect(() => {
        if (!period || !restaurant?.id) return
        let alive = true

        async function look() {
            const start = period.start
            const end = period.end

            const [team, worked, away, planned, marks] = await Promise.all([
                supabase.from('employees')
                    .select('id, full_name, sort_order, started_on, ended_on')
                    .eq('restaurant_id', restaurant.id).order('sort_order'),
                supabase.from('timesheet_entries')
                    .select('*').eq('restaurant_id', restaurant.id)
                    .gte('work_date', start).lte('work_date', end),
                supabase.from('absences')
                    .select('*').eq('restaurant_id', restaurant.id)
                    .lte('starts_on', end).gte('ends_on', start),
                supabase.from('roster_shifts')
                    .select('*').eq('restaurant_id', restaurant.id)
                    .gte('shift_date', start).lte('shift_date', end),
                supabase.from('timesheet_weeks')
                    .select('week_start, imported_at').eq('restaurant_id', restaurant.id)
                    .in('week_start', period.weeks),
            ])

            if (!alive) return

            const failed = team.error || worked.error || away.error || planned.error
            if (failed) { setError(friendlyError(failed)); setLoading(false); return }

            const imported = new Set(
                (marks.data || []).filter(m => m.imported_at).map(m => m.week_start),
            )

            // One week at a time, because personWeek is what the screen uses
            // and a second way of deciding whether a day is answered is a
            // second way for the two to disagree.
            const open = period.weeks.flatMap(weekStart => {
                const people = (team.data || []).filter(p => (
                    (!p.ended_on || p.ended_on >= weekStart)
                    && (!p.started_on || p.started_on <= addDays(weekStart, 6))
                ))
                const rows = people.map(person => personWeek({
                    person,
                    weekStart,
                    entries: worked.data || [],
                    absences: away.data || [],
                    shifts: planned.data || [],
                    imported: imported.has(weekStart),
                }))
                return unanswered(rows).map(one => ({ ...one, weekStart }))
            })

            setWaiting(open)
            setRows({
                people: (team.data || []).filter(p => (
                    (!p.ended_on || p.ended_on >= start) && (!p.started_on || p.started_on <= end)
                )),
                entries: worked.data || [],
                absences: away.data || [],
            })
            setLoading(false)
        }

        look()
        return () => { alive = false }
    }, [period, restaurant?.id])

    // A period with a day nobody has accounted for is a period with the wrong
    // hours on it, and the wrong hours are worse than late ones.
    const blocked = waiting.length > 0
    // Said apart, because they want different answers: a day with nothing
    // said about it, and a clock in with no clock out.
    const unsaid = waiting.filter(w => w.days.length || w.changed.length)
    const noClockOut = waiting.filter(w => w.open.length)
    // Nothing goes out for a fortnight that has not finished, the same rule the
    // grid follows about a week.
    const unfinished = period ? !periodIsOver(period.start, todayISO()) : false

    // On screen straight away, and back to what it was if it was not kept, so
    // the list showing is always the list it goes to.
    async function keep(list) {
        const before = extras
        setExtras(list)
        setError('')
        const failed = await onKeepList(list)
        if (failed) {
            setExtras(before)
            setError(failed)
        }
    }

    // The paper for her files, built from the rows already read for the block
    // so the mail and the PDF cannot be about two different fortnights.
    async function draw(save) {
        return timesheetPdf({
            restaurant,
            periodStart: period.start,
            people: personPeriod({ ...rows, dates: periodDates(period.start) }),
            save,
        })
    }

    async function paper() {
        setMaking(true)
        setError('')
        try {
            await draw(true)
        } catch (err) {
            setError(err.message || 'That PDF could not be made.')
        }
        setMaking(false)
    }

    async function go(test) {
        setBusy(true)
        setError('')
        setSaid('')
        try {
            // The mail goes with the paper on it, a test included: a
            // rehearsal that arrived without the attachment would not be a
            // rehearsal of the thing being sent.
            const doc = await draw(false)

            const result = await sendTimesheet({
                periodStart: period.start,
                restaurantId: restaurant?.id,
                comment,
                test,
                pdf: doc.output('blob'),
            })
            setSaid(sentWords(result, { test }))
            if (!test) onSent()
        } catch (err) {
            setError(err.message || 'That could not be sent.')
        }
        setBusy(false)
    }

    const title = canSend ? 'Send the hours' : 'Download the hours'

    // Nobody has said when the pay runs, so there is no period to send. The way
    // out is one date in settings, said here rather than left as a dead button.
    if (!period) {
        return (
            <Modal title={title} onClose={onClose} width="max-w-lg">
                <div className="px-6 py-4">
                    <p className="text-sm text-gray-900 font-semibold mb-2">
                        Nobody has said when the pay period starts.
                    </p>
                    <p className="text-sm text-muted">
                        The hours go out a pay period at a time, which is always a fortnight, so the
                        Hub needs one date to count from. Any period start will do, however long
                        ago, and it never has to be touched again.
                    </p>
                    {/* Settings is a store manager's page, so an owner sent
                        there would only be told they cannot open it. */}
                    {!canSend && (
                        <p className="text-sm text-muted mt-2">
                            Ask a store manager to set it in the restaurant settings.
                        </p>
                    )}
                </div>
                <div className={modalFooter}>
                    <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                    {canSend && (
                        <Link to="/settings/restaurant" className={primaryButton('md', 'good')}>
                            Set it in settings
                        </Link>
                    )}
                </div>
            </Modal>
        )
    }

    return (
        <Modal title={title} onClose={onClose} width="max-w-lg">
            <div className="px-6 py-4">
                {error && <ErrorBanner className="mb-3">{error}</ErrorBanner>}

                <p className="text-sm font-semibold text-gray-900">
                    {periodWords(period.start)}
                </p>
                <p className="text-sm text-muted mb-4">
                    A pay period, which is two weeks: {shortDate(period.weeks[0])} to{' '}
                    {shortDate(addDays(period.weeks[0], 6))} and {shortDate(period.weeks[1])} to{' '}
                    {shortDate(period.end)}. Clock in and clock out as the till recorded them, to
                    the second, with anything you wrote about a day. No money, and nothing about
                    what anybody was rostered for.
                </p>

                {!canSend && (
                    <p className="text-xs text-muted mb-4">
                        Only a store manager can send the hours. You can still download the PDF.
                    </p>
                )}

                {canSend && filedAt && !said && (
                    <p className="text-xs text-muted mb-4">
                        Last sent {stampDateTime(filedAt)}. Sending again replaces nothing; it is a
                        second mail with whatever the period says now.
                    </p>
                )}

                {unfinished && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 text-xs text-amber-800">
                        <strong className="font-bold">This period has not finished yet.</strong>{' '}
                        {canSend ? (
                            <>
                                It runs to {shortDate(period.end)}. You can still send it, and a test
                                is always safe, but the days after today have nothing on them.
                            </>
                        ) : (
                            <>
                                It runs to {shortDate(period.end)}, and the days after today have
                                nothing on them.
                            </>
                        )}
                    </div>
                )}

                {loading && (
                    <p className="text-xs text-muted mb-4">Checking both weeks...</p>
                )}

                {blocked && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 text-xs text-amber-800 space-y-1">
                        {unsaid.length > 0 && (
                            <p>
                                <strong className="font-bold">
                                    {headCount(unsaid) === 1 ? 'One person has' : `${headCount(unsaid)} people have`} a
                                    day in this period with nothing said about it.
                                </strong>{' '}
                                {names(unsaid)}.
                                {canSend && (
                                    <>
                                        {' '}The period cannot go out until each one has times, time off, or
                                        a comment.
                                    </>
                                )}
                            </p>
                        )}
                        {noClockOut.length > 0 && (
                            <p>
                                <strong className="font-bold">
                                    {names(noClockOut)} {headCount(noClockOut) === 1 ? 'has' : 'have'} a clock
                                    in with no clock out.
                                </strong>
                                {canSend && (
                                    <>
                                        {' '}The period cannot go out until each one has a clock out time.
                                    </>
                                )}
                            </p>
                        )}
                        {canSend && <p>A test can still be sent.</p>}
                    </div>
                )}

                <Recipients
                    title="Who gets the hours"
                    extras={extras}
                    canEdit={canSend}
                    busy={busy}
                    onChange={keep}
                    note={(
                        <>
                            Nobody is on this list by role, and it is not the report&apos;s list: that
                            one carries the week&apos;s takings and goes to the owners.
                            {canSend && (
                                <>
                                    {' '}You get a copy of every send, so you can see it arrive, and
                                    replies come back to you.
                                </>
                            )}
                        </>
                    )}
                />

                {canSend && (
                    <div className="mt-4">
                        <label className={labelClass} htmlFor="timesheet-note">
                            Anything to say at the top of it
                        </label>
                        <AutoTextarea
                            id="timesheet-note"
                            minRows={2}
                            disabled={busy}
                            className={fieldClass}
                            placeholder="Two corrections in week two, both explained on the day..."
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                        />
                    </div>
                )}

                {said && (
                    <p className="text-sm font-semibold text-green-700 mt-4">{said}</p>
                )}
            </div>

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>
                    {said ? 'Done' : 'Cancel'}
                </button>
                {/* The same fortnight as a piece of paper, in the shape of the
                    sheet he has kept by hand for years: summary on top, then
                    everybody in turn. */}
                <button
                    type="button"
                    disabled={loading || making || !rows}
                    onClick={paper}
                    className={secondaryButton}
                >
                    {making ? 'Making it...' : 'Download the PDF'}
                </button>
                {/* A test goes to the same list, with the period on it and a
                    band saying it is a rehearsal, because a test that goes
                    somewhere else tests nothing about the list. */}
                {canSend && (
                    <>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => go(true)}
                            className={secondaryButton}
                        >
                            {busy ? 'Sending...' : 'Send a test'}
                        </button>
                        <button
                            type="button"
                            disabled={busy || loading || blocked}
                            onClick={() => go(false)}
                            className={`${primaryButton('md', 'good')} disabled:opacity-50`}
                            title={!blocked ? undefined
                                : unsaid.length ? 'The period has a day nobody has accounted for'
                                    : 'The period has a clock in with no clock out'}
                        >
                            {busy ? 'Sending...' : 'Send it'}
                        </button>
                    </>
                )}
            </div>
        </Modal>
    )
}

// Who is holding it up, in the order they appear, and never a list so long it
// stops being read.
function names(waiting) {
    const all = [...new Set(waiting.map(w => w.person.full_name))]
    if (all.length <= 3) return all.join(', ')
    return `${all.slice(0, 3).join(', ')} and ${all.length - 3} more`
}

// How many people, once each. The list is a week at a time, so somebody
// holding up both weeks of the period is in it twice.
function headCount(waiting) {
    return new Set(waiting.map(w => w.person.full_name)).size
}
