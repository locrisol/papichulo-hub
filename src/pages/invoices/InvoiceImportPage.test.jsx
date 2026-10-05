// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
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
        // The joins the page asks for by name, built from the rows here, so a
        // join dropped or misspelt is seen rather than handed over regardless.
        const joined = all.map(r => {
            const invoice = (tables.invoices || []).find(i => i.id === r.invoice_id)
            let row = r
            if (columns.includes('invoices!inner')) row = { ...row, invoices: invoice }
            if (columns.includes('delivery:invoices!invoice_line_claims_invoice_id_fkey(invoice_number)')) {
                row = { ...row, delivery: invoice ? { invoice_number: invoice.invoice_number } : null }
            }
            return row
        })
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
// What the are-you-sure question answers. Yes, unless a test says.
let ask
vi.mock('@/context/confirm', () => ({ useConfirm: () => options => ask(options) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({
        activeRestaurant: { id: 'r1', name: 'Point Campus' },
        restaurants: [{ id: 'r1', name: 'Point Campus' }],
    }),
}))

const { default: InvoiceImportPage } = await import('./InvoiceImportPage')

function renderImport() {
    return renderWithRouter(
        <Routes>
            <Route path="/invoices/import" element={<InvoiceImportPage />} />
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
    await userEvent.click(await screen.findByRole('button', { name: 'Import' }))
}

const cardOf = name => screen.getByText(name).closest('div.p-4')

beforeEach(() => {
    nextId = 0
    writes = []
    failing = new Set()
    refuse = new Set()
    ask = async () => true
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
        await userEvent.click(within(cardOf('b.pdf')).getByRole('button', { name: 'Remove' }))
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
        expect(await screen.findByText(/could not be loaded again, so nothing more can be imported until it is/))
            .toBeInTheDocument()
        expect(screen.getByText(/1 document imported/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Choose the PDFs' })).toBeDisabled()
    })
})

// His answers of 30 September, and of 5 October: what an import raised is
// decided at the top of this page, from this batch or an earlier one, so it
// stays on the page and says how many are waiting there.
describe('after an import', () => {
    const WAITING = 'waiting for a decision, at the top of this page.'

    it('says how many lines the batch left to decide, and shows them', async () => {
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [BEANS])
        renderImport()
        await choose('a.pdf')
        await importThem()
        expect(await screen.findByText(`1 document imported. 1 line is ${WAITING}`)).toBeInTheDocument()
        expect(await screen.findByText('Waiting for a decision:')).toBeInTheDocument()
    })

    it('counts lines from an earlier import too', async () => {
        tables.invoices.push({
            id: 'old', restaurant_id: 'r1', supplier_id: 's1', invoice_number: '44000001',
            invoice_date: '2026-09-14', document_type: 'invoice', total_amount: 9.2,
        })
        tables.invoice_lines.push({ id: 'old-1', invoice_id: 'old', supplier_code: '777002', line_total: 9.2, decision: null })
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [RICE])
        renderImport()
        await choose('a.pdf')
        await importThem()
        expect(await screen.findByText(`1 document imported. 1 line is ${WAITING}`)).toBeInTheDocument()
    })

    it('says so when nothing is waiting', async () => {
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [RICE])
        renderImport()
        await choose('a.pdf')
        await importThem()
        expect(await screen.findByText('1 document imported. Nothing is waiting for a decision.')).toBeInTheDocument()
    })

    // A file that still needs something stays on the page beside them.
    it('keeps a file that still needs something on the page', async () => {
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [BEANS])
        renderImport()
        await choose('a.pdf', 'junk.pdf')
        await importThem()
        expect(await screen.findByText(`1 document imported. 1 line is ${WAITING}`)).toBeInTheDocument()
        expect(cardOf('junk.pdf')).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'Open Review' })).toBeNull()
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
        expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled()

        release()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled())
    })

    it('says what is waiting over a document that is already here', async () => {
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
        expect(await screen.findByText(`1 document imported. 1 line is ${WAITING}`)).toBeInTheDocument()
    })

    it('says what is waiting once the last file is filled in', async () => {
        tables.invoices.push({
            id: 'typed', restaurant_id: 'r1', supplier_id: 's1', invoice_number: null,
            invoice_date: '2026-09-28', document_type: 'invoice', total_amount: 9.2,
        })
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [BEANS])
        renderImport()
        await choose('a.pdf')
        await userEvent.click(await screen.findByRole('button', { name: 'Fill that one in' }))
        await userEvent.click(await screen.findByRole('button', { name: 'Fill in invoice' }))
        expect(await screen.findByText(`Filled in. 1 line is ${WAITING}`)).toBeInTheDocument()
    })
})

