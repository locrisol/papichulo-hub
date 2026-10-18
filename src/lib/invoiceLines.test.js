import { describe, it, expect } from 'vitest'
import {
    hasLines, documentName, inPrintedOrder, lineDecision, matchedTo, claimsByLine, claimsOnNoLine, claimWords, documentExtras,
    categoryFoot,
} from '@/lib/invoiceLines'
import { invoiceSplit } from '@/lib/invoiceCategories'

// What Show invoice says about a document read in, line by line.

describe('which invoices have Show invoice', () => {
    it('is every document read in, even before its lines are counted', () => {
        expect(hasLines({ entry_method: 'parsed', invoice_lines: [] })).toBe(true)
    })

    // A total typed by hand and filled in later from its document keeps its
    // entry method, and has the lines all the same.
    it('is any invoice with lines, however it went in', () => {
        expect(hasLines({ entry_method: 'manual', invoice_lines: [{ category: 'food' }] })).toBe(true)
    })

    it('is not a total typed off the paper', () => {
        expect(hasLines({ entry_method: 'manual', invoice_lines: [] })).toBe(false)
        expect(hasLines({ entry_method: 'manual' })).toBe(false)
        expect(hasLines(null)).toBe(false)
    })
})

describe('what the document is called', () => {
    it('says invoice or credit note, with its number', () => {
        expect(documentName({ document_type: 'invoice', invoice_number: '45448455' })).toBe('Invoice 45448455')
        expect(documentName({ document_type: 'credit', invoice_number: 'C45620001' })).toBe('Credit note C45620001')
        expect(documentName({ invoice_number: '1' })).toBe('Invoice 1')
    })

    it('says only what it is when there is no number', () => {
        expect(documentName({ document_type: 'credit', invoice_number: null })).toBe('Credit note')
    })
})

describe('the order the lines are shown in', () => {
    it('is the order they were printed in, with a line that has no number last', () => {
        const lines = [
            { id: 'c', line_no: 3 }, { id: 'x', line_no: null }, { id: 'a', line_no: 1 }, { id: 'b', line_no: 2 },
        ]
        expect(inPrintedOrder(lines).map(l => l.id)).toEqual(['a', 'b', 'c', 'x'])
        expect(lines[0].id).toBe('c')
    })
})

describe('what was decided about a line', () => {
    const said = (decision, extra = {}, credit = false) => lineDecision({ decision, ...extra }, { credit }).label

    it('says each decision in the words Review uses', () => {
        expect(said('matched')).toBe('Matched')
        expect(said('accepted')).toBe('New price accepted')
        expect(said('rejected')).toBe('Not now')
        expect(said('ignored')).toBe('Not stock')
    })

    it('says what Not now and Not stock mean for the money', () => {
        expect(lineDecision({ decision: 'rejected' }).note).toBe('The costing was left as it was.')
        expect(lineDecision({ decision: 'ignored' }).note).toBe('It still counts towards the week\'s cost.')
        expect(lineDecision({ decision: 'matched' }).note).toBeNull()
    })

    it('says a line nobody has decided is waiting for a decision', () => {
        expect(said(null)).toBe('Waiting for a decision')
        expect(lineDecision({ decision: null }).tone).toBe('wait')
    })

    // Review never asks about a credit note's lines.
    it('says there is nothing to decide on a credit note', () => {
        expect(said(null, {}, true)).toBe('Nothing to decide')
        expect(said('matched', {}, true)).toBe('Nothing to decide')
        expect(said('matched', { products: { name: 'Chorizo' } }, true)).toBe('Matched')
    })
})

describe('which of our products a line is matched to', () => {
    it('names the product and the version by name', () => {
        expect(matchedTo({
            products: { name: 'Tortilla Wraps' },
            product_supplier_prices: { version_id: 'v1', product_versions: { name: 'Santa Maria 12" wraps' } },
        })).toEqual({ product: 'Tortilla Wraps', version: 'Santa Maria 12" wraps' })
    })

    it('does not name a version with no name of its own, or one called the same as the product', () => {
        expect(matchedTo({
            products: { name: 'Limes' },
            product_supplier_prices: { version_id: 'v1', product_versions: { name: null } },
        })).toEqual({ product: 'Limes', version: null })
        expect(matchedTo({
            products: { name: 'Limes' },
            product_supplier_prices: { version_id: 'v1', product_versions: { name: 'Limes' } },
        })).toEqual({ product: 'Limes', version: null })
    })

    it('does not name a version called after the supplier\'s own words on the line', () => {
        expect(matchedTo({
            raw_description: 'RED ONIONS  1X1 KG',
            products: { name: 'Red Onion' },
            product_supplier_prices: { version_id: 'v1', product_versions: { name: 'Red Onions 1x1 Kg' } },
        })).toEqual({ product: 'Red Onion', version: null })
    })

    it('is nothing for a line not matched to anything', () => {
        expect(matchedTo({ products: null, product_supplier_prices: null })).toBeNull()
    })
})

