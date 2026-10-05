// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { mockSupabase, makeQuery, renderWithRouter } from '@/test/helpers'
import { addDays, todayISO, weekStartOf } from '@/lib/dates'

// The line in People and operations saying a new allergen sheet is due, and
// the recipients card read beside it.
//
// The two came from one read of the restaurant, and on a database without the
// allergen sheet columns that read failed and took the typed recipients with it. A
// manager adding one back would then have saved a list of one over the whole
// stored list.

const WEEK = addDays(weekStartOf(todayISO()), -7)

const HEAD = {
    id: 'rep1', restaurant_id: 'r1', week_start: WEEK, status: 'draft', send_count: 0, figures: null,
    report_sections: [
        { id: 's1', key: 'people_ops', title: 'People and operations', sort_order: 1, report_items: [] },
    ],
}

const db = mockSupabase({})
// The real everyRow, paging through the mock the way it pages through the API.
vi.mock('@/lib/supabase', async importOriginal => ({
    everyRow: (await importOriginal()).everyRow,
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'store_manager', restaurant_id: 'r1' } }) }))
const confirmed = vi.fn(() => Promise.resolve(true))
vi.mock('@/context/confirm', () => ({ useConfirm: () => confirmed }))

let restaurant
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: restaurant }),
}))

const { default: ReportPage } = await import('./ReportPage')

// The report itself answers .single(); the year of reports behind it for the
// charts is a list. The restaurant row fails when it is asked for a column
// the live database has not got yet. `items` is the one chain every write to
// the report's lines goes through, for a test to look at.
function answer({ changedAt, head = HEAD, failing = [], waiting = {}, lines = [], claims = [], items = null }) {
    db.from.mockImplementation(table => {
        if (failing.includes(table)) {
            return makeQuery({ data: null, error: { message: `Could not read ${table}` } })
        }
        if (table === 'invoice_line_claims') return makeQuery({ data: claims, error: null })
        if (table === 'report_items' && items) return items
        // Invoice lines nobody has decided on Review, honouring the date they
        // are asked up to, the way the database would.
        if (table === 'invoice_lines') {
            const chain = makeQuery({ data: lines, error: null })
            let upTo = null
            chain.lte = vi.fn((column, value) => { upTo = value; return chain })
            chain.then = (resolve, reject) => Promise.resolve({
                data: lines.filter(l => !upTo || l.invoices.invoice_date <= upTo), error: null,
            }).then(resolve, reject)
            return chain
        }
        // A read still on its way: it answers when the test lets it.
        if (waiting[table]) {
            const chain = makeQuery({ data: [], error: null })
            chain.then = (resolve, reject) => waiting[table].then(() => ({ data: [], error: null })).then(resolve, reject)
            return chain
        }
        if (table === 'weekly_reports') {
            const chain = makeQuery({ data: [], error: null })
            chain.single = vi.fn(() => Promise.resolve(failing.includes('the report')
                ? { data: null, error: { message: 'Could not read the report' } }
                : { data: head, error: null }))
            return chain
        }
        if (table === 'restaurants') {
            const chain = makeQuery({ data: { report_recipients: ['accounts@example.ie'] }, error: null })
            chain.select = vi.fn(columns => {
                if (/allergen_sheet/.test(columns)) {
                    const missing = { data: null, error: { message: 'column restaurants.allergen_sheet_printed_at does not exist' } }
                    return makeQuery(missing)
                }
                return chain
            })
            return chain
        }
        return makeQuery({ data: [], error: null })
    })
    db.rpc.mockImplementation(() => Promise.resolve(changedAt))
}

function renderReport() {
    return renderWithRouter(
        <Routes><Route path="/reports/:id" element={<ReportPage />} /></Routes>,
        { route: '/reports/rep1' },
    )
}

beforeEach(() => {
    restaurant = { id: 'r1', name: 'Testville' }
})

describe('the report on a database without the allergen sheet columns', () => {
    it('still shows the typed recipients', async () => {
        answer({ changedAt: { data: null, error: { message: 'Could not find the function public.allergens_changed_at' } } })
        renderReport()
        expect(await screen.findByText('accounts@example.ie')).toBeInTheDocument()
    })

    it('says nothing about the allergen sheet', async () => {
        answer({ changedAt: { data: null, error: { message: 'Could not find the function public.allergens_changed_at' } } })
        renderReport()
        await screen.findByText('accounts@example.ie')
        expect(screen.queryByText(/Allergen sheet/)).toBeNull()
    })
})