// A note from the door with the docket number on it waits for that invoice.
// Nothing puts it on a line by itself, so the import says it is there to do.
describe('a note from the door waiting on the invoice imported', () => {
    const note = extra => ({
        id: 'n1', restaurant_id: 'r1', supplier_id: 's1', kind: 'short', what: 'Chorizo',
        docket_number: '45000001', status: 'open', amount: null, invoice_id: null, ...extra,
    })

    it('says which line is still to be said, and writes nothing on the note', async () => {
        tables.invoice_line_claims.push(note())
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [RICE])
        renderImport()
        await choose('a.pdf')
        await importThem()
        expect(await screen.findByText('1 document imported. 1 delivery problem logged at the door is on invoice '
            + '45000001. Pick the line for it on Delivery problems. Nothing is waiting for a decision.')).toBeInTheDocument()
        expect(writes.filter(w => w.table === 'invoice_line_claims')).toEqual([])
    })

    // A docket number is only unique to one supplier, so another supplier's
    // note with the same number is not this invoice's.
    it('counts them, and only open ones for that docket, supplier and restaurant with no money on them yet', async () => {
        tables.invoice_line_claims.push(
            note(), note({ id: 'n2' }), note({ id: 'n3', docket_number: '45000099' }),
            note({ id: 'n4', amount: 21 }), note({ id: 'n5', status: 'refused' }),
            note({ id: 'n6', supplier_id: 's2' }), note({ id: 'n7', restaurant_id: 'r2' }),
        )
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [RICE])
        renderImport()
        await choose('a.pdf')
        await importThem()
        expect(await screen.findByText(/2 delivery problems logged at the door are on invoice 45000001\./))
            .toBeInTheDocument()
    })

    it('says it after filling in a typed invoice too', async () => {
        tables.invoice_line_claims.push(note())
        tables.invoices.push({
            id: 'typed', restaurant_id: 'r1', supplier_id: 's1', invoice_number: null,
            invoice_date: '2026-09-28', document_type: 'invoice', total_amount: 14.5,
        })
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [RICE])
        renderImport()
        await choose('a.pdf')
        await userEvent.click(await screen.findByRole('button', { name: 'Fill that one in' }))
        await userEvent.click(await screen.findByRole('button', { name: 'Fill in invoice' }))
        expect(await screen.findByText(/1 delivery problem logged at the door is on invoice 45000001\./))
            .toBeInTheDocument()
    })
})

