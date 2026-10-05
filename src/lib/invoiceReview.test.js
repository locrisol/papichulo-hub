import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeQuery } from '@/test/helpers'

// What Review is still asking about, which three screens now agree on: Review
// itself, the import page deciding whether to open it, and the weekly report
// deciding whether it can go out. Invented figures.

let tables
let asked
const db = {
    from: vi.fn(table => {
        const q = makeQuery({ data: tables[table] || [], error: tables[`${table}:error`] || null })
        asked.push({ table, q })
        return q
    }),
}
vi.mock('@/lib/supabase', async () => ({
    ...(await vi.importActual('@/lib/supabase')),
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))

const { stillToDecide, readToDecide, claimCode } = await import('./invoiceReview')

const invoice = (id, date, extra = {}) => ({
    id, invoice_number: `I${id}`, invoice_date: date, supplier_id: 's1',
    document_type: 'invoice', restaurant_id: 'r1', total_amount: 100, ...extra,
})
const line = (id, inv, code, total = 10) => ({
    id, invoice_id: inv.id, supplier_code: code, line_total: total, decision: null, invoices: inv,
})

beforeEach(() => {
    tables = {}
    asked = []
})

describe('the lines still waiting for somebody', () => {
    it('keeps an undecided line however long ago it was bought', () => {
        const old = invoice('a', '2026-06-01')
        expect(stillToDecide([line('l1', old, '111')], []).map(l => l.id)).toEqual(['l1'])
    })

    // A credit note's lines are money coming back at the price already
    // charged, so they ask nothing.
    it('leaves out the lines on a credit note', () => {
        const credit = invoice('c', '2026-09-22', { document_type: 'credit', total_amount: -10 })
        expect(stillToDecide([line('l1', credit, '111')], [])).toEqual([])
    })

    it('leaves out a delivery a credit reverses in full', () => {
        const sent = invoice('a', '2026-09-14', { total_amount: 378.4 })
        const credits = [{ id: 'c', credit_of_invoice_id: 'a', total_amount: -378.4, invoice_lines: [] }]
        expect(stillToDecide([line('l1', sent, '111')], credits)).toEqual([])
    })

    it('leaves out one line credited back in full, and keeps the rest of the invoice', () => {
        const inv = invoice('a', '2026-09-22')
        const credits = [{
            id: 'c', credit_of_invoice_id: 'a', total_amount: -47.68,
            invoice_lines: [{ supplier_code: '492717', line_total: -47.68 }],
        }]
        const out = stillToDecide([line('fries', inv, '492717', 47.68), line('onions', inv, '222', 9.27)], credits)
        expect(out.map(l => l.id)).toEqual(['onions'])
    })

    // Review never shows a line on a code marked Not stock, so it cannot
    // hold a report either.
    it('leaves out a line on a code marked Not stock, for that supplier only', () => {
        const inv = invoice('a', '2026-09-22')
        const other = invoice('b', '2026-09-22', { supplier_id: 's2' })
        const notStock = [{ supplier_id: 's1', supplier_code: 'DEL01' }]
        const out = stillToDecide([line('charge', inv, 'DEL01'), line('elsewhere', other, 'DEL01')], [], notStock)
        expect(out.map(l => l.id)).toEqual(['elsewhere'])
    })

    // His design of 4 October: a line sent for review is the owners' question
    // while it waits, and it does not hold the report.
    it('leaves out a line whose code is waiting on a review, for that supplier only', () => {
        const inv = invoice('a', '2026-09-22')
        const other = invoice('b', '2026-09-22', { supplier_id: 's2' })
        const sent = [{ supplier_id: 's1', supplier_code: '5019120' }, { supplier_id: 's1', supplier_code: null }]
        const out = stillToDecide(
            [line('corn', inv, '5019120'), line('elsewhere', other, '5019120'), line('rice', inv, '111')], [], [], sent)
        expect(out.map(l => l.id)).toEqual(['elsewhere', 'rice'])
    })
})

describe('reading them', () => {
    it('asks only for lines nobody has decided, at this restaurant', async () => {
        tables.invoice_lines = [line('l1', invoice('a', '2026-09-22'), '111')]
        const { lines, error } = await readToDecide('r1')
        expect(error).toBeNull()
        expect(lines.map(l => l.id)).toEqual(['l1'])

        const q = asked.find(a => a.table === 'invoice_lines').q
        expect(q.is).toHaveBeenCalledWith('decision', null)
        expect(q.eq).toHaveBeenCalledWith('invoices.restaurant_id', 'r1')
        // No cut-off, his answer of 30 September: it asks until every line is
        // decided.
        expect(q.gte).not.toHaveBeenCalled()
        expect(q.lte).not.toHaveBeenCalled()
    })

    // The weekly report only waits on its own week and the ones before it.
    it('stops at the day it is given', async () => {
        await readToDecide('r1', { upTo: '2026-09-26' })
        const q = asked.find(a => a.table === 'invoice_lines').q
        expect(q.lte).toHaveBeenCalledWith('invoices.invoice_date', '2026-09-26')
    })

    // Nothing decided is the normal state of a week nobody reviewed, so the
    // list can pass the thousand rows one read hands back.
    it('reads past the first thousand lines', async () => {
        const inv = invoice('a', '2026-09-22')
        tables.invoice_lines = Array.from({ length: 1201 }, (_, i) => line(`l${i}`, inv, `c${i}`))
        const { lines } = await readToDecide('r1')
        expect(lines).toHaveLength(1201)
    })

    it('reads the codes marked Not stock and leaves their lines out', async () => {
        tables.invoice_lines = [line('l1', invoice('a', '2026-09-22'), 'DEL01'), line('l2', invoice('a', '2026-09-22'), '111')]
        tables.supplier_codes = [{ id: 'c1', supplier_id: 's1', supplier_code: 'DEL01' }]
        const { lines } = await readToDecide('r1')
        expect(lines.map(l => l.id)).toEqual(['l2'])
        const q = asked.find(a => a.table === 'supplier_codes').q
        expect(q.eq).toHaveBeenCalledWith('ignored', true)
        expect(q.eq).toHaveBeenCalledWith('restaurant_id', 'r1')
    })

    it('reads what is waiting on a review, and keeps its lines only when asked to', async () => {
        const inv = invoice('a', '2026-09-22')
        tables.invoice_lines = [line('l1', inv, '5019120'), line('l2', inv, '111')]
        tables.product_requests = [{ id: 'q1', supplier_id: 's1', supplier_code: '5019120' }]
        const waiting = await readToDecide('r1')
        expect(waiting.lines.map(l => l.id)).toEqual(['l2'])
        expect(waiting.sent.map(r => r.id)).toEqual(['q1'])
        const q = asked.find(a => a.table === 'product_requests').q
        expect(q.eq).toHaveBeenCalledWith('restaurant_id', 'r1')
        expect(q.is).toHaveBeenCalledWith('answer', null)

        const answering = await readToDecide('r1', { withSent: true })
        expect(answering.lines.map(l => l.id)).toEqual(['l1', 'l2'])
    })

    it('says so when a read fails, rather than saying nothing is waiting', async () => {
        tables['invoices:error'] = { message: 'no' }
        const { lines, error } = await readToDecide('r1')
        expect(lines).toBeNull()
        expect(error).toEqual({ message: 'no' })
    })
})

describe('a price typed with a code', () => {
    const price = { id: 'pr9', supplier_id: 's1', supplier_code: ' 777002 ' }

    it('points the code the invoices met at it, if the code means nothing yet', async () => {
        expect(await claimCode(price, 'r1')).toBeNull()
        const q = asked.filter(a => a.table === 'supplier_codes')[1].q
        expect(q.update).toHaveBeenCalledWith({ price_id: 'pr9' })
        expect(q.eq).toHaveBeenCalledWith('restaurant_id', 'r1')
        expect(q.eq).toHaveBeenCalledWith('supplier_id', 's1')
        expect(q.eq).toHaveBeenCalledWith('supplier_code', '777002')
        expect(q.is).toHaveBeenCalledWith('price_id', null)
        expect(q.eq).toHaveBeenCalledWith('ignored', false)
    })

    // A price belongs to one code.
    it('leaves alone a price a code already means', async () => {
        tables.supplier_codes = [{ id: 'c1' }]
        expect(await claimCode(price, 'r1')).toBeNull()
        expect(asked.filter(a => a.table === 'supplier_codes')).toHaveLength(1)
    })

    it('does nothing for a price with no code', async () => {
        expect(await claimCode({ id: 'pr9', supplier_id: 's1', supplier_code: '' }, 'r1')).toBeNull()
        expect(asked).toHaveLength(0)
    })

    it('says so when it could not, and where to do it instead', async () => {
        tables['supplier_codes:error'] = { message: 'Failed to fetch' }
        expect(await claimCode(price, 'r1')).toMatch(/^The price was saved, but it could not be matched to code 777002: .* Match the code on Import invoices instead\.$/)
    })
})