// A read that fails used to come back as nothing. No platforms read meant no
// delivery costs, and the week's earnings went up by all of them; no team read
// meant the paperwork said there was nobody to check. Publish then froze that
// and mailed it to the owners and the accountant.
describe('a read that fails', () => {
    const fine = { changedAt: { data: null, error: null } }

    it('says so and will not publish what it has', async () => {
        answer({ ...fine, failing: ['employees'] })
        renderReport()
        expect(await screen.findByText('Could not read employees')).toBeInTheDocument()
        expect(screen.getByText(/could not be loaded, so it cannot be sent/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Publish and send' })).toBeDisabled()
    })

    it('says so on the first read of the platforms, rather than drawing a week without them', async () => {
        answer({ ...fine, failing: ['sales_platforms'] })
        renderReport()
        expect(await screen.findByText('Could not read sales_platforms')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Publish and send' })).toBeNull()
    })

    // A comment saved reloads the whole week. The hold used to lift the moment
    // that reload started, so for the few seconds the year of history takes,
    // Publish would freeze the paperwork with nobody in it.
    it('keeps Publish held while the reload after a write is still reading', async () => {
        answer({ ...fine, failing: ['employees'] })
        renderReport()
        await screen.findByText('Could not read employees')
        const publish = screen.getByRole('button', { name: 'Publish and send' })
        expect(publish).toBeDisabled()

        let letItThrough
        const team = new Promise(resolve => { letItThrough = resolve })
        answer({ ...fine, waiting: { employees: team } })
        const box = screen.getByPlaceholderText('Add a comment')
        fireEvent.change(box, { target: { value: 'Two new starters on Monday' } })
        fireEvent.blur(box)

        await waitFor(() => expect(db.from.mock.calls.filter(([t]) => t === 'employees')).toHaveLength(2))
        expect(publish).toBeDisabled()

        // And it lifts once a reload has read the whole week.
        letItThrough()
        await waitFor(() => expect(publish).toBeEnabled())
    })

    it('holds Publish when the report itself cannot be read again after a write', async () => {
        answer(fine)
        renderReport()
        const publish = await screen.findByRole('button', { name: 'Publish and send' })
        expect(publish).toBeEnabled()

        answer({ ...fine, failing: ['the report'] })
        const box = screen.getByPlaceholderText('Add a comment')
        fireEvent.change(box, { target: { value: 'Two new starters on Monday' } })
        fireEvent.blur(box)

        expect(await screen.findByText('Could not read the report')).toBeInTheDocument()
        expect(publish).toBeDisabled()
    })

    // The standing list read as empty, and adding one address saved a list of
    // one over it, dropping the accountant from every week after.
    it('will not change who gets it when that list could not be read', async () => {
        answer({ ...fine, failing: ['restaurants'] })
        renderReport()
        expect(await screen.findByText('Could not read restaurants')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Add somebody else/ })).toBeNull()
    })
})

// A report frozen and published whose mail did not go out. Sending it from
// here is the same report mailed for the first time, so nothing about it is
// written again: the count stays at one and the owners get no correction.
describe('a report published but not sent', () => {
    const notSent = {
        ...HEAD, status: 'published', send_count: 1, sent_to: null, published_at: `${WEEK}T09:00:00Z`,
        figures: { net: 1000, gross: 1100, version: 3, paperwork: { food: [], permits: [] } },
    }

    it('sends it as it was frozen, and writes nothing to the report', async () => {
        answer({ changedAt: { data: null, error: null }, head: notSent })
        db.functions.invoke.mockClear()
        db.functions.invoke.mockResolvedValue({ data: { sent: 2 }, error: null })
        renderReport()

        fireEvent.click(await screen.findByRole('button', { name: 'Send report' }))
        await waitFor(() => expect(db.functions.invoke).toHaveBeenCalled())

        const [name, { body }] = db.functions.invoke.mock.calls[0]
        expect(name).toBe('weekly-report-email')
        expect(body).toMatchObject({ reportId: 'rep1', test: false })
        expect(body.figures).toBeUndefined()
        const writes = db.from.mock.results
            .filter((r, i) => db.from.mock.calls[i][0] === 'weekly_reports')
            .filter(r => r.value.update.mock.calls.length)
        expect(writes).toHaveLength(0)
        expect(await screen.findByText('Published and sent to 2 people.')).toBeInTheDocument()
    })

    // Nobody got the first one, so publishing it again is not a correction,
    // and the question asked before re-opening must not say it is.
    it('does not warn that re-opening it leads to a correction', async () => {
        answer({ changedAt: { data: null, error: null }, head: notSent })
        confirmed.mockClear()
        renderReport()

        fireEvent.click(await screen.findByRole('button', { name: 'Reopen' }))
        await waitFor(() => expect(confirmed).toHaveBeenCalled())
        const { message } = confirmed.mock.calls[0][0]
        expect(message).not.toMatch(/correction to everyone/)
        expect(message).toMatch(/Nobody got it the first time/)
    })

    it('still warns of a correction once a send has reached somebody', async () => {
        answer({ changedAt: { data: null, error: null }, head: { ...notSent, sent_to: ['owner@example.ie'] } })
        confirmed.mockClear()
        renderReport()

        fireEvent.click(await screen.findByRole('button', { name: 'Reopen report' }))
        await waitFor(() => expect(confirmed).toHaveBeenCalled())
        expect(confirmed.mock.calls[0][0].message).toMatch(/sends a correction to everyone who got the first one/)
    })
})

// His answer of 30 September: the report cannot be sent while anything on
// Review is not actioned, counting only lines on invoices dated up to the
// report's week.
describe('lines still waiting for a decision', () => {
    const fine = { changedAt: { data: null, error: null } }
    const waitingOn = date => ({
        id: `l-${date}`, invoice_id: `i-${date}`, supplier_code: '777001', line_total: 14.5, decision: null,
        invoices: {
            id: `i-${date}`, invoice_number: '45448455', invoice_date: date, supplier_id: 's1',
            document_type: 'invoice', restaurant_id: 'r1', total_amount: 120,
        },
    })

    it('holds Publish while a line from its week is waiting, and says where to decide it', async () => {
        answer({ ...fine, lines: [waitingOn(addDays(WEEK, 2))] })
        renderReport()
        expect(await screen.findByText('1 invoice line from this week or earlier is still waiting for a decision.'))
            .toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Decide them' })).toHaveAttribute('href', '/invoices/import#waiting')
        expect(screen.getByRole('button', { name: 'Publish and send' })).toBeDisabled()
    })

    it('counts a line from a week before as well', async () => {
        answer({ ...fine, lines: [waitingOn(addDays(WEEK, -40)), waitingOn(addDays(WEEK, 6))] })
        renderReport()
        expect(await screen.findByText('2 invoice lines from this week or earlier are still waiting for a decision.'))
            .toBeInTheDocument()
    })

    it('is not held by a line bought after its week', async () => {
        answer({ ...fine, lines: [waitingOn(addDays(WEEK, 7))] })
        renderReport()
        expect(await screen.findByRole('button', { name: 'Publish and send' })).toBeEnabled()
        expect(screen.queryByText(/still waiting for a decision/)).toBeNull()
    })

    it('holds Publish when what is waiting could not be read', async () => {
        answer({ ...fine, failing: ['invoice_lines'] })
        renderReport()
        expect(await screen.findByText('Could not read invoice_lines')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Publish and send' })).toBeDisabled()
    })
})

// Putting claims on the support list is the only place a job the Hub crossed
// off is put back and stale money in its words is brought up to date. The
// lists of what to write have tests of their own; this is the writing.
describe('the support list kept from the claims', () => {
    const fine = { changedAt: { data: null, error: null } }
    const CLAIM = {
        id: 'k1', restaurant_id: 'r1', what: 'Bowls charged 49.73', kind: 'price', amount: 24.75,
        credited_amount: 0, status: 'open', raised_on: WEEK, counted_week: WEEK,
    }
    const STALE = 'Chase the credit for Bowls charged 49.73 (price query) (10.00)'
    const withJob = job => ({
        ...HEAD,
        report_sections: [
            ...HEAD.report_sections,
            { id: 's2', key: 'prices_suppliers', title: 'Prices and suppliers', sort_order: 2, report_items: [] },
            {
                id: 's3', key: 'support_actions', title: 'Support / actions needed', sort_order: 3,
                report_items: [{ id: 'a1', kind: 'action', key: 'claim:k1', sort_order: 0, opened_on: WEEK, ...job }],
            },
        ],
    })

    it('puts back a job the Hub crossed off, with its money brought up to date', async () => {
        const items = makeQuery({ data: null, error: null })
        answer({ ...fine, claims: [CLAIM], items, head: withJob({ done_on: addDays(WEEK, 8), label: STALE }) })
        renderReport()
        fireEvent.click((await screen.findAllByRole('button', { name: 'Update the support list' }))[0])
        await waitFor(() => expect(items.update).toHaveBeenCalledWith({
            done_on: null, label: 'Chase the credit for Bowls charged 49.73 (price query) (€24.75)',
        }))
        expect(items.eq).toHaveBeenCalledWith('id', 'a1')
        expect(items.insert).not.toHaveBeenCalled()
        expect(await screen.findByText('The support list is up to date.')).toBeInTheDocument()
    })

    it('brings the money in the words of a job still open up to date', async () => {
        const items = makeQuery({ data: null, error: null })
        answer({ ...fine, claims: [CLAIM], items, head: withJob({ done_on: null, label: STALE }) })
        renderReport()
        fireEvent.click((await screen.findAllByRole('button', { name: 'Update the support list' }))[0])
        await waitFor(() => expect(items.update).toHaveBeenCalledWith({
            label: 'Chase the credit for Bowls charged 49.73 (price query) (€24.75)',
        }))
        expect(items.eq).toHaveBeenCalledWith('id', 'a1')
    })

    // Somebody rang them and ticked it while the claim is still open.
    it('offers nothing for a job ticked by hand', async () => {
        answer({ ...fine, claims: [CLAIM], head: withJob({ done_on: WEEK, label: STALE }) })
        renderReport()
        await screen.findAllByText('Bowls charged 49.73')
        expect(screen.queryByRole('button', { name: /support list/ })).toBeNull()
    })
})

describe('the allergen sheet line', () => {
    it('says a new one is due, from the restaurant already loaded', async () => {
        restaurant = {
            id: 'r1', name: 'Testville',
            allergen_sheet_printed_at: '2026-06-12T12:00:00Z', allergen_sheet_every_months: 24,
        }
        answer({ changedAt: { data: '2026-06-20T12:00:00Z', error: null } })
        renderReport()
        expect(await screen.findByText(/The allergen information has changed since then/)).toBeInTheDocument()
        expect(screen.getByText('accounts@example.ie')).toBeInTheDocument()
    })
})

// The line by the badge that says where the autosave is up to. It used to go
// on saying "Saved at" with the time of the last write that worked after one
// had failed, so a comment that never reached the database looked kept.
describe('the save line', () => {
    const fine = { changedAt: { data: null, error: null } }

    it('says Not saved once a write fails, rather than the time of the last one', async () => {
        answer({ ...fine, items: makeQuery({ data: null, error: null }) })
        renderReport()
        const box = await screen.findByPlaceholderText('Add a comment')
        fireEvent.change(box, { target: { value: 'Two new starters on Monday' } })
        fireEvent.blur(box)
        expect(await screen.findByText(/^Saved at /)).toBeInTheDocument()

        answer({ ...fine, items: makeQuery({ data: null, error: { message: 'No permission' } }) })
        const again = screen.getByPlaceholderText('Add a comment')
        fireEvent.change(again, { target: { value: 'One leaving on Friday' } })
        fireEvent.blur(again)

        expect(await screen.findByText('Not saved')).toBeInTheDocument()
        expect(screen.queryByText(/^Saved at /)).toBeNull()
    })

    it('does not call a week that could not be read a failed save', async () => {
        answer({ ...fine, failing: ['employees'] })
        renderReport()
        expect(await screen.findByText('Could not read employees')).toBeInTheDocument()
        expect(screen.getByText('Saves as you leave each box')).toBeInTheDocument()
        expect(screen.queryByText('Not saved')).toBeNull()
    })
})
