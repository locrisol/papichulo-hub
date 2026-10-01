// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeQuery, renderWithRouter, tableOf } from '@/test/helpers'
import { shortDate } from '@/lib/dates'

// A case of Coke Zero short on the Saturday delivery, written down at the door
// on the Sunday, which is already the next week. Invented figures.

const DELIVERED = '2026-09-26'
const DELIVERY_WEEK = '2026-09-20'
const NOTED_WEEK = '2026-09-27'

const CLAIM = {
    id: 'c1', restaurant_id: 'r1', supplier_id: 's1', kind: 'short', what: 'COKE ZERO 24X330ML',
    cases: 1, units: 0, docket_number: '45690932', raised_on: '2026-09-27', status: 'open',
    amount: null, credited_amount: 0, counted_week: NOTED_WEEK, invoice_id: null, invoice_line_id: null,
}

const INVOICE = {
    id: 'i1', restaurant_id: 'r1', invoice_number: '45690932', invoice_date: DELIVERED, supplier_id: 's1',
    document_type: 'invoice', total_amount: 442.46,
    invoice_lines: [{
        id: 'line1', raw_description: 'COKE ZERO 24X330ML', price_per_case: 18.16, units_per_case: 24,
        unit_price: 0.7567, line_total: 18.16, vat_amount: 4.18, deposit_amount: 0, supplier_code: '123456',
    }],
}

let tables
let updated
const db = {
    from: vi.fn(table => {
        const q = tableOf(tables[table] || [])
        q.update = vi.fn(row => {
            updated.push({ table, row })
            return makeQuery({ data: null, error: null })
        })
        return q
    }),
}

vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'store_manager' } }) }))
vi.mock('@/context/restaurant', () => ({ useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Point Campus' } }) }))

const { default: ClaimsPage } = await import('./ClaimsPage')

beforeEach(() => {
    updated = []
    tables = {
        suppliers: [{ id: 's1', name: 'Sysco Ireland', is_active: true }],
        invoice_line_claims: [CLAIM],
        invoices: [INVOICE],
        weekly_reports: [],
    }
})

async function attach() {
    renderWithRouter(<ClaimsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'That is the one' }))
    await waitFor(() => expect(updated).toHaveLength(1))
    return updated[0]
}

describe('putting a note from the door against its line', () => {
    it('takes it off the week the delivery landed in, as the screen says', async () => {
        const { table, row } = await attach()
        expect(table).toBe('invoice_line_claims')
        expect(row).toMatchObject({ invoice_line_id: 'line1', amount: 22.34, counted_week: DELIVERY_WEEK })
        expect(await screen.findByText('€22.34 is coming off the week that delivery landed in.')).toBeInTheDocument()
    })

    // A week is closed once its report is sent. The money stays in the week
    // the note was written, and the screen says why.
    it('leaves it where it was when that week\'s report has been sent, and says so', async () => {
        tables.weekly_reports = [{ id: 'w1', restaurant_id: 'r1', week_start: DELIVERY_WEEK, status: 'published' }]
        const { row } = await attach()
        expect(row).toMatchObject({ amount: 22.34, counted_week: NOTED_WEEK })
        expect(await screen.findByText(
            `The report for the week of ${shortDate(DELIVERY_WEEK)} has already been sent, `
            + `so €22.34 is coming off the week of ${shortDate(NOTED_WEEK)} instead.`,
        )).toBeInTheDocument()
    })

    // The usual case: written at the door on the day, so already in the
    // delivery's week. Nothing moves, and "instead" of itself would be wrong.
    it('says the money is in no report when the note is in a week already sent', async () => {
        tables.invoice_line_claims = [{ ...CLAIM, raised_on: DELIVERED, counted_week: DELIVERY_WEEK }]
        tables.weekly_reports = [{ id: 'w1', restaurant_id: 'r1', week_start: DELIVERY_WEEK, status: 'published' }]
        const { row } = await attach()
        expect(row).toMatchObject({ amount: 22.34, counted_week: DELIVERY_WEEK })
        expect(await screen.findByText(
            `The report for the week of ${shortDate(DELIVERY_WEEK)} has already been sent, so €22.34 is not in it.`,
        )).toBeInTheDocument()
    })

    it('still moves it when that week\'s report is only a draft', async () => {
        tables.weekly_reports = [{ id: 'w1', restaurant_id: 'r1', week_start: DELIVERY_WEEK, status: 'draft' }]
        const { row } = await attach()
        expect(row).toMatchObject({ counted_week: DELIVERY_WEEK })
    })
})
