// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ReportPrices from './ReportPrices'
import { priceWeek } from '@/lib/invoiceReport'

// Prices and suppliers on the weekly report, from a real shape of week: the
// tomatoes got cheaper, the plain wraps came instead of the Santa Maria
// tortillas, the avocados are costed off an old price, and a credit came back
// with nothing logged.

const line = (code, product, date, perCase, units, over = {}) => ({
    id: `${code}-${date}`, invoice_id: `i-${date}`, supplier_code: code, product_id: product.id, products: product,
    price_id: over.priceId || null, raw_description: over.description || product.name.toUpperCase(),
    pack_size: over.pack || null, units_per_case: units, price_per_case: perCase, cases: 1, units: 0, line_no: 1,
    line_total: perCase, decision: 'matched',
    invoices: { id: `i-${date}`, invoice_number: `N${date}`, invoice_date: date, supplier_id: 's1', document_type: 'invoice', total_amount: perCase },
})

const TOMATOES = { id: 'tom', name: 'Tomatoes', unit: 'KG' }
const TORTILLA = { id: 'tor', name: 'Flour Tortilla (Burritos)', unit: 'Units' }
const AVOCADO = { id: 'avo', name: 'Avocado', unit: 'Units' }

const section = priceWeek({
    weekStart: '2026-09-13',
    weekEnd: '2026-09-19',
    lines: [
        line('T', TOMATOES, '2026-09-10', 11.75, 6),
        line('T', TOMATOES, '2026-09-17', 8.6, 6),
        line('497870', TORTILLA, '2026-09-14', 30.3, 100, { priceId: 'santa' }),
        line('5013972', TORTILLA, '2026-09-18', 33.03, 100, { priceId: 'plain', description: 'FLOUR PLAIN WRAPS' }),
        line('A18', AVOCADO, '2026-09-15', 23.29, 18, { priceId: 'avo' }),
    ],
    prices: [
        { id: 'santa', product_id: 'tor', supplier_id: 's1', supplier_code: '497870', price_per_case: 30.3, units_per_case: 100, price_per_unit: 0.303, is_preferred: true },
        { id: 'plain', product_id: 'tor', supplier_id: 's1', supplier_code: '5013972', price_per_case: 33.03, units_per_case: 100, price_per_unit: 0.3303, is_preferred: false },
        { id: 'avo', product_id: 'avo', supplier_id: 's1', supplier_code: 'A18', price_per_case: 16.5, units_per_case: 18, price_per_unit: 0.9167, is_preferred: true },
    ],
    codes: [],
    credits: [{
        id: 'c1', invoice_number: 'C45627172', invoice_date: '2026-09-15', total_amount: -9.27,
        credit_of_invoice_id: null, credit_reason: null, invoice_lines: [{ raw_description: 'RED ONIONS' }],
    }],
    documents: [
        { document_type: 'invoice', total_amount: 120, suppliers: { name: 'Sysco Ireland' }, invoice_lines: [{ count: 5 }] },
        { document_type: 'invoice', total_amount: 98.5, suppliers: { name: 'BWG Foodservice' }, invoice_lines: [{ count: 0 }] },
    ],
    threshold: 5,
    today: '2026-09-25',
})

function draw(over = {}) {
    const handlers = {
        onCostFrom: vi.fn(), onMakeUsual: vi.fn(), onRenumber: vi.fn(), onGiveReason: vi.fn(), onPutOnList: vi.fn(),
        onBuyBoth: vi.fn(),
    }
    render(<ReportPrices section={section} canDecide canEdit busy="" jobs={{ add: [], tick: [], reopen: [], relabel: [] }} {...handlers} {...over} />)
    return handlers
}

