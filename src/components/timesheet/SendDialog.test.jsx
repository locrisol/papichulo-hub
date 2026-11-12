// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockSupabase, renderWithRouter } from '@/test/helpers'
import { periodOf } from '@/lib/payPeriod'
import { todayISO, addDays, weekStartOf } from '@/lib/dates'
import { weekAsSent } from '@/lib/timesheet'

// The dialog behind Send the hours. Nothing in the fortnight unless a test
// puts something there, so nothing holds the send up and the only question is
// who is offered what.

const tables = {}
const db = mockSupabase(tables)
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))

const { default: SendDialog } = await import('./SendDialog')

const PERIOD = periodOf('2026-09-07', '2026-09-06')
const RESTAURANT = { id: 'r1', name: 'Point Campus', timesheet_recipients: ['payroll@example.ie'] }

beforeEach(() => {
    for (const table of Object.keys(tables)) delete tables[table]
})

function open(props = {}) {
    return renderWithRouter(
        <SendDialog
            period={PERIOD}
            restaurant={RESTAURANT}
            onClose={() => {}}
            onKeepList={async () => ''}
            onSent={() => {}}
            {...props}
        />,
    )
}

// Ana was down to work the first day of the fortnight and nothing has been
// said about it, which is what holds a period up.
function anaNeverAnswered() {
    tables.employees = { data: [{ id: 'e1', full_name: 'Ana', sort_order: 0 }], error: null }
    tables.roster_shifts = {
        data: [{ id: 's1', employee_id: 'e1', shift_date: PERIOD.start, start_time: '09:00', end_time: '17:00' }],
        error: null,
    }
}

describe('who is offered the send', () => {
    it('gives a store manager both sends and the list', async () => {
        open({ canSend: true })
        await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled())
        expect(screen.getByRole('button', { name: 'Send a test' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Add somebody else' })).toBeInTheDocument()
        expect(screen.getByText(/You get a copy of every send/)).toBeInTheDocument()
    })

    // The mail function refuses an owner and the list lives on the restaurant,
    // which an owner cannot change. So an owner gets the paper and is told who
    // sends it, rather than a dialog of buttons that only ever say no.
    it('gives an owner the PDF and no send', async () => {
        open({ canSend: false })
        await waitFor(() => expect(screen.getByRole('button', { name: 'Download the PDF' })).toBeEnabled())
        expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Send a test' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Add somebody else' })).not.toBeInTheDocument()
        expect(screen.getByText(/Only a store manager can send the hours/)).toBeInTheDocument()
    })

    // Nothing is sent to an owner, so a line saying they get a copy of every
    // send would not be true.
    it('does not tell an owner they get a copy of every send', async () => {
        open({ canSend: false })
        await waitFor(() => expect(screen.getByRole('button', { name: 'Download the PDF' })).toBeEnabled())
        expect(screen.queryByText(/You get a copy of every send/)).not.toBeInTheDocument()
    })

    // Settings is a store manager's page, so the link would only open the
    // screen that says they cannot be there.
    it('does not send an owner to settings for the pay period', () => {
        open({ canSend: false, period: null })
        expect(screen.queryByRole('link', { name: 'Set it in settings' })).not.toBeInTheDocument()
        expect(screen.getByText(/Ask a store manager/)).toBeInTheDocument()
    })
})

