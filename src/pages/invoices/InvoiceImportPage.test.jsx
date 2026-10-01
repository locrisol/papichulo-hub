// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route, useLocation } from 'react-router-dom'
import { renderWithRouter } from '@/test/helpers'

// A week of Sysco documents going in, more than one batch in a visit. The
// reading of a PDF is stood in for by the document it would have read, so
// everything after it runs for real against a small database kept in memory.
// Invented figures.

const ACCOUNT = '2017891'

const line = (code, description, perCase, extra = {}) => ({
    line_no: 1, code, description, pack_size: '1X5 KG', pack: { count: 1, size: 5, unit: 'KG', total: 5 },
    cases: 1, units: 0, price_per_case: perCase, value: perCase, vat: 0, deposit: 0, storage: 'ambient',
    ...extra,
})

const doc = (number, date, lines, extra = {}) => {
    const total = lines.reduce((t, l) => t + l.value, 0)
    return {
        kind: 'invoice', number, date, accountNo: ACCOUNT, lines, pages: 1,
        payable: total, goodsTotal: total, deposits: 0, vat: 0,
        checks: { values: { ok: true }, cases: { ok: true } },
        ...extra,
    }
}

const RICE = line('777001', 'BASMATI RICE 1X5KG', 14.5)
const BEANS = line('777002', 'BLACK BEANS 1X5KG', 9.2)

let DOCS
// A file that takes its time to read, for what can be pressed meanwhile.
let slow
vi.mock('@/lib/pdfText', () => ({
    readPdfText: vi.fn(file => (file.name === 'slow.pdf' ? slow.promise : Promise.resolve())
        .then(() => ({ items: file.name }))),
}))
vi.mock('@/lib/invoiceImport', async () => ({
    ...(await vi.importActual('@/lib/invoiceImport')),
    readDocument: items => DOCS[items] || null,
}))
// Its own reads, and nothing to do with the batch.
vi.mock('@/components/invoices/StillMissing', () => ({ default: () => null }))

// ---- a database kept in memory --------------------------------------------

let tables
let nextId
let writes
// Tables whose reads fail, the way they do on a weak signal, and tables
// whose next insert does.
let failing
let refuse

// The columns that may not repeat, the way the real unique keys refuse them.
const UNIQUE = {
    supplier_codes: ['supplier_id', 'restaurant_id', 'supplier_code'],
    invoices: ['restaurant_id', 'supplier_id', 'invoice_number'],
}

function table(name) {
    const filters = []
    let op = 'select'
    let payload = null
    let columns = '*'
    let range = null
    const chain = {}

    const value = (row, column) => (column.startsWith('invoices.')
        ? row.invoices?.[column.slice('invoices.'.length)]
        : row[column])
    const keep = test => { filters.push(test); return chain }

    chain.select = vi.fn(cols => { if (op === 'select') columns = cols || '*'; return chain })
    chain.order = vi.fn(() => chain)
    chain.limit = vi.fn(() => chain)
    chain.eq = vi.fn((c, v) => keep(r => value(r, c) === v))
    chain.is = vi.fn((c, v) => keep(r => (value(r, c) ?? null) === v))
    chain.in = vi.fn((c, vs) => keep(r => vs.includes(value(r, c))))
    chain.gte = vi.fn((c, v) => keep(r => value(r, c) >= v))
    chain.lte = vi.fn((c, v) => keep(r => value(r, c) <= v))
    chain.not = vi.fn((c, o, v) => keep(r => (value(r, c) ?? null) !== v))
    chain.range = vi.fn((from, to) => { range = [from, to]; return chain })
    chain.insert = vi.fn(rows => { op = 'insert'; payload = rows; return chain })
    chain.update = vi.fn(patch => { op = 'update'; payload = patch; return chain })

    function run() {
        const all = (tables[name] ||= [])
        if (op === 'select' && failing.has(name)) return { data: null, error: { message: `Could not read ${name}` } }
        if (op === 'insert' && refuse.has(name)) {
            refuse.delete(name)
            return { data: null, error: { message: 'Failed to fetch' } }
        }
        if (op === 'insert') {
            const list = (Array.isArray(payload) ? payload : [payload]).map(r => ({ id: `${name}-${++nextId}`, ...r }))
            const key = UNIQUE[name]
            if (key && list.some(r => all.some(o => key.every(k => o[k] === r[k])))) {
                return { data: null, error: { code: '23505', message: 'duplicate key value' } }
            }
            all.push(...list)
            writes.push({ table: name, op, rows: list })
            return { data: Array.isArray(payload) ? list : list[0], error: null }
        }
        const joined = all.map(r => (columns.includes('invoices!inner')
            ? { ...r, invoices: (tables.invoices || []).find(i => i.id === r.invoice_id) }
            : r))
        const hit = joined.filter(r => filters.every(f => f(r)))
        if (op === 'update') {
            for (const h of hit) Object.assign(all.find(r => r.id === h.id), payload)
            writes.push({ table: name, op, ids: hit.map(h => h.id), patch: payload })
            return { data: null, error: null }
        }
        // Copies, the way rows come back over the wire, so a later write here
        // never reaches into what the page is holding. Only the columns asked
        // for, when a plain list was asked for.
        const plain = !/[*(]/.test(columns)
        const asked = columns.split(',').map(c => c.trim())
        const rows = hit.map(r => (plain ? Object.fromEntries(asked.map(c => [c, r[c]])) : { ...r }))
        return { data: range ? rows.slice(range[0], range[1] + 1) : rows, error: null }
    }

    chain.single = vi.fn(() => Promise.resolve().then(() => {
        const out = run()
        return { ...out, data: Array.isArray(out.data) ? out.data[0] ?? null : out.data }
    }))
    chain.maybeSingle = chain.single
    chain.then = (resolve, reject) => Promise.resolve().then(run).then(resolve, reject)
    return chain
}

const db = { from: vi.fn(name => table(name)) }
vi.mock('@/lib/supabase', async () => ({
    ...(await vi.importActual('@/lib/supabase')),
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'store_manager' } }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({
        activeRestaurant: { id: 'r1', name: 'Point Campus' },
        restaurants: [{ id: 'r1', name: 'Point Campus' }],
    }),
}))

