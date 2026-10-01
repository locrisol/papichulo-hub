// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { mockSupabase, makeQuery, renderWithRouter } from '@/test/helpers'
import { addDays, todayISO, weekStartOf } from '@/lib/dates'

// The line in People and operations saying a new allergen sheet is due, and
// the recipients card read beside it.
//
// The two came from one read of the restaurant. Merging deploys straight to
// the live site, and until migration 023 is run there the two allergen columns
// do not exist, so that read failed and took the typed recipients with it. A
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
// the live database has not got yet.
function answer({ changedAt, head = HEAD, failing = [], waiting = {} }) {
    db.from.mockImplementation(table => {
        if (failing.includes(table)) {
            return makeQuery({ data: null, error: { message: `Could not read ${table}` } })
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

describe('the report before migration 023 is run', () => {
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
        expect(screen.getByText(/could not be read, so it cannot go out/)).toBeInTheDocument()
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

        fireEvent.click(await screen.findByRole('button', { name: 'Send it' }))
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

        fireEvent.click(await screen.findByRole('button', { name: 'Re-open' }))
        await waitFor(() => expect(confirmed).toHaveBeenCalled())
        const { message } = confirmed.mock.calls[0][0]
        expect(message).not.toMatch(/correction to everyone/)
        expect(message).toMatch(/Nobody got it the first time/)
    })

    it('still warns of a correction once a send has reached somebody', async () => {
        answer({ changedAt: { data: null, error: null }, head: { ...notSent, sent_to: ['owner@example.ie'] } })
        confirmed.mockClear()
        renderReport()

        fireEvent.click(await screen.findByRole('button', { name: 'Re-open to correct it' }))
        await waitFor(() => expect(confirmed).toHaveBeenCalled())
        expect(confirmed.mock.calls[0][0].message).toMatch(/mails a correction to everyone who got the first/)
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