describe('the delivery problems on a line', () => {
    it('are grouped by line, leaving out a cancelled one and one on no line', () => {
        const byLine = claimsByLine([
            { id: 'c1', invoice_line_id: 'l1', status: 'open' },
            { id: 'c2', invoice_line_id: 'l1', status: 'settled' },
            { id: 'c3', invoice_line_id: 'l2', status: 'void' },
            { id: 'c4', invoice_line_id: null, status: 'open' },
        ])
        expect(byLine.get('l1').map(c => c.id)).toEqual(['c1', 'c2'])
        expect(byLine.has('l2')).toBe(false)
        expect(byLine.size).toBe(1)
    })

    it('says what was wrong, how many, and where it is up to', () => {
        expect(claimWords({ kind: 'short', cases: 0, units: 3, amount: 12, credited_amount: 0, status: 'open' }))
            .toMatchObject({ label: 'Short', what: '3 single items missing', state: '€12.00 asked, still waiting' })
        expect(claimWords({ kind: 'damaged', cases: 1, units: 0, amount: 20, credited_amount: 20, status: 'settled' }).state)
            .toBe('€20.00 asked, €20.00 back')
        expect(claimWords({ kind: 'quality', cases: 1, units: 0, amount: 9.5, credited_amount: 0, status: 'refused' }).state)
            .toBe('€9.50 asked, refused')
        expect(claimWords({ kind: 'short', cases: 2, units: 0, amount: 30, credited_amount: 10, status: 'open' }).state)
            .toBe('€30.00 asked, €10.00 back, still waiting')
    })

    it('keeps what the door wrote, and the note under it', () => {
        expect(claimWords({ kind: 'wrong_item', cases: 0, units: 3, what: 'Delivered red chili powder ',
            note: 'We should have received 3 Paprika Pepper', status: 'settled' }).said)
            .toEqual(['Delivered red chili powder', 'We should have received 3 Paprika Pepper'])
        expect(claimWords({ kind: 'short', cases: 1, units: 0, what: null, note: '' }).said).toEqual([])
    })

    it('finds the ones logged against the whole document, leaving out a cancelled one', () => {
        expect(claimsOnNoLine([
            { id: 'c1', invoice_line_id: null, status: 'settled' },
            { id: 'c2', invoice_line_id: 'l1', status: 'open' },
            { id: 'c3', invoice_line_id: null, status: 'void' },
        ]).map(c => c.id)).toEqual(['c1'])
        expect(claimsOnNoLine(null)).toEqual([])
    })

    it('says a note from the door with no money yet is still waiting', () => {
        expect(claimWords({ kind: 'short', cases: 1, units: 0, amount: null, credited_amount: 0, status: 'open' }).state)
            .toBe('Still waiting')
    })
})

describe('the VAT and the deposits', () => {
    it('are the lines added up', () => {
        expect(documentExtras([
            { vat_amount: 7.94, deposit_amount: 0 },
            { vat_amount: '1.06', deposit_amount: '2.40' },
        ])).toEqual({ vat: 9, deposits: 2.4 })
        expect(documentExtras(null)).toEqual({ vat: 0, deposits: 0 })
    })
})

describe('the totals at the foot', () => {
    const invoice = { category: 'food', total_amount: 457.46 }
    const lines = [
        { category: 'food', line_total: 400, vat_amount: 0, deposit_amount: 0 },
        { category: 'packaging', line_total: 34.52, vat_amount: 7.94, deposit_amount: 0 },
        { category: null, line_total: 12.2, vat_amount: 2.8, deposit_amount: 0 },
    ]

    it('are what the row badges say, worked out the same way', () => {
        const foot = categoryFoot(invoice, lines)
        expect(foot.split).toEqual(invoiceSplit({ ...invoice, invoice_lines: lines }))
        expect(foot.split).toEqual([
            { category: 'food', amount: 400 },
            { category: 'packaging', amount: 42.46 },
        ])
        expect(foot.byLine).toBe(true)
    })

    it('say what the lines with no category come to', () => {
        expect(categoryFoot(invoice, lines).uncategorised).toBe(15)
        expect(categoryFoot(invoice, lines.slice(0, 2)).uncategorised).toBeNull()
    })

    // Then the whole invoice counts under its own category, as its row says,
    // and adding the lines up as well would count it twice.
    it('fall back to the invoice\'s own category when no line has one', () => {
        const foot = categoryFoot(invoice, [{ category: null, line_total: 457.46, vat_amount: 0, deposit_amount: 0 }])
        expect(foot.split).toEqual([{ category: 'food', amount: 457.46 }])
        expect(foot.byLine).toBe(false)
        expect(foot.uncategorised).toBeNull()
    })

    it('keep a credit note below zero', () => {
        const foot = categoryFoot({ category: 'food', total_amount: -22.34 }, [
            { category: 'food', line_total: -18.16, vat_amount: -4.18, deposit_amount: 0 },
        ])
        expect(foot.split).toEqual([{ category: 'food', amount: -22.34 }])
    })
})