const { default: InvoiceImportPage } = await import('./InvoiceImportPage')

// Review stands in as a page that says what it was handed.
function ReviewStandIn() {
    const { state } = useLocation()
    return <p>On Review: {state?.said || 'nothing said'}</p>
}

function renderImport() {
    return renderWithRouter(
        <Routes>
            <Route path="/invoices/import" element={<InvoiceImportPage />} />
            <Route path="/invoices/review" element={<ReviewStandIn />} />
        </Routes>,
        { route: '/invoices/import' },
    )
}

const pdf = name => new File(['%PDF'], name, { type: 'application/pdf', lastModified: 1 })

async function choose(...names) {
    const picker = document.querySelector('#invoice-files')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose the PDFs' })).toBeEnabled())
    await userEvent.upload(picker, names.map(pdf))
}

async function importThem() {
    await userEvent.click(await screen.findByRole('button', { name: 'Import them' }))
}

const cardOf = name => screen.getByText(name).closest('div.p-4')

beforeEach(() => {
    nextId = 0
    writes = []
    failing = new Set()
    refuse = new Set()
    DOCS = {}
    slow = { promise: Promise.resolve() }
    tables = {
        supplier_accounts: [{ id: 'a1', supplier_id: 's1', restaurant_id: 'r1', account_no: ACCOUNT }],
        suppliers: [{ id: 's1', name: 'Sysco Ireland', category: 'food', is_active: true }],
        product_supplier_prices: [{
            id: 'p-rice', product_id: 'prod-rice', supplier_id: 's1', restaurant_id: 'r1',
            supplier_code: '777001', price_per_case: 14.5, units_per_case: 5, price_per_unit: 2.9,
            purchase_type: 'case', is_preferred: true,
            products: { id: 'prod-rice', name: 'Basmati Rice', section: 'Dry', unit: 'KG' },
        }],
        supplier_codes: [{
            id: 'code-rice', supplier_id: 's1', restaurant_id: 'r1', supplier_code: '777001',
            price_id: 'p-rice', last_description: 'BASMATI RICE 1X5KG', pack_size: '1X5 KG',
            first_seen_on: '2026-09-01', last_seen_on: '2026-09-01', ignored: false,
        }],
        invoices: [],
        invoice_lines: [],
        supplier_documents: [],
        invoice_line_claims: [],
        weekly_reports: [],
    }
})