// The Chorizo, had it stayed open on the delivery of 13 September: the credit
// for its docket paid into it there, and it showed money owed for ever.
describe('a credit whose docket names a delivery problem on another invoice', () => {
    const OLD = {
        id: 'old', restaurant_id: 'r1', supplier_id: 's1', invoice_number: '44000001',
        invoice_date: '2026-09-14', document_type: 'invoice', total_amount: 14.5,
    }
    const PROBLEM = {
        id: 'n1', restaurant_id: 'r1', supplier_id: 's1', kind: 'short', what: 'Chorizo', docket_number: '45000001',
        status: 'open', amount: 41.99, credited_amount: 0, credit_invoice_id: null, invoice_id: 'old',
        invoice_line_id: 'old-1', raised_on: '2026-09-27', counted_week: '2026-09-13',
    }
    const CREDIT = () => doc('C45000009', '2026-09-29', [{ ...RICE, value: -14.5, cases: -1 }],
        { kind: 'credit', orderReference: '45000001' })

    it('leaves the problem as it is, keeps the credit out of the cost, and says so until it is seen', async () => {
        tables.invoices.push(OLD)
        tables.invoice_line_claims.push({ ...PROBLEM })
        DOCS['c.pdf'] = CREDIT()
        renderImport()
        await choose('c.pdf')
        await importThem()
        const warned = await screen.findByText(new RegExp(
            '^The credit note C45000009 matches a delivery problem by its docket, but that problem is on '
            + 'invoice 44000001\\. Until that is put right, the problem\'s own amount comes off rather than the '
            + 'credit for it\\. Check it on Delivery problems\\. If it is on the wrong invoice, press Not this line, '
            + 'then delete this credit note and import it again\\.',
        ))
        // Amber and apart, not in the green message that goes with the next tap.
        expect(screen.getByText(/^1 document imported\./)).not.toHaveTextContent('C45000009')
        expect(writes.filter(w => w.table === 'invoice_line_claims')).toEqual([])
        const credit = tables.invoices.find(i => i.invoice_number === 'C45000009')
        expect(writes.filter(w => w.table === 'invoices' && w.op === 'update' && 'counts_in_cost' in w.patch))
            .toEqual([expect.objectContaining({ ids: [credit.id], patch: { counts_in_cost: false } })])

        await userEvent.click(screen.getByRole('button', { name: 'Got it' }))
        expect(warned).not.toBeInTheDocument()
    })

    // Not this line is only there while nothing has been credited on it.
    it('does not point at Not this line for a problem with something already credited', async () => {
        tables.invoices.push(OLD)
        tables.invoice_line_claims.push({ ...PROBLEM, credited_amount: 7, credit_invoice_id: 'cr-earlier' })
        DOCS['c.pdf'] = CREDIT()
        renderImport()
        await choose('c.pdf')
        await importThem()
        expect(await screen.findByText(/Something has already been credited on that problem, so it cannot come off that invoice\./))
            .toBeInTheDocument()
        expect(screen.queryByText(/Not this line/)).toBeNull()
    })

    it('says another invoice when the one it is on has no number', async () => {
        tables.invoices.push({ ...OLD, invoice_number: null })
        tables.invoice_line_claims.push({ ...PROBLEM })
        DOCS['c.pdf'] = CREDIT()
        renderImport()
        await choose('c.pdf')
        await importThem()
        expect(await screen.findByText(/but that problem is on another invoice\./)).toBeInTheDocument()
    })

    // What was said goes at the first decision. This has to stay.
    it('keeps the warning apart from what was said', async () => {
        tables.invoices.push(OLD)
        tables.invoice_line_claims.push({ ...PROBLEM })
        DOCS['c.pdf'] = CREDIT()
        DOCS['a.pdf'] = doc('45000002', '2026-09-28', [BEANS])
        renderImport()
        await choose('a.pdf', 'c.pdf')
        await importThem()
        expect(await screen.findByText(/^The credit note C45000009 matches/)).toBeInTheDocument()
        expect(await screen.findByText(/documents? imported\./)).not.toHaveTextContent('C45000009')
    })
})

