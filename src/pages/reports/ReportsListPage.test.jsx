// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { mockSupabase, renderWithRouter } from '@/test/helpers'
import { todayISO, weekStartOf, addDays, weekDates, weekRange } from '@/lib/dates'

// What a week that cannot be started says about itself.
//
// The week that showed it: every day typed in, seven people with rostered
// shifts and nothing said on the timesheet, and the badge reading "Sales not
// finished" beside the full net sales. The sentence under it was right and the
// badge was not, because the badge never asked which of the two was missing.

const LAST_WEEK = addDays(weekStartOf(todayISO()), -7)

const db = mockSupabase({
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
})

describe('a week with no sales at all', () => {
    it('still says the sales, first', async () => {
        const row = await rowFor(addDays(LAST_WEEK, -7))
        expect(within(row).getByText('Sales not finished')).toBeInTheDocument()
        expect(within(row).getByRole('button', { name: 'Open weekly sales' })).toBeInTheDocument()
    })
})