describe('a second batch in the same visit', () => {
    // The lists were read once when the page opened, so a document imported a
    // minute ago was still not in the Hub as far as the page knew.
    it('knows a document from the first batch is already here', async () => {
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [RICE])
        DOCS['b.pdf'] = doc('45000002', '2026-09-29', [RICE])
        renderImport()

        await choose('a.pdf', 'b.pdf')
        await userEvent.click(within(cardOf('b.pdf')).getByRole('button', { name: 'Take it off' }))
        await importThem()
        expect(await screen.findByText(/1 document imported/)).toBeInTheDocument()

        await choose('a.pdf')
        expect(await within(cardOf('a.pdf')).findByText('Already here')).toBeInTheDocument()
    })

    // A code first seen in the first batch looked new again in the second, and
    // adding it a second time failed with "That already exists" after an
    // import that had worked, leaving the rest of the codes unwritten.
    it('updates a code it first saw in the first batch rather than adding it again', async () => {
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [BEANS])
        DOCS['b.pdf'] = doc('45000002', '2026-09-30', [BEANS])
        renderImport()

        // A file that cannot be read stays on the page, so the page stays
        // where it is after the first batch.
        await choose('a.pdf', 'junk.pdf')
        await importThem()
        expect(await screen.findByText(/1 document imported/)).toBeInTheDocument()

        await choose('b.pdf')
        await importThem()
        await waitFor(() => expect(tables.invoices).toHaveLength(2))
        expect(screen.queryByText('That already exists.')).toBeNull()
        const beans = tables.supplier_codes.filter(c => c.supplier_code === '777002')
        expect(beans).toHaveLength(1)
        expect(beans[0]).toMatchObject({ first_seen_on: '2026-09-28', last_seen_on: '2026-09-30' })
    })

    // With the old lists is exactly how the second batch went wrong, so
    // nothing more is read off a file, and what the batch said stays.
    it('says so when the lists cannot be read again, and reads nothing more', async () => {
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [RICE])
        renderImport()
        await choose('a.pdf', 'junk.pdf')
        failing.add('supplier_accounts')
        await importThem()
        expect(await screen.findByText(/could not be read again, so nothing more can go in until they are/))
            .toBeInTheDocument()
        expect(screen.getByText(/1 document imported/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Choose the PDFs' })).toBeDisabled()
    })
})

// His answers of 30 September: after an import Review shows everything
// waiting, and if anything is waiting it opens, whether this batch left it or
// an earlier one did.
describe('after an import', () => {
    const SAID_ON_REVIEW = 'Below is everything waiting for a decision, from this import and any before it.'

    it('opens Review when the batch left lines to decide', async () => {
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [BEANS])
        renderImport()
        await choose('a.pdf')
        await importThem()
        expect(await screen.findByText(`On Review: 1 document imported. ${SAID_ON_REVIEW}`)).toBeInTheDocument()
    })

    it('opens Review when only lines from an earlier import are waiting', async () => {
        tables.invoices.push({
            id: 'old', restaurant_id: 'r1', supplier_id: 's1', invoice_number: '44000001',
            invoice_date: '2026-09-14', document_type: 'invoice', total_amount: 9.2,
        })
        tables.invoice_lines.push({ id: 'old-1', invoice_id: 'old', supplier_code: '777002', line_total: 9.2, decision: null })
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [RICE])
        renderImport()
        await choose('a.pdf')
        await importThem()
        expect(await screen.findByText(`On Review: 1 document imported. ${SAID_ON_REVIEW}`)).toBeInTheDocument()
    })

    it('stays and says so when nothing needs a decision', async () => {
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [RICE])
        renderImport()
        await choose('a.pdf')
        await importThem()
        expect(await screen.findByText('1 document imported. Nothing needs a decision.')).toBeInTheDocument()
    })

    // Leaving would throw away a file that still needs something.
    it('stays while a file is still on the page, and gives the way to Review', async () => {
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [BEANS])
        renderImport()
        await choose('a.pdf', 'junk.pdf')
        await importThem()
        expect(await screen.findByText(/1 document imported. 1 line is waiting on Review./)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Open Review' })).toHaveAttribute('href', '/invoices/review')
    })

    // Pressed with three of twenty read, Review opened and the other
    // seventeen were lost without a word.
    it('waits until every file chosen has been read', async () => {
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [BEANS])
        DOCS['slow.pdf'] = doc('45000002', '2026-09-29', [RICE])
        let release
        slow = { promise: new Promise(resolve => { release = resolve }) }
        renderImport()
        await choose('a.pdf', 'slow.pdf')
        expect(await within(cardOf('a.pdf')).findByText('Ready to import')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Import them' })).toBeDisabled()

        release()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Import them' })).toBeEnabled())
    })

    it('opens Review over a document that is already here', async () => {
        tables.invoices.push({
            id: 'old', restaurant_id: 'r1', supplier_id: 's1', invoice_number: '44000001',
            invoice_date: '2026-09-14', document_type: 'invoice', total_amount: 14.5,
        })
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [BEANS])
        DOCS['old.pdf'] = doc('44000001', '2026-09-14', [RICE])
        renderImport()
        await choose('a.pdf', 'old.pdf')
        expect(await within(cardOf('old.pdf')).findByText('Already here')).toBeInTheDocument()
        await importThem()
        expect(await screen.findByText(`On Review: 1 document imported. ${SAID_ON_REVIEW}`)).toBeInTheDocument()
    })

    it('opens Review once the last file is filled in', async () => {
        tables.invoices.push({
            id: 'typed', restaurant_id: 'r1', supplier_id: 's1', invoice_number: null,
            invoice_date: '2026-09-28', document_type: 'invoice', total_amount: 9.2,
        })
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [BEANS])
        renderImport()
        await choose('a.pdf')
        await userEvent.click(await screen.findByRole('button', { name: 'Fill that one in' }))
        await userEvent.click(await screen.findByRole('button', { name: 'Fill it in' }))
        expect(await screen.findByText(`On Review: Filled in. ${SAID_ON_REVIEW}`)).toBeInTheDocument()
    })
})

