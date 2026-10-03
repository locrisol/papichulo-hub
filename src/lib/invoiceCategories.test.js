import { describe, it, expect } from 'vitest'
import {
    INVOICE_CATEGORIES, invoiceCategory, groupByDay, spendOn, FOOD, PACKAGING,
    mainCategory, storedTotals, invoiceSplit, spentIn, costedByLine,
} from '@/lib/invoiceCategories'

describe('invoiceCategory', () => {
    it('finds each of the four', () => {
        expect(invoiceCategory('food').label).toBe('Food')
        expect(invoiceCategory('packaging').label).toBe('Packaging')
        expect(invoiceCategory('cleaning').label).toBe('Cleaning')
        expect(invoiceCategory('other').label).toBe('Other')
    })

    // A row with a category we no longer offer still has to draw itself. Coming
    // back with nothing would take out the whole list.
    it('falls back rather than returning nothing', () => {
        const unknown = invoiceCategory('drinks')
        expect(unknown.label).toBe('drinks')
        expect(unknown.soft).toBeTruthy()
    })

    it('has something to show when the category is missing entirely', () => {
        expect(invoiceCategory(null).label).toBe('Uncategorised')
    })

    it('gives every category the four styles a screen needs', () => {
        for (const c of INVOICE_CATEGORIES) {
            expect(c.soft, c.value).toBeTruthy()
            expect(c.solid, c.value).toBeTruthy()
            expect(c.dot, c.value).toBeTruthy()
            expect(c.stripe, c.value).toBeTruthy()
        }
    })
})

describe('groupByDay', () => {
    const invoices = [
        { id: 1, invoice_date: '2026-08-10', total_amount: 100 },
        { id: 2, invoice_date: '2026-08-12', total_amount: 50.5 },
        { id: 3, invoice_date: '2026-08-10', total_amount: 25.25 },
        { id: 4, invoice_date: '2026-08-11', total_amount: 10 },
    ]

    it('puts the newest day first', () => {
        expect(groupByDay(invoices).map(d => d.date)).toEqual([
            '2026-08-12', '2026-08-11', '2026-08-10',
        ])
    })

    it('keeps every invoice with its own day', () => {
        const days = groupByDay(invoices)
        expect(days.find(d => d.date === '2026-08-10').rows.map(r => r.id)).toEqual([1, 3])
        expect(days.find(d => d.date === '2026-08-11').rows).toHaveLength(1)
    })

    it('totals each day', () => {
        const days = groupByDay(invoices)
        expect(days.find(d => d.date === '2026-08-10').total).toBeCloseTo(125.25, 2)
        expect(days.find(d => d.date === '2026-08-12').total).toBeCloseTo(50.5, 2)
    })

    it('treats a missing amount as nothing rather than breaking the total', () => {
        const days = groupByDay([
            { id: 1, invoice_date: '2026-08-10', total_amount: null },
            { id: 2, invoice_date: '2026-08-10', total_amount: 10 },
        ])
        expect(days[0].total).toBe(10)
    })

    it('copes with nothing at all', () => {
        expect(groupByDay([])).toEqual([])
        expect(groupByDay(null)).toEqual([])
    })
})

describe('what a week cost', () => {
    // Rows out of invoice_cost_by_category. Three screens each had their own
    // filter and reduce over the invoices themselves, and the three did not
    // quite agree.
    const spend = [
        { cost_date: '2026-09-06', category: 'food', amount: 100, came_from: 'lines' },
        { cost_date: '2026-09-06', category: 'packaging', amount: 20, came_from: 'lines' },
        { cost_date: '2026-09-07', category: 'cleaning', amount: 5, came_from: 'header' },
        { cost_date: '2026-09-07', category: 'other', amount: 400, came_from: 'header' },
    ]

    it('adds up one category', () => {
        expect(spendOn(spend, FOOD)).toBe(100)
    })

    // Packaging and cleaning are one figure everywhere money is reported,
    // measured against a single target, and they are stored apart.
    it('adds packaging and cleaning together', () => {
        expect(spendOn(spend, PACKAGING)).toBe(25)
    })

    it('leaves out what is neither', () => {
        expect(spendOn(spend, FOOD) + spendOn(spend, PACKAGING)).toBe(125)
    })

    // Money asked back at the door and not yet credited comes through as a
    // negative against the week it happened in, because it was never spent.
    it('takes an open claim off the week', () => {
        const withClaim = [...spend, {
            cost_date: '2026-09-06', category: 'food', amount: -30, came_from: 'claim',
        }]
        expect(spendOn(withClaim, FOOD)).toBe(70)
    })

    it('is nought rather than NaN on nothing at all', () => {
        expect(spendOn(null, FOOD)).toBe(0)
        expect(spendOn([], FOOD)).toBe(0)
    })
})

