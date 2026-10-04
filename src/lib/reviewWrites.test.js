import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeQuery } from '@/test/helpers'

// Answering what was sent for review settles its lines the way Review would,
// at the restaurant that sent it. Invented figures.

let tables
let writes
const db = {
    from: vi.fn(table => {
        const q = makeQuery({ data: tables[table] || [], error: tables[`${table}:error`] || null })
        for (const op of ['insert', 'update', 'upsert']) {
            q[op] = vi.fn(payload => {
                writes.push({ table, op, payload, q })
                q.single = vi.fn(() => Promise.resolve({
                    data: { id: `${table}-new`, ...(Array.isArray(payload) ? payload[0] : payload) }, error: null,
                }))
                return q
            })
        }
        return q
    }),
}
vi.mock('@/lib/supabase', async () => ({
    ...(await vi.importActual('@/lib/supabase')),
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))

const { settleRequest, addFromRequest } = await import('./reviewWrites')

const INVOICE = {
    id: 'i1', invoice_number: '81774412', invoice_date: '2026-10-01', supplier_id: 's1',
    document_type: 'invoice', restaurant_id: 'r2', total_amount: 41.8,
}
const line = (id, code) => ({
    id, invoice_id: 'i1', line_no: 1, supplier_code: code, raw_description: 'MISSION CORN TORTILLA 6" 12X30 EA',
    pack_size: '12X30 EA', units_per_case: null, cases: 1, units: 0, price_per_case: 41.8, line_total: 41.8,
    vat_amount: 0, deposit_amount: 0, storage: 'ambient', decision: null, invoices: INVOICE,
})
const request = (extra = {}) => ({
    id: 'q1', restaurant_id: 'r2', kind: 'new', name: 'Corn Tortilla 6 inch', supplier_id: 's1',
    supplier_code: '5019120', description: 'MISSION CORN TORTILLA 6" 12X30 EA', pack_size: '12X30 EA',
    price_per_case: 41.8, units_per_case: 360, answer: null, ...extra,
})

const wrote = (table, op) => writes.filter(w => w.table === table && w.op === op)

beforeEach(() => {
    writes = []
    tables = {
        invoice_lines: [line('l1', '5019120'), line('l2', '5019120')],
        product_requests: [request()],
        suppliers: [{ id: 's1', name: 'Sysco Ireland', category: 'food' }],
        products: [{ id: 'p1', name: 'Corn Tortilla 6 inch', section: 'Dry', unit: 'Units', is_mix: false, is_active: true }],
    }
})

describe('settling a request', () => {
    it('matches every line with its code to the product chosen, at the restaurant that sent it', async () => {
        const { error } = await settleRequest(request(), { answer: 'version', userId: 'u9', productId: 'p1', unitsPerCase: 360 })
        expect(error).toBeNull()

        const [price] = wrote('product_supplier_prices', 'insert')
        expect(price.payload).toMatchObject({
            product_id: 'p1', supplier_id: 's1', restaurant_id: 'r2', supplier_code: '5019120',
            price_per_case: 41.8, units_per_case: 360, is_preferred: true,
        })
        const lines = wrote('invoice_lines', 'update')
        expect(lines.filter(w => w.payload.product_id === 'p1')).toHaveLength(2)
        expect(lines.find(w => w.payload.decision === 'matched').q.in).toHaveBeenCalledWith('id', ['l1', 'l2'])

        const [answered] = wrote('product_requests', 'update')
        expect(answered.payload).toMatchObject({ answer: 'version', product_id: 'p1', answered_by: 'u9' })
        expect(answered.q.eq).toHaveBeenCalledWith('id', 'q1')
    })

    it('marks the code not stock there and sets its lines aside', async () => {
        await settleRequest(request({ kind: 'not_stock' }), { answer: 'not_stock', userId: 'u9' })
        const [code] = wrote('supplier_codes', 'insert')
        expect(code.payload).toMatchObject({ restaurant_id: 'r2', supplier_code: '5019120', ignored: true, price_id: null })
        const aside = wrote('invoice_lines', 'update').find(w => w.payload.decision === 'ignored')
        expect(aside.q.in).toHaveBeenCalledWith('id', ['l1', 'l2'])
        expect(wrote('product_requests', 'update')[0].payload.answer).toBe('not_stock')
    })

    // Do not buy it says nothing about the code, so it is asked about again
    // the next time it is bought.
    it('sets the lines aside for do not buy it, and leaves the code alone', async () => {
        await settleRequest(request(), { answer: 'do_not_buy', userId: 'u9' })
        expect(wrote('supplier_codes', 'insert')).toEqual([])
        expect(wrote('supplier_codes', 'update')).toEqual([])
        const aside = wrote('invoice_lines', 'update').find(w => w.payload.decision === 'ignored')
        expect(aside.q.in).toHaveBeenCalledWith('id', ['l1', 'l2'])
    })

    it('only answers a product asked for from Products, which has no lines', async () => {
        await settleRequest(request({ supplier_code: null, description: null }), { answer: 'version', userId: 'u9', productId: 'p1' })
        expect(writes.map(w => w.table)).toEqual(['product_requests'])
    })

    it('only answers one still waiting', async () => {
        await settleRequest(request(), { answer: 'do_not_buy', userId: 'u9' })
        expect(wrote('product_requests', 'update')[0].q.is).toHaveBeenCalledWith('answer', null)
    })

    // No line left and no price on the request: nothing to price it at.
    it('does not price a product at nothing', async () => {
        tables.invoice_lines = []
        await settleRequest(request({ price_per_case: null }), { answer: 'version', userId: 'u9', productId: 'p1', unitsPerCase: 360 })
        expect(wrote('product_supplier_prices', 'insert')).toEqual([])
        expect(wrote('product_requests', 'update')[0].payload.answer).toBe('version')
    })

    it('answers nothing when what it settles could not be read', async () => {
        tables['suppliers:error'] = { message: 'offline' }
        const { error } = await settleRequest(request(), { answer: 'do_not_buy', userId: 'u9' })
        expect(error).toBeTruthy()
        expect(writes).toEqual([])
    })
})

describe('adding it as a new product', () => {
    it('adds it to the list, prices it from the line and recommends that version', async () => {
        const out = await addFromRequest(request(), {
            name: ' Corn Tortilla ', section: 'Dry', unit: 'Units', unitsPerCase: 360, recommend: true, userId: 'u9',
        })
        expect(out).toMatchObject({ error: null, productId: 'products-new' })
        expect(wrote('products', 'insert')[0].payload).toEqual({ name: 'Corn Tortilla', section: 'Dry', unit: 'Units' })
        expect(wrote('product_supplier_prices', 'insert')[0].payload).toMatchObject({ product_id: 'products-new', restaurant_id: 'r2' })
        const [recommended] = wrote('product_versions', 'update')
        expect(recommended.payload).toEqual({ is_recommended: true })
        expect(recommended.q.eq).toHaveBeenCalledWith('product_id', 'products-new')
        expect(wrote('product_requests', 'update')[0].payload).toMatchObject({ answer: 'new_product', product_id: 'products-new' })
    })

    // The list already has it: the same product twice on every stock take.
    it('adds nothing under a name the list already has', async () => {
        const out = await addFromRequest(request(), {
            name: 'corn tortilla 6 inch ', section: 'Dry', unit: 'Units', unitsPerCase: 360, recommend: true, userId: 'u9',
        })
        expect(out.error).toBe('Corn Tortilla 6 inch is already on the list. Answer with A version of one we have instead.')
        expect(writes).toEqual([])
    })

    // Two reviewers with Products open: the second answer changes nothing.
    it('adds nothing for a request somebody already answered', async () => {
        tables.product_requests = { answer: 'version' }
        const out = await addFromRequest(request(), {
            name: 'Corn', section: 'Dry', unit: 'Units', unitsPerCase: 360, recommend: true, userId: 'u9',
        })
        expect(out.error).toMatch(/already answered/)
        expect(writes).toEqual([])
    })

    it('recommends nothing when it was not ticked', async () => {
        await addFromRequest(request(), { name: 'Corn', section: 'Dry', unit: 'Units', unitsPerCase: 360, recommend: false, userId: 'u9' })
        expect(wrote('product_versions', 'update')).toEqual([])
    })
})