describe('what is said about the fortnight', () => {
    // An owner downloads the paper, so they need to know when it is not the
    // whole fortnight as much as anybody sending it does. Only the words about
    // sending are left out.
    it('tells an owner the period has not finished, without the sending', async () => {
        open({ canSend: false, period: periodOf(todayISO(), '2026-09-06') })
        expect(await screen.findByText('This period has not finished yet.')).toBeInTheDocument()
        expect(screen.getByText(/the days after today have nothing on them/)).toBeInTheDocument()
        expect(screen.queryByText(/You can still send it/)).not.toBeInTheDocument()
    })

    it('tells an owner who has a day with nothing said, without the sending', async () => {
        anaNeverAnswered()
        open({ canSend: false })
        expect(await screen.findByText(/One person has a day in this period/)).toBeInTheDocument()
        expect(screen.getByText(/Ana/)).toBeInTheDocument()
        expect(screen.queryByText(/cannot go out/)).not.toBeInTheDocument()
    })

    it('tells a store manager the same, and that it cannot go out yet', async () => {
        anaNeverAnswered()
        open({ canSend: true })
        expect(await screen.findByText(/One person has a day in this period/)).toBeInTheDocument()
        expect(screen.getByText(/cannot go out/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    })
})

// The hours go every week now (his, 9 November 2026): week 1 on its own once
// it has finished, the pay period whole after week 2, and one button that
// picks by the date.
describe('week 1 on its own', () => {
    const thisWeek = weekStartOf(todayISO())
    // A pay period whose week 1 was last week, and one whose week 1 is now.
    const running = () => periodOf(todayISO(), addDays(thisWeek, -7))
    const fresh = () => periodOf(todayISO(), thisWeek)

    it('sends week 1 on its own while the pay period is running, with no PDF', async () => {
        open({ canSend: true, period: running() })
        expect(await screen.findByText(/^Week 1 of 2:/)).toBeInTheDocument()
        expect(screen.getByText(/This sends week 1 on its own/)).toBeInTheDocument()
        const send = screen.getByRole('button', { name: 'Send week 1' })
        await waitFor(() => expect(send).toBeEnabled())
        const uploads = db.storage.from.mock.calls.length
        const posts = db.functions.invoke.mock.calls.length
        await userEvent.click(send)
        await waitFor(() => expect(db.functions.invoke.mock.calls.length).toBe(posts + 1))
        expect(db.functions.invoke.mock.calls.at(-1)[1].body).toMatchObject({ scope: 'week', attachment: null })
        expect(db.storage.from.mock.calls.length).toBe(uploads)
    })

    // Sent halfway through, every shift after it would come back in red as
    // added. A test is a rehearsal and can go any time.
    it('holds a real week 1 back until it has finished', async () => {
        open({ canSend: true, period: fresh() })
        expect(await screen.findByText('Week 1 has not finished yet.')).toBeInTheDocument()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Send a test' })).toBeEnabled())
        expect(screen.getByRole('button', { name: 'Send week 1' })).toBeDisabled()
    })

    // Once the pay period has gone it goes whole, even before it finishes.
    it('sends the whole pay period again once it has gone', async () => {
        const period = running()
        tables.timesheet_weeks = {
            data: period.weeks.map(week_start => ({ week_start, filed_at: '2026-11-02T09:00:00Z' })),
            error: null,
        }
        open({ canSend: true, period })
        expect(await screen.findByText('This period has not finished yet.')).toBeInTheDocument()
        expect(screen.getByText(/You can still send it/)).toBeInTheDocument()
        expect(screen.getByText(/marked Corrected/)).toBeInTheDocument()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled())
    })
})

// Ana worked 8 hours on Monday 7 September when week 1 went on its own, and 9
// now. The pay period is over, so it goes whole, and says so in red first.
describe('what changed since week 1 was sent', () => {
    const team = [{ id: 'e1', full_name: 'Ana', sort_order: 0 }]
    const day = ends => ({
        id: 't1', employee_id: 'e1', work_date: '2026-09-07', starts_at: '09:00:00', ends_at: ends,
        hours: ends === '17:00:00' ? 8 : 9, kind: 'worked', source: 'typed',
    })
    function sentWith(ends, now) {
        tables.employees = { data: team, error: null }
        tables.timesheet_entries = { data: [day(now)], error: null }
        tables.timesheet_weeks = { data: [{ week_start: '2026-09-06', filed_at: '2026-09-14T09:00:00Z' }], error: null }
        tables.timesheet_sends = {
            data: [{
                week_start: '2026-09-06', scope: 'week', sent_at: '2026-09-14T09:00:00Z', shape: 1, held: false,
                people: weekAsSent({ team, entries: [day(ends)], periodStart: PERIOD.start, weekStart: '2026-09-06' }),
            }],
            error: null,
        }
    }

    it('says in red what changed, before anybody presses Send', async () => {
        sentWith('17:00:00', '18:00:00')
        open({ canSend: true })
        expect(await screen.findByText(/Week 1 has changed since it was sent on/)).toBeInTheDocument()
        expect(screen.getByText(/Ana: worked 8\.00 h then, 9\.00 h now/)).toBeInTheDocument()
        expect(screen.getByText(/The email and the PDF will show this in red/)).toBeInTheDocument()
    })

    it('says week 1 went alone and has not changed', async () => {
        sentWith('18:00:00', '18:00:00')
        open({ canSend: true })
        expect(await screen.findByText(/Week 1 was sent on its own on .* and has not changed since/)).toBeInTheDocument()
        expect(screen.queryByText(/has changed since/)).not.toBeInTheDocument()
    })

    // A failed read of the copies is said, and never holds the send up.
    it('says when it could not check, and still lets it go', async () => {
        tables.timesheet_sends = { data: null, error: { message: 'no such table' } }
        open({ canSend: true })
        expect(await screen.findByText(/could not check whether the sent weeks have changed/)).toBeInTheDocument()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled())
    })
})

describe('keeping the list', () => {
    // The address used to be taken off the screen and stay off, while the
    // database still had it, so the list on screen was not the list it sends
    // to.
    it('puts the list back when it could not be kept', async () => {
        open({ canSend: true, onKeepList: async () => 'That could not be saved, so nothing has changed.' })
        await userEvent.click(screen.getByRole('button', { name: 'Remove payroll@example.ie from the list' }))

        await waitFor(() => expect(screen.getByText('That could not be saved, so nothing has changed.')).toBeInTheDocument())
        expect(screen.getByText('payroll@example.ie')).toBeInTheDocument()
    })

    // One Escape in the address box shut the box and the whole dialog, and
    // a comment typed into the dialog went with it.
    it('shuts only the address box on Escape', async () => {
        const onClose = vi.fn()
        open({ canSend: true, onClose })
        await userEvent.click(screen.getByRole('button', { name: 'Add somebody else' }))
        await userEvent.keyboard('{Escape}')

        expect(screen.getByRole('button', { name: 'Add somebody else' })).toBeInTheDocument()
        expect(onClose).not.toHaveBeenCalled()
    })
})

// A clock in on the Tuesday and no clock out, and nothing rostered, so that is
// the only thing holding the period.
describe('a period held by a clock in with no clock out', () => {
    // The button used to give the reason for the other block, a day nobody has
    // accounted for, which sent him looking for a day that was not there.
    it('says so on the button', async () => {
        tables.employees = {
            data: [{ id: 'e1', full_name: 'Aoife', sort_order: 0, started_on: '2026-01-01', ended_on: null }],
            error: null,
        }
        tables.timesheet_entries = {
            data: [{
                id: 't1', employee_id: 'e1', work_date: '2026-09-08',
                starts_at: '09:00:00', ends_at: null, kind: 'worked', source: 'typed',
            }],
            error: null,
        }
        open({ canSend: true })
        await screen.findByText(/has a clock in with no clock out/)
        const send = screen.getByRole('button', { name: 'Send' })
        expect(send).toBeDisabled()
        expect(send).toHaveAttribute('title', 'The period has a clock in with no clock out')
    })
})