// A credit imported before its invoice had nothing to pair with, so a delivery
// sent back in full still asked about its prices. Only the supplier's list
// keeps the invoice a credit is for.
describe('an invoice whose credit came in first', () => {
    // Fresh each time: the database here writes into the rows it holds.
    const credit = extra => ({
        id: 'cr', restaurant_id: 'r1', supplier_id: 's1', invoice_number: 'C45000009', invoice_date: '2026-09-29',
        document_type: 'credit', total_amount: -14.5, credit_of_invoice_id: null, ...extra,
    })
    const LISTED = {
        id: 'sd1', restaurant_id: 'r1', supplier_id: 's1', document_id: 'C45000009', order_reference: '45000001',
        document_type: 'credit', document_date: '2026-09-29', value: -14.5,
    }

    it('pairs the credit with it once it is imported', async () => {
        tables.invoices.push(credit())
        tables.supplier_documents.push(LISTED)
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [RICE])
        renderImport()
        await choose('a.pdf')
        await importThem()
        await screen.findByText(/1 document imported/)
        const invoice = tables.invoices.find(i => i.invoice_number === '45000001')
        expect(tables.invoices.find(i => i.id === 'cr').credit_of_invoice_id).toBe(invoice.id)
    })

    it('leaves a credit already paired, and another supplier\'s, alone', async () => {
        tables.invoices.push(credit({ credit_of_invoice_id: 'elsewhere' }), credit({ id: 'cr2', supplier_id: 's2' }))
        tables.supplier_documents.push(LISTED, { ...LISTED, id: 'sd2', supplier_id: 's2' })
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [RICE])
        renderImport()
        await choose('a.pdf')
        await importThem()
        await screen.findByText(/1 document imported/)
        expect(tables.invoices.find(i => i.id === 'cr').credit_of_invoice_id).toBe('elsewhere')
        expect(tables.invoices.find(i => i.id === 'cr2').credit_of_invoice_id).toBeNull()
    })

    it('pairs it when a typed invoice is filled in too', async () => {
        tables.invoices.push({
            id: 'typed', restaurant_id: 'r1', supplier_id: 's1', invoice_number: null,
            invoice_date: '2026-09-28', document_type: 'invoice', total_amount: 14.5,
        }, credit())
        tables.supplier_documents.push(LISTED)
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [RICE])
        renderImport()
        await choose('a.pdf')
        await userEvent.click(await screen.findByRole('button', { name: 'Fill that one in' }))
        await userEvent.click(await screen.findByRole('button', { name: 'Fill in invoice' }))
        await screen.findByText(/Filled in/)
        expect(tables.invoices.find(i => i.id === 'cr').credit_of_invoice_id).toBe('typed')
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
        await userEvent.click(await screen.findByRole('button', { name: 'Fill in invoice' }))
        await screen.findByText(/waiting for a decision/)

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
        await userEvent.click(await screen.findByRole('button', { name: 'Fill in invoice' }))
    }

    it('keeps who typed it in', async () => {
        tables.invoices.push(typed())
        await fillItIn()
        await screen.findByText(/waiting for a decision/)
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

        await userEvent.click(screen.getByRole('button', { name: 'Fill in invoice' }))
        await screen.findByText(/waiting for a decision/)
        expect(tables.invoice_lines).toHaveLength(2)
    })

    it('says what did not save after the lines, and does not offer it again', async () => {
        tables.invoices.push(typed())
        refuse.add('supplier_codes')
        await fillItIn()
        expect(await screen.findByText(/Its codes were not all recorded/)).toBeInTheDocument()
        expect(screen.getByText('Filled in.')).toBeInTheDocument()
        expect(screen.queryByText('a.pdf')).toBeNull()
        expect(screen.queryByRole('button', { name: 'Fill in invoice' })).toBeNull()
        expect(tables.invoice_lines).toHaveLength(2)
    })
})

