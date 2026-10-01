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
const WEEK_AFTER = '2026-10-04'

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
let user
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user }) }))
vi.mock('@/context/restaurant', () => ({ useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Point Campus' } }) }))

const { default: ClaimsPage } = await import('./ClaimsPage')

beforeEach(() => {
    user = { id: 'u1', role: 'store_manager' }
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

    // A week is closed once its report is sent, and money put into it is in
    // no report at all. So it comes off the first week whose report has not
    // gone out, and says which delivery it is from. His decision of 1 October.
    it('moves it to the first week still open when that week\'s report has been sent, and says so', async () => {
        tables.weekly_reports = [{ id: 'w1', restaurant_id: 'r1', week_start: DELIVERY_WEEK, status: 'published' }]
        const { row } = await attach()
        expect(row).toMatchObject({ amount: 22.34, counted_week: NOTED_WEEK })
        expect(await screen.findByText(
            `The report for the week of ${shortDate(DELIVERY_WEEK)} has already been sent, `
            + `so €22.34 is coming off the week of ${shortDate(NOTED_WEEK)} instead, `
            + `shown as from the delivery in the week of ${shortDate(DELIVERY_WEEK)}.`,
        )).toBeInTheDocument()
    })

    // Written at the door on the day, so already in the delivery's week. With
    // that week sent it used to stay there, in no report at all.
    it('skips every week already sent, wherever the note was written', async () => {
        tables.invoice_line_claims = [{ ...CLAIM, raised_on: DELIVERED, counted_week: DELIVERY_WEEK }]
        tables.weekly_reports = [
            { id: 'w1', restaurant_id: 'r1', week_start: DELIVERY_WEEK, status: 'published' },
            { id: 'w2', restaurant_id: 'r1', week_start: NOTED_WEEK, status: 'published' },
            { id: 'w3', restaurant_id: 'r2', week_start: WEEK_AFTER, status: 'published' },
        ]
        const { row } = await attach()
        expect(row).toMatchObject({ amount: 22.34, counted_week: WEEK_AFTER })
    })

    it('still moves it when that week\'s report is only a draft', async () => {
        tables.weekly_reports = [{ id: 'w1', restaurant_id: 'r1', week_start: DELIVERY_WEEK, status: 'draft' }]
        const { row } = await attach()
        expect(row).toMatchObject({ counted_week: DELIVERY_WEEK })
    })
})

// Once put against its line, a claim whose delivery's report had already gone
// out comes off a later week. The row says which, and which delivery it is
// from, so nobody looks for it in the wrong report.
describe('a claim coming off a later week', () => {
    it('says which week, and which delivery it is from', async () => {
        tables.invoice_line_claims = [{
            ...CLAIM, invoice_id: 'i1', invoice_line_id: 'line1', amount: 22.34, counted_week: NOTED_WEEK,
        }]
        renderWithRouter(<ClaimsPage />)
        expect(await screen.findByText(
            `Comes off the week of ${shortDate(NOTED_WEEK)}, from the delivery in the week of ${shortDate(DELIVERY_WEEK)}.`,
        )).toBeInTheDocument()
    })

    it('says nothing when it comes off the delivery\'s own week', async () => {
        tables.invoice_line_claims = [{
            ...CLAIM, invoice_id: 'i1', invoice_line_id: 'line1', amount: 22.34, counted_week: DELIVERY_WEEK,
        }]
        renderWithRouter(<ClaimsPage />)
        await screen.findByText('COKE ZERO 24X330ML')
        expect(screen.queryByText(/^Comes off the week of/)).toBeNull()
    })
})

// An employee sees the notes they took at the door and nothing about money.
// Once a manager matches one to a line it carries what it was worth and what
// came back, so they read it through my_claims, which leaves the euros out.
describe('an employee looking at their own', () => {
    // What my_claims gives: no amount, nothing credited, no invoice.
    const MINE = {
        id: 'c2', restaurant_id: 'r1', supplier_id: 's1', kind: 'damaged', what: 'Two bags of rice split',
        cases: 0, units: 2, docket_number: null, raised_on: '2026-09-29', status: 'open', note: null,
    }
    const DONE = { ...MINE, id: 'c3', what: 'Lettuce warm', status: 'settled' }

    beforeEach(() => {
        user = { id: 'u2', role: 'employee' }
        db.from.mockClear()
        tables.my_claims = [MINE, DONE]
        tables.invoice_line_claims = []
    })

    it('reads them without the money, and never the table', async () => {
        renderWithRouter(<ClaimsPage />)
        await screen.findByText('Two bags of rice split')
        const asked = db.from.mock.calls.map(([table]) => table)
        expect(asked).toContain('my_claims')
        expect(asked).not.toContain('invoice_line_claims')
        expect(asked).not.toContain('invoices')
    })

    it('still says which are waiting and which are finished', async () => {
        renderWithRouter(<ClaimsPage />)
        const waiting = (await screen.findByText('Still waiting')).closest('div').parentElement
        expect(waiting).toHaveTextContent('Two bags of rice split')
        expect(waiting).not.toHaveTextContent('Lettuce warm')
        expect((await screen.findByText('Finished')).parentElement).toHaveTextContent('Lettuce warm')
    })
})