// Filling in a typed invoice wrote its lines and never its codes, so a code
// first bought on one had no first or last day, which the quiet days check and
// the report's new codes go by.
describe('filling in a typed invoice', () => {
    it('records the codes on it, as an import does', async () => {
        tables.invoices.push({
            id: 'typed', restaurant_id: 'r1', supplier_id: 's1', invoice_number: null,
            invoice_date: '2026-09-28', document_type: 'invoice', total_amount: 23.7,
        })
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [RICE, { ...BEANS, line_no: 2 }])
        renderImport()
        await choose('a.pdf')
        await userEvent.click(await screen.findByRole('button', { name: 'Fill that one in' }))
        await userEvent.click(await screen.findByRole('button', { name: 'Fill it in' }))
        await screen.findByText(/On Review/)

        const code = c => tables.supplier_codes.find(r => r.supplier_code === c)
        expect(code('777002')).toMatchObject({ first_seen_on: '2026-09-28', last_seen_on: '2026-09-28', price_id: null })
        expect(code('777001')).toMatchObject({ first_seen_on: '2026-09-01', last_seen_on: '2026-09-28' })
    })

    const typed = extra => ({
        id: 'typed', restaurant_id: 'r1', supplier_id: 's1', invoice_number: null, invoice_date: '2026-09-28',
        document_type: 'invoice', total_amount: 23.7, entry_method: 'manual', created_by: 'u-typist', ...extra,
    })

    async function fillItIn() {
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [RICE, { ...BEANS, line_no: 2 }])
        renderImport()
        await choose('a.pdf')
        await userEvent.click(await screen.findByRole('button', { name: 'Fill that one in' }))
        await userEvent.click(await screen.findByRole('button', { name: 'Fill it in' }))
    }

    it('keeps who typed it in', async () => {
        tables.invoices.push(typed())
        await fillItIn()
        await screen.findByText(/On Review/)
        expect(tables.invoices[0]).toMatchObject({ invoice_number: '45000001', created_by: 'u-typist' })
    })

    // Pressed again after the lines failed, it used to put them in twice.
    it('puts the invoice back as typed when its lines do not go in, so pressing again is safe', async () => {
        tables.invoices.push(typed())
        refuse.add('invoice_lines')
        await fillItIn()
        await waitFor(() => expect(tables.invoices[0])
            .toMatchObject({ invoice_number: null, total_amount: 23.7, entry_method: 'manual' }))
        expect(await screen.findByRole('alert')).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Fill it in' }))
        await screen.findByText(/On Review/)
        expect(tables.invoice_lines).toHaveLength(2)
    })

    it('says what did not save after the lines, and does not offer it again', async () => {
        tables.invoices.push(typed())
        refuse.add('supplier_codes')
        await fillItIn()
        expect(await screen.findByText(/Its codes were not all recorded/)).toBeInTheDocument()
        expect(screen.getByText('Filled in.')).toBeInTheDocument()
        expect(screen.queryByText('a.pdf')).toBeNull()
        expect(screen.queryByRole('button', { name: 'Fill it in' })).toBeNull()
        expect(tables.invoice_lines).toHaveLength(2)
    })
})