// Two Sysco invoices typed in on one day is the usual pattern on live, and a
// document dated that day used to be offered only as the nearest of them.
describe('a document dated a day with invoices typed in', () => {
    const typed = (id, total) => ({
        id, restaurant_id: 'r1', supplier_id: 's1', invoice_number: null,
        invoice_date: '2026-09-28', document_type: 'invoice', total_amount: total,
    })

    it('offers every invoice typed in that day', async () => {
        tables.invoices.push(typed('t1', 14.5), typed('t2', 50))
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [RICE])
        renderImport()
        await choose('a.pdf')
        expect(await screen.findByText('2 invoices were typed in for that day.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Fill in the one for €14.50' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Fill in the one for €50.00' })).toBeInTheDocument()
    })

    it('can go in as a different delivery, leaving what was typed alone', async () => {
        tables.invoices.push(typed('t1', 50))
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [RICE])
        renderImport()
        await choose('a.pdf')
        await userEvent.click(await screen.findByRole('button', { name: 'Import as new delivery' }))
        expect(within(cardOf('a.pdf')).getByText('Ready to import')).toBeInTheDocument()

        await importThem()
        await screen.findByText(/1 document imported/)
        expect(tables.invoices).toHaveLength(2)
        expect(tables.invoices.find(i => i.id === 't1')).toMatchObject({ invoice_number: null, total_amount: 50 })
        expect(tables.invoices.find(i => i.id !== 't1')).toMatchObject({ invoice_number: '45000001', total_amount: 14.5 })
    })

    it('asks first, with what was typed, and leaves it waiting when told no', async () => {
        tables.invoices.push(typed('t1', 14.5))
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [RICE])
        const asked = []
        ask = async options => { asked.push(options); return false }
        renderImport()
        await choose('a.pdf')
        await userEvent.click(await screen.findByRole('button', { name: 'Import as new delivery' }))
        expect(asked[0].message).toMatch(/^€14.50 was typed in for .* with no document behind it\. Import 45000001 \(€14.50\)/)
        expect(within(cardOf('a.pdf')).getByText('Entered by hand')).toBeInTheDocument()
    })

    it('forgets it was a different delivery once the file is taken off', async () => {
        tables.invoices.push(typed('t1', 50))
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [RICE])
        renderImport()
        await choose('a.pdf')
        await userEvent.click(await screen.findByRole('button', { name: 'Import as new delivery' }))
        await userEvent.click(within(cardOf('a.pdf')).getByRole('button', { name: 'Remove' }))
        await choose('a.pdf')
        expect(await within(cardOf('a.pdf')).findByText('Entered by hand')).toBeInTheDocument()
    })

    // A credit for an invoice said to be a different delivery waited for it
    // to be filled in, which it never would be.
    it('lets the credit for it go in with it', async () => {
        tables.invoices.push(typed('t1', 50))
        DOCS['b.pdf'] = doc('45000002', '2026-09-28', [RICE])
        DOCS['c.pdf'] = doc('C45000009', '2026-09-28', [{ ...RICE, value: -14.5, cases: -1 }],
            { kind: 'credit', orderReference: '45000002' })
        renderImport()
        await choose('b.pdf', 'c.pdf')
        expect(await within(cardOf('c.pdf')).findByText('May already be counted')).toBeInTheDocument()
        await userEvent.click(await screen.findByRole('button', { name: 'Import as new delivery' }))
        expect(await within(cardOf('c.pdf')).findByText('Ready to import')).toBeInTheDocument()
    })

    it('decides nothing while a file is still being read', async () => {
        tables.invoices.push(typed('t1', 50))
        DOCS['a.pdf'] = doc('45000001', '2026-09-28', [RICE])
        DOCS['slow.pdf'] = doc('45000002', '2026-09-29', [RICE])
        let release
        slow = { promise: new Promise(resolve => { release = resolve }) }
        renderImport()
        await choose('a.pdf', 'slow.pdf')
        expect(await screen.findByRole('button', { name: 'Fill that one in' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Import as new delivery' })).toBeDisabled()
        release()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Fill that one in' })).toBeEnabled())
    })

    it('takes a credit note as itself', async () => {
        tables.invoices.push(typed('t1', 50))
        DOCS['c.pdf'] = doc('C45000009', '2026-09-28', [{ ...RICE, value: -14.5, cases: -1 }], { kind: 'credit' })
        renderImport()
        await choose('c.pdf')
        expect(await within(cardOf('c.pdf')).findByText('Ready to import')).toBeInTheDocument()
        expect(screen.queryByText(/typed in for that day/)).toBeNull()
    })
})