describe('prices and suppliers on the report', () => {
    it('opens with the four figures', () => {
        draw()
        expect(screen.getAllByText('Same product, new price').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Bought as something else').length).toBeGreaterThan(0)
        expect(screen.getByText('Recipes out of line')).toBeInTheDocument()
        expect(screen.getAllByText('Came back').length).toBeGreaterThan(0)
    })

    // One row a kind, a chip a product: his choice for the page on 26
    // September, in place of sentences that ran three things to a line.
    it('sums the week up one row a kind, a chip a product', () => {
        draw()
        expect(screen.getByText('Cheaper, same code')).toBeInTheDocument()
        expect(screen.getByText('Bought instead')).toBeInTheDocument()
        expect(screen.getByText('Recipes off')).toBeInTheDocument()
        const tomatoes = screen.getAllByText(/^Tomatoes/).find(el => el.textContent.includes('%'))
        expect(tomatoes).toHaveTextContent('Tomatoes -27%')
    })

    it('says first which suppliers it was read from and which were only typed in', () => {
        draw()
        const line = screen.getByText('Read from:').closest('p')
        expect(line).toHaveTextContent('Read from: Sysco Ireland (1 invoice). BWG Foodservice was typed in as a total')
    })

    it('says under a price move how many came at the new price and what each one came to', () => {
        draw()
        expect(screen.getByText('1 case, €3.15 less each')).toBeInTheDocument()
    })

    it('puts what needs deciding on top, with a button for each', () => {
        const handlers = draw()
        expect(screen.getByText('2 things to decide')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /Cost from €1.29 each/ }))
        expect(handlers.onCostFrom).toHaveBeenCalledWith(
            expect.objectContaining({ kind: 'recipe', name: 'Avocado' }), 'recipe:avo:A18:cost',
        )
    })

    // A label only: it waits until a reason is picked.
    it('gives a credit its reason only once one is picked', () => {
        const handlers = draw()
        const give = screen.getByRole('button', { name: 'Give the reason' })
        expect(give).toBeDisabled()
        fireEvent.change(screen.getByLabelText('Why it came back'), { target: { value: 'not_delivered' } })
        fireEvent.click(give)
        expect(handlers.onGiveReason).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'c1' }), 'not_delivered', 'reason:c1::reason',
        )
    })

    // A report that has gone out, or somebody who cannot change it, reads the
    // same week with nothing to press.
    it('has no decisions on a report that has gone out', () => {
        draw({ canDecide: false })
        expect(screen.queryByText(/to decide/)).toBeNull()
        expect(screen.queryByRole('button', { name: /Cost from/ })).toBeNull()
    })

    it('lists the credit that came back with no reason logged', () => {
        draw({ canDecide: false })
        expect(screen.getAllByText('No reason logged').length).toBeGreaterThan(0)
    })

    it('puts what is still owed on the support list', () => {
        const owing = priceWeek({
            weekStart: '2026-09-13', weekEnd: '2026-09-19',
            claims: [{ id: 'k1', what: 'Bowls charged 49.73', kind: 'price', amount: 24.75, credited_amount: 0, status: 'open', raised_on: '2026-09-14' }],
        })
        const jobs = { add: [{ kind: 'action', key: 'claim:k1' }], tick: [], reopen: [], relabel: [] }
        const handlers = draw({ section: owing, jobs })
        fireEvent.click(screen.getByRole('button', { name: 'Put these on the support list' }))
        expect(handlers.onPutOnList).toHaveBeenCalledWith(jobs)
    })

    // Crossed off when they said no and asked again, or its money moved: the
    // same button puts it back and brings its words up to date.
    it('offers to put back a job crossed off and to update one whose money moved', () => {
        const owing = priceWeek({
            weekStart: '2026-09-13', weekEnd: '2026-09-19',
            claims: [{ id: 'k1', what: 'Bowls charged 49.73', kind: 'price', amount: 24.75, credited_amount: 0, status: 'open', raised_on: '2026-09-14' }],
        })
        const jobs = {
            add: [], tick: [],
            reopen: [{ id: 'a1', patch: { done_on: null } }],
            relabel: [{ id: 'a2', patch: { label: 'Chase the credit for Bowls charged 49.73 (price query) (24.75)' } }],
        }
        const handlers = draw({ section: owing, jobs })
        expect(screen.getByText('1 to put back')).toBeInTheDocument()
        expect(screen.getByText('1 to update')).toBeInTheDocument()
        // Nothing to add, so it does not say it puts anything on.
        expect(screen.queryByRole('button', { name: 'Put these on the support list' })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Update the support list' }))
        expect(handlers.onPutOnList).toHaveBeenCalledWith(jobs)
    })

    // Something else needs words, and there are none here.
    it('does not offer something else as the reason for a credit', () => {
        draw()
        const options = [...screen.getByLabelText('Why it came back').querySelectorAll('option')].map(o => o.value)
        expect(options).toContain('not_delivered')
        expect(options).not.toContain('something_else')
    })

    // Any row bought instead can be the same thing bought either way, not only
    // the ones whose words match.
    it('offers to group a code bought instead with the usual one', () => {
        const withCodes = priceWeek({
            weekStart: '2026-09-13', weekEnd: '2026-09-19',
            lines: [
                line('497870', TORTILLA, '2026-09-14', 30.3, 100, { priceId: 'santa' }),
                line('5013972', TORTILLA, '2026-09-18', 33.03, 100, { priceId: 'plain', description: 'FLOUR PLAIN WRAPS' }),
            ],
            prices: [
                { id: 'santa', product_id: 'tor', supplier_id: 's1', supplier_code: '497870', price_per_case: 30.3, units_per_case: 100, price_per_unit: 0.303, is_preferred: true },
                { id: 'plain', product_id: 'tor', supplier_id: 's1', supplier_code: '5013972', price_per_case: 33.03, units_per_case: 100, price_per_unit: 0.3303, is_preferred: false },
            ],
            codes: [
                { id: 'c-santa', supplier_id: 's1', supplier_code: '497870', price_id: 'santa', ignored: false },
                { id: 'c-plain', supplier_id: 's1', supplier_code: '5013972', price_id: 'plain', ignored: false },
            ],
        })
        const handlers = draw({ section: withCodes })
        fireEvent.click(screen.getByRole('button', { name: 'Same thing, we usually buy both' }))
        expect(handlers.onBuyBoth).toHaveBeenCalledWith(
            expect.objectContaining({ codeRowId: 'c-plain', usualCodeRowId: 'c-santa' }), 'switch:tor:5013972:both',
        )
    })

    it('does not offer it on a report that has gone out', () => {
        draw({ canDecide: false })
        expect(screen.queryByRole('button', { name: 'Same thing, we usually buy both' })).toBeNull()
    })

    // A claim on a delivery whose report had already gone out comes off the
    // first week still open (his decision of 1 October). The week it lands in
    // says which delivery it is from, or its food cost is lower for no reason
    // anybody reading it could see.
    it('says when a claim taken off this week is from an earlier delivery', () => {
        const later = priceWeek({
            weekStart: '2026-09-13', weekEnd: '2026-09-19',
            claims: [{
                id: 'k2', what: 'COKE ZERO 24X330ML', kind: 'short', amount: 22.34, credited_amount: 22.34,
                status: 'settled', raised_on: '2026-09-11', counted_week: '2026-09-13', invoice_id: 'i0',
            }],
            invoices: [{ id: 'i0', invoice_date: '2026-09-11' }],
        })
        draw({ section: later })
        expect(screen.getAllByText('From an earlier week').length).toBeGreaterThan(0)
        expect(screen.getByText('From the delivery in the week of 6 Sept')).toBeInTheDocument()
        expect(screen.getByText('€22.34 off for an earlier week')).toBeInTheDocument()
    })

    it('draws nothing when there is no section to draw', () => {
        const { container } = render(<ReportPrices section={null} />)
        expect(container).toBeEmptyDOMElement()
    })
})