describe('the one label an invoice is filed under', () => {
    // 45612582 on the first real week: oven cleaner and gloves, and a roll of
    // foil. It said food on the History page.
    it('is where most of its money went', () => {
        expect(mainCategory([
            { category: 'cleaning', amount: 130.59 }, { category: 'packaging', amount: 16.21 },
        ])).toBe('cleaning')
    })

    it('goes by size on a credit note, not by sign', () => {
        expect(mainCategory([
            { category: 'packaging', amount: -16.21 }, { category: 'cleaning', amount: -130.59 },
        ])).toBe('cleaning')
    })

    it('falls back when there are no lines to go by', () => {
        expect(mainCategory([], 'food')).toBe('food')
    })

    it('adds up stored lines with their VAT and deposit', () => {
        expect(storedTotals([
            { category: 'food', line_total: 35.22, vat_amount: 8.1, deposit_amount: 7.2 },
            { category: 'food', line_total: 46.58, vat_amount: 0, deposit_amount: 0 },
            { category: 'packaging', line_total: 8.34, vat_amount: 1.92, deposit_amount: 0 },
        ])).toEqual([
            { category: 'food', amount: 97.1 },
            { category: 'packaging', amount: 10.26 },
        ])
    })
})

describe('what an invoice was spent on', () => {
    const typed = { category: 'packaging', total_amount: 44.23, invoice_lines: [] }
    const read = {
        category: 'food',
        total_amount: 146.8,
        invoice_lines: [
            { category: 'cleaning', line_total: 87.25, vat_amount: 20.07, deposit_amount: 0 },
            { category: 'packaging', line_total: 13.18, vat_amount: 3.03, deposit_amount: 0 },
            { category: 'cleaning', line_total: 18.92, vat_amount: 4.35, deposit_amount: 0 },
        ],
    }

    it('is its own category for one typed in off a total', () => {
        expect(invoiceSplit(typed)).toEqual([{ category: 'packaging', amount: 44.23 }])
    })

    // 45612582 on the first real week, which said food on the History page.
    it('is its lines for one read off a document, whatever it is filed under', () => {
        expect(invoiceSplit(read)).toEqual([
            { category: 'cleaning', amount: 130.59 },
            { category: 'packaging', amount: 16.21 },
        ])
    })

    it('adds a list of both kinds up by category', () => {
        expect(spentIn([typed, read], ['packaging', 'cleaning'])).toBeCloseTo(191.03, 2)
        expect(spentIn([typed, read], ['food'])).toBe(0)
    })
})

// The same question the cost view asks before it reads a header: does this
// invoice have a line with a category on it.
describe('costedByLine', () => {
    it('is true for a document read in line by line', () => {
        expect(costedByLine({ invoice_lines: [{ category: 'food', line_total: 10 }] })).toBe(true)
    })

    it('is false for a total typed in by hand', () => {
        expect(costedByLine({ total_amount: 58.2, invoice_lines: [] })).toBe(false)
        expect(costedByLine({ total_amount: 58.2 })).toBe(false)
    })

    it('is false when no line has a category, since the view then reads the header', () => {
        expect(costedByLine({ invoice_lines: [{ category: null, line_total: 10 }] })).toBe(false)
    })
})
