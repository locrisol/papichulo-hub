// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, within, fireEvent } from '@testing-library/react'
import { mockSupabase, makeQuery, renderWithRouter } from '@/test/helpers'
import { todayISO, weekStartOf, addDays, weekDates, weekRange } from '@/lib/dates'

// What a week that cannot be started says about itself.
//
// The week that showed it: every day typed in, seven people with rostered
// shifts and nothing said on the timesheet, and the badge reading "Sales not
// finished" beside the full net sales. The sentence under it was right and the
// badge was not, because the badge never asked which of the two was missing.

const LAST_WEEK = addDays(weekStartOf(todayISO()), -7)
// Two weeks before that, published with a mail that never went, and the one
// before it sent the ordinary way.
const NOT_SENT = addDays(LAST_WEEK, -14)
const SENT = addDays(LAST_WEEK, -21)

const db = mockSupabase({
    weekly_reports: {
        data: [
            { id: 'rep1', week_start: NOT_SENT, status: 'published', published_at: `${NOT_SENT}T09:00:00Z`, send_count: 1, sent_to: null },
            { id: 'rep2', week_start: SENT, status: 'published', published_at: `${SENT}T09:00:00Z`, send_count: 1, sent_to: ['owner@papichulo.ie'] },
        ],
        error: null,
    },
    // Every day of last week entered, and no other week at all.
    sales_records: {
        data: weekDates(LAST_WEEK).map(date => ({
            sale_date: date, gross_sales: 100, net_sales: 90, tender_sales: { cash: 100 }, is_closed: false,
        })),
        error: null,
    },
    sales_tenders: {
        data: [{ key: 'cash', label: 'Cash Sales', sort_order: 1, is_active: true, counts_toward_gross: true }],
        error: null,
    },
    employees: {
        data: [{ id: 'e1', full_name: 'Aoife', hourly_rate: 15, sort_order: 0, started_on: '2026-01-01', ended_on: null }],
        error: null,
    },
    roster_shifts: {
        data: [{ id: 's1', employee_id: 'e1', shift_date: addDays(LAST_WEEK, 2), starts_at: '09:00', ends_at: '17:00' }],
        error: null,
    },
    // A clock in typed on the Thursday and no clock out.
    timesheet_entries: {
        data: [{
            id: 't1', employee_id: 'e1', work_date: addDays(LAST_WEEK, 4),
            starts_at: '09:00:00', ends_at: null, kind: 'worked', source: 'typed',
        }],
        error: null,
    },
})
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'store_manager' } }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Testville' } }),
}))

const { default: ReportsListPage } = await import('./ReportsListPage')

// The table row for a week. The phone cards are in the page too, hidden by
// CSS, so the table is found by its heading first.
async function rowFor(weekStart) {
    renderWithRouter(<ReportsListPage />)
    const table = (await screen.findAllByRole('table'))[0]
    return within(table).getByText(weekRange(weekStart)).closest('tr')
}

describe('a week with its sales in and its timesheet not', () => {
    it('says the timesheet is what is not finished', async () => {
        const row = await rowFor(LAST_WEEK)
        expect(within(row).getByText('Timesheet not finished')).toBeInTheDocument()
        expect(within(row).queryByText('Sales not finished')).toBeNull()
    })

    it('sends you to the timesheet', async () => {
        const row = await rowFor(LAST_WEEK)
        expect(within(row).getByRole('button', { name: 'Open the timesheet' })).toBeInTheDocument()
    })

    // The phone card used to print the missing days sentence whatever was in
    // the way, and with no missing days that came out as " and undefined have
    // no figures yet."
    it('names the person on the phone as well, not the days', async () => {
        renderWithRouter(<ReportsListPage />)
        const said = await screen.findAllByText(/Aoife has a rostered shift with nothing said on the timesheet/)
        expect(said).toHaveLength(2)
        expect(screen.queryByText(/undefined/)).toBeNull()
    })

    // It used to count as an answer and say nothing at all.
    it('names a clock in with no clock out', async () => {
        renderWithRouter(<ReportsListPage />)
        const said = await screen.findAllByText(/Aoife has a clock in with no clock out on the timesheet/)
        expect(said).toHaveLength(2)
    })

    // The mock above hands back every column whatever was asked for, so the
    // test before this one passes without the id. A row read without it is
    // never counted as saved, and the week could be started on live.
    it('reads each entry with its id', async () => {
        renderWithRouter(<ReportsListPage />)
        await screen.findAllByText(/Aoife has a clock in with no clock out/)
        const at = db.from.mock.calls.findIndex(([table]) => table === 'timesheet_entries')
        const [columns] = db.from.mock.results[at].value.select.mock.calls[0]
        expect(columns.split(', ')).toContain('id')
    })
})

describe('a week published whose mail never went', () => {
    it('says it was not sent, rather than Sent', async () => {
        const row = await rowFor(NOT_SENT)
        expect(within(row).getByText('Not sent')).toBeInTheDocument()
        expect(within(row).queryByText('Sent')).toBeNull()
    })

    it('still says Sent for one that went', async () => {
        const row = await rowFor(SENT)
        expect(within(row).getByText('Sent')).toBeInTheDocument()
    })
})

// Starting a week carries the sections, the overheads and the open actions
// over from the week before. When that read failed it came back as nothing,
// and the week started as if it were the restaurant's first: no overheads, no
// actions, and the next week carrying on from this one, so they were gone.
describe('starting a week when the week before cannot be read', () => {
    const usual = db.from.getMockImplementation()
    afterEach(() => db.from.mockImplementation(usual))

    it('says so and starts nothing', async () => {
        const inserts = []
        db.from.mockImplementation(table => {
            // No shifts and no clock in still open, so last week is ready
            // to start.
            if (table === 'roster_shifts' || table === 'timesheet_entries') return makeQuery({ data: [], error: null })
            if (table === 'weekly_reports') {
                const chain = makeQuery({ data: [], error: null })
                chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: { message: 'The week before could not be read' } }))
                chain.insert = vi.fn(() => { inserts.push(table); return chain })
                return chain
            }
            return usual(table)
        })

        const row = await rowFor(LAST_WEEK)
        fireEvent.click(within(row).getByRole('button', { name: 'Start' }))
        expect(await screen.findByText('The week before could not be read')).toBeInTheDocument()
        expect(inserts).toEqual([])
    })
})

describe('a week with no sales at all', () => {
    it('still says the sales, first', async () => {
        const row = await rowFor(addDays(LAST_WEEK, -7))
        expect(within(row).getByText('Sales not finished')).toBeInTheDocument()
        expect(within(row).getByRole('button', { name: 'Open weekly sales' })).toBeInTheDocument()
    })
})
