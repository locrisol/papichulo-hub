import { describe, it, expect } from 'vitest'
import { INVOICE_CATEGORIES, invoiceCategory, groupByDay } from './invoiceCategories'

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
