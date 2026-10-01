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
function answer({ changedAt, head = HEAD }) {
    db.from.mockImplementation(table => {
        if (table === 'weekly_reports') {
            const chain = makeQuery({ data: [], error: null })
            chain.single = vi.fn(() => Promise.resolve({ data: head, error: null }))
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
