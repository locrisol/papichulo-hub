import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { todayISO, addDays, shortDate, stampDateTime, stampDay, weekRange } from '@/lib/dates'
import { periodWords, periodIsOver, periodDates } from '@/lib/payPeriod'
import {
    personWeek, unanswered, personPeriod, peopleFor, weekAsSent, earlierSends, sendScope, weekOneOver, changeShort,
} from '@/lib/timesheet'
import { timesheetPdf } from '@/lib/timesheetPdf'
import { permissionList, DEFAULT_RULES } from '@/lib/workRules'
import { sendTimesheet, sentWords } from '@/lib/timesheetMail'
import { friendlyError } from '@/lib/errors'
import Modal from '@/components/ui/Modal'
import ErrorBanner from '@/components/ui/ErrorBanner'
import Notice from '@/components/ui/Notice'
import AutoTextarea from '@/components/ui/AutoTextarea'
import Recipients from '@/components/reports/Recipients'
import {
    modalFooter, secondaryButton, primaryButton, labelClass, fieldClass,
} from '@/lib/controlStyles'

// Sending the hours to whoever does the payroll.
//
// **The payroll is run from a pay period, never a week.** His, 23 September
// 2026: the payroll runs every two weeks, and nobody should add two weekly
// mails together to run it. **Since 9 November 2026 week 1 also goes on its
// own** once it has finished, for the owners' records and saying it is not
// for the payroll yet, and the whole pay period still goes after week 2 with
// the PDF. One button: while the pay period is running and has not gone it
// sends week 1, after that the pay period (his call, sendScope). Anything
// changed in a week since an email carried it is listed here in red before
// it goes, and the email and the PDF say it too.
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
    period, restaurant, canSend = true, onClose, onKeepList, onSent,
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
    // When each week last went, and what changed in each since (earlierSends).
    // `unchecked` when the copies could not be read: said, and never a block.
    const [filed, setFiled] = useState({})
    const [earlier, setEarlier] = useState([])
    const [unchecked, setUnchecked] = useState(false)

    useEffect(() => {
        if (!period || !restaurant?.id) return
        let alive = true

        async function look() {
            const start = period.start
            const end = period.end

            const [team, worked, away, planned, marks, sends] = await Promise.all([
                // Where each stands on permission to work as well, for the
                // list everybody employed is on (his, 1 November 2026).
                supabase.from('employees')
                    .select('id, full_name, sort_order, started_on, ended_on, work_permission, work_permission_expires, permission_renewal_applied')
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
                    .select('week_start, imported_at, filed_at').eq('restaurant_id', restaurant.id)
                    .in('week_start', period.weeks),
                supabase.from('timesheet_sends')
                    .select('week_start, scope, sent_at, shape, people, held').eq('restaurant_id', restaurant.id)
                    .in('week_start', period.weeks)
                    .order('sent_at', { ascending: false }),
            ])

            if (!alive) return

            // The week marks decide which email this is, so a failure there
            // is said and the dialog goes no further: a guess would send
            // week 1 on its own after the pay period had gone.
            const failed = team.error || worked.error || away.error || planned.error || marks.error
            if (failed) { setError(friendlyError(failed)); setLoading(false); return }

            const imported = new Set(
                (marks.data || []).filter(m => m.imported_at).map(m => m.week_start),
            )

            // One week at a time, because personWeek is what the screen uses
            // and a second way of deciding whether a day is answered is a
            // second way for the two to disagree.
            //
            // Somebody from another restaurant is held to the same rules as
            // anybody: a clock in with no clock out holds the period for her.
            const open = period.weeks.flatMap(weekStart => {
                const people = peopleFor(team.data, worked.data, weekStart, addDays(weekStart, 6))
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

            // Each week as it is now, laid over the last real email that
            // carried it. The same code the function runs before it sends.
            const filedAt = Object.fromEntries((marks.data || []).map(m => [m.week_start, m.filed_at]))
            setFiled(filedAt)
            setUnchecked(Boolean(sends.error))
            setEarlier(sends.error ? [] : earlierSends({
                weeks: period.weeks.map(weekStart => ({
                    weekStart,
                    now: weekAsSent({
                        team: team.data, entries: worked.data, absences: away.data, periodStart: start, weekStart,
                    }),
                })),
                sends: sends.data || [],
                filed: filedAt,
            }))

            setWaiting(open)
            setRows({
                // The team employed in the period, then anybody from another
                // restaurant with a shift in it: the same people the mail
                // lists (peopleFor, copied into the function).
                people: peopleFor(team.data, worked.data, start, end),
                entries: worked.data || [],
                absences: away.data || [],
                team: team.data || [],
            })
            setLoading(false)
        }

        look()
        return () => { alive = false }
    }, [period, restaurant?.id])

    const today = todayISO()
    // Which email this is. An owner only ever downloads the paper here, and
    // the paper is the pay period's, however far it has got.
    const scope = canSend ? sendScope({ period, today, filed }) : 'period'
    const single = scope === 'week'
    // A real week 1 waits for its Saturday to be over; a test does not.
    const tooSoon = single && !weekOneOver(period, today)

    // A period with a day nobody has accounted for is a period with the wrong
    // hours on it, and the wrong hours are worse than late ones. Week 1 on
    // its own is held up by week 1 alone.
    const holding = single ? waiting.filter(w => w.weekStart === period.weeks[0]) : waiting
    const blocked = holding.length > 0
    // Said apart, because they want different answers: a day with nothing
    // said about it, and a clock in with no clock out.
    const unsaid = holding.filter(w => w.days.length || w.changed.length)
    const noClockOut = holding.filter(w => w.open.length)
    // The pay period goes whole once it has finished. It only opens before
    // then when it has already gone, or for an owner's paper.
    const unfinished = period && !single ? !periodIsOver(period.start, today) : false

    // What the emails before this one said, and what has changed since.
    const again = (single
        ? earlier.filter(e => e?.week === 0 && e.scope === 'week')
        : earlier.filter(e => e?.scope === 'period'))
    const alone = !single && !again.length && earlier[0]?.scope === 'week' ? earlier[0] : null
    const sentOn = stamp => shortDate(stampDay(stamp))
    const changes = (again.length ? again : alone ? [alone] : [])
        .flatMap(e => (e.changes || []).map(c => ({ ...c, week: e.week })))

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
    // so the mail and the PDF cannot be about two different fortnights. With
    // what changed since each week went, in red at the top and on the days.
    async function draw(save) {
        return timesheetPdf({
            restaurant,
            periodStart: period.start,
            people: personPeriod({ ...rows, dates: periodDates(period.start) }),
            permissions: permissionList(rows.team, today, restaurant?.roster_rules?.permissionGrace || DEFAULT_RULES.permissionGrace),
            today,
            save,
            earlier,
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
            // The pay period goes with the paper on it, a test included: a
            // rehearsal that arrived without the attachment would not be a
            // rehearsal of the thing being sent. Week 1 on its own has none.
            const doc = single ? null : await draw(false)

            const result = await sendTimesheet({
                periodStart: period.start,
                restaurantId: restaurant?.id,
                comment,
                test,
                pdf: doc ? doc.output('blob') : null,
                scope,
            })
            setSaid(sentWords(result, { test, scope }))
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
                        No pay period start date is set.
                    </p>
                    <p className="text-sm text-muted">
                        Hours are sent one pay period (two weeks) at a time, so the Hub needs a date
                        to count from. Any pay period start date will do, however long ago.
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

                {single ? (
                    <>
                        <p className="text-sm font-semibold text-gray-900">
                            Week 1 of 2: {weekRange(period.weeks[0])}
                        </p>
                        <p className="text-sm text-muted mb-4">
                            Pay period {periodWords(period.start)}. This sends week 1 on its own: the
                            table of hours, with no PDF, saying it is not for the payroll yet. The whole
                            pay period, with the PDF, is sent once week 2 has finished. No money, and
                            nothing about what anybody was rostered for.
                        </p>
                    </>
                ) : (
                    <>
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
                    </>
                )}

                {!canSend && (
                    <p className="text-xs text-muted mb-4">
                        Only a store manager can send the hours. You can still download the PDF.
                    </p>
                )}

                {canSend && again.length > 0 && !said && (
                    <p className="text-xs text-muted mb-4">
                        {single
                            ? `Week 1 was last sent ${stampDateTime(again[0].sentAt)}. Sending again sends a new week 1 email, marked Corrected, with what changed.`
                            : `The pay period was last sent ${stampDateTime(filed[period.weeks[1]] || again[0].sentAt)}. Sending again sends it whole, marked Corrected, with anything that changed in red.`}
                    </p>
                )}

                {/* What changed in a week since an email carried it (his, 9
                    November 2026), before anybody presses Send. */}
                {changes.length > 0 && (
                    <Notice tone="urgent" className="mb-4 space-y-1">
                        <p>
                            <strong className="font-bold">
                                {again.length
                                    ? `Changed since it was sent on ${sentOn(again[0].sentAt)}.`
                                    : `Week 1 has changed since it was sent on ${sentOn(alone.sentAt)}.`}
                            </strong>
                        </p>
                        {changes.map(c => (
                            <p key={`${c.week}:${c.id}`}>
                                {!single && again.length ? `Week ${c.week + 1}, ` : ''}{changeShort(c)}
                            </p>
                        ))}
                        <p>
                            {single
                                ? 'The new email will say what changed.'
                                : 'The email and the PDF will show this in red, with what each was when sent.'}
                        </p>
                    </Notice>
                )}

                {alone && Array.isArray(alone.changes) && alone.changes.length === 0 && (
                    <Notice tone="info" className="mb-4">
                        Week 1 was sent on its own on {sentOn(alone.sentAt)} and has not changed since.
                    </Notice>
                )}

                {unchecked && (
                    <p className="text-xs text-muted mb-4">
                        The Hub could not check whether the sent weeks have changed. The email will still
                        say so if they have.
                    </p>
                )}

                {canSend && tooSoon && (
                    <Notice tone="warn" className="mb-4">
                        <strong className="font-bold">Week 1 has not finished yet.</strong>{' '}
                        It runs to {shortDate(addDays(period.start, 6))}. It can be sent once it has, and a
                        test is always safe.
                    </Notice>
                )}

                {unfinished && (
                    <Notice tone="warn" className="mb-4">
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
                    </Notice>
                )}

                {loading && (
                    <p className="text-xs text-muted mb-4">{single ? 'Checking week 1...' : 'Checking both weeks...'}</p>
                )}

                {blocked && (
                    <Notice tone="warn" className="mb-4 space-y-1">
                        {unsaid.length > 0 && (
                            <p>
                                <strong className="font-bold">
                                    {headCount(unsaid) === 1 ? 'One person has' : `${headCount(unsaid)} people have`} a
                                    day in {single ? 'week 1' : 'this period'} with nothing said about it.
                                </strong>{' '}
                                {names(unsaid)}.
                                {canSend && (
                                    <>
                                        {' '}{single ? 'Week 1' : 'The period'} cannot go out until each one has
                                        times, time off, or a comment.
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
                                        {' '}{single ? 'Week 1' : 'The period'} cannot go out until each one has
                                        a clock out time.
                                    </>
                                )}
                            </p>
                        )}
                        {canSend && <p>A test can still be sent.</p>}
                    </Notice>
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
                            one carries the week&apos;s takings and goes to the owners. Everybody on this
                            list gets both emails: week 1 on its own, and the whole pay period after week 2.
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
                            Note (optional)
                        </label>
                        <AutoTextarea
                            id="timesheet-note"
                            minRows={2}
                            disabled={busy}
                            className={fieldClass}
                            placeholder={single
                                ? 'For example, one correction on Thursday, explained on the day'
                                : 'For example, two corrections in week 2, both explained on the day'}
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
                            disabled={busy || loading || blocked || tooSoon}
                            onClick={() => go(false)}
                            className={`${primaryButton('md', 'good')} disabled:opacity-50`}
                            title={tooSoon ? 'Week 1 has not finished yet'
                                : !blocked ? undefined
                                    : unsaid.length ? `${single ? 'Week 1' : 'The period'} has a day nobody has accounted for`
                                        : `${single ? 'Week 1' : 'The period'} has a clock in with no clock out`}
                        >
                            {busy ? 'Sending...' : single ? 'Send week 1' : 'Send'}
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
