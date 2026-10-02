// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeQuery, renderWithRouter, tableOf } from '@/test/helpers'
import { shortDate, todayISO } from '@/lib/dates'

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
// What the nth write answers. One row back by default, the way the database
// answers a guarded write that went through; none back is a guard that
// matched nothing. Rows only come back when the write asks for them with
// select, as on the database, so a write that stops asking is seen.
let reply
const db = {
    from: vi.fn(table => {
        const q = tableOf(tables[table] || [])
        // What each write was, and what it was guarded on.
        q.update = vi.fn(row => {
            const write = { table, row, guards: [] }
            updated.push(write)
            const answer = reply(updated.length)
            const chain = makeQuery({ ...answer, data: null })
            chain.select = vi.fn(() => { chain.result = answer; return chain })
            chain.then = (resolve, reject) => Promise.resolve(chain.result).then(resolve, reject)
            for (const step of ['eq', 'in', 'is']) {
                chain[step] = vi.fn((column, value) => { write.guards.push([step, column, value]); return chain })
            }
            return chain
        })
        return q
    }),
}

vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
let user
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user }) }))
vi.mock('@/context/restaurant', () => ({ useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Point Campus' } }) }))
// What the are-you-sure question answers, and what it was asked. Yes, unless
// a test says.
let ask
let asked
vi.mock('@/context/confirm', () => ({ useConfirm: () => options => { asked.push(options); return ask(options) } }))

// The door form has tests of its own. Here it only hands over a note.
let doorNote
vi.mock('@/components/invoices/DoorClaimModal', () => ({
    default: ({ onSave }) => <button type="button" onClick={() => onSave(doorNote)}>Save the note</button>,
}))

const { default: ClaimsPage } = await import('./ClaimsPage')

beforeEach(() => {
    user = { id: 'u1', role: 'store_manager' }
    updated = []
    reply = () => ({ data: [{ id: 'c1' }], error: null })
    asked = []
    ask = async () => true
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
    await userEvent.click(await screen.findByRole('button', { name: 'Yes, that line' }))
    await waitFor(() => expect(updated).toHaveLength(1))
    return updated[0]
}

// One tap used to write the money and the week, and both were only seen in
// the message afterwards.
describe('asking before a claim goes on a line', () => {
    it('shows the working, the invoice and the week, and writes nothing until it is said yes', async () => {
        renderWithRouter(<ClaimsPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'That is the one' }))
        expect(await screen.findByText('1 case at €18.16 a case, with its VAT: €22.34')).toBeInTheDocument()
        expect(screen.getByText(`On invoice 45690932 of ${shortDate(DELIVERED)}, COKE ZERO 24X330ML.`)).toBeInTheDocument()
        expect(screen.getByText(`It comes off the week of ${shortDate(DELIVERY_WEEK)}.`)).toBeInTheDocument()
        expect(screen.queryByText(/the one written on the note/)).toBeNull()
        expect(updated).toEqual([])

        await userEvent.click(screen.getByRole('button', { name: 'Never mind' }))
        expect(screen.queryByRole('button', { name: 'Yes, that line' })).toBeNull()
        expect(updated).toEqual([])
    })

    it('says before which week it comes off when the delivery\'s report has gone out', async () => {
        tables.weekly_reports = [{ id: 'w1', restaurant_id: 'r1', week_start: DELIVERY_WEEK, status: 'published' }]
        renderWithRouter(<ClaimsPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'That is the one' }))
        expect(await screen.findByText(`The report for the week of ${shortDate(DELIVERY_WEEK)} has gone out, `
            + `so it comes off the week of ${shortDate(NOTED_WEEK)}.`)).toBeInTheDocument()
    })

    it('asks the price first on a price query, then reads it back the same way', async () => {
        tables.invoice_line_claims = [{ ...CLAIM, kind: 'price' }]
        renderWithRouter(<ClaimsPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'That is the one' }))
        await userEvent.type(screen.getByLabelText(/What should they have charged/), '16.16')
        await userEvent.click(screen.getByRole('button', { name: 'That is the price' }))
        expect(await screen.findByText('1 case, €2.00 a case over the agreed price, with its VAT: €2.46'))
            .toBeInTheDocument()
        expect(updated).toEqual([])
        await userEvent.click(screen.getByRole('button', { name: 'Yes, that line' }))
        await waitFor(() => expect(updated).toHaveLength(1))
        expect(updated[0].row).toMatchObject({ amount: 2.46 })
    })

    it('refuses a claim for more than the line billed, and says what the line had', async () => {
        tables.invoice_line_claims = [{ ...CLAIM, cases: 2 }]
        tables.invoices = [{ ...INVOICE, invoice_lines: [{ ...INVOICE.invoice_lines[0], cases: 1, units: 0 }] }]
        renderWithRouter(<ClaimsPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'That is the one' }))
        expect(await screen.findByText(/^That line only billed 1 case, less than this claim\./)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Yes, that line' })).toBeNull()
        expect(updated).toEqual([])
    })

    // The problem was about the list just closed, and stayed on the row.
    it('clears what was wrong with a line once the list is closed', async () => {
        tables.invoice_line_claims = [{ ...CLAIM, cases: 2, docket_number: null }]
        tables.invoices = [{ ...INVOICE, invoice_lines: [{ ...INVOICE.invoice_lines[0], cases: 1, units: 0 }] }]
        renderWithRouter(<ClaimsPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'Say which line this was' }))
        await userEvent.click(screen.getByRole('button', { name: /COKE ZERO 24X330ML/ }))
        expect(await screen.findByText(/^That line only billed 1 case/)).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Never mind' }))
        expect(screen.queryByText(/^That line only billed 1 case/)).toBeNull()
    })
})

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

    // The panel stays open between the tap and the yes, and a credit for its
    // docket can settle it meanwhile. Only a claim still waiting for its line
    // takes one.
    it('writes only while it is still open with no line and nothing credited', async () => {
        const { guards } = await attach()
        expect(guards).toEqual(expect.arrayContaining([
            ['eq', 'id', 'c1'], ['eq', 'status', 'open'], ['is', 'invoice_line_id', null],
            ['eq', 'credited_amount', 0], ['is', 'credit_invoice_id', null],
        ]))
    })

    it('says nothing changed when it moved on before the yes, not where the money goes', async () => {
        reply = () => ({ data: [], error: null })
        await attach()
        expect(await screen.findByText(/^Nothing changed: that problem has moved on/)).toBeInTheDocument()
        expect(screen.queryByText(/is coming off the week/)).toBeNull()
    })

    it('still moves it when that week\'s report is only a draft', async () => {
        tables.weekly_reports = [{ id: 'w1', restaurant_id: 'r1', week_start: DELIVERY_WEEK, status: 'draft' }]
        const { row } = await attach()
        expect(row).toMatchObject({ counted_week: DELIVERY_WEEK })
    })
})

// The Chorizo of 2 October. Docket 45747318 was written on the note and was not
// imported yet, so every Sysco invoice of the last sixty days was offered, and
// it went on the Chorizo of 13 September.
describe('a note whose docket is not in the Hub yet', () => {
    const CHORIZO = {
        ...CLAIM, id: 'c9', what: '1 Unit of Chorizo delivered instead of 1 case.', cases: 0, units: 3,
        docket_number: '45747318', raised_on: '2026-10-02', counted_week: NOTED_WEEK,
    }
    const chorizoOn = (id, number, date) => ({
        ...INVOICE, id, invoice_number: number, invoice_date: date,
        invoice_lines: [{
            id: `${id}-l`, raw_description: 'CHORIZO CUBES', pack_size: '4X500 GM', price_per_case: 27.99,
            units_per_case: 2, unit_price: 13.995, line_total: 27.99, vat_amount: 0, deposit_amount: 0, cases: 1, units: 0,
        }],
    })

    beforeEach(() => {
        tables.invoice_line_claims = [CHORIZO]
        tables.invoices = [chorizoOn('old', '45607444', '2026-09-13'), chorizoOn('near', '45730001', '2026-09-30')]
    })

    it('says it is waiting for that invoice and offers no other delivery\'s lines', async () => {
        renderWithRouter(<ClaimsPage />)
        expect(await screen.findByText(
            'Invoice 45747318 isn\'t in the Hub yet. Once it\'s imported, its lines show here.',
        )).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Say which line this was' })).toBeNull()
        expect(screen.queryByRole('button', { name: /CHORIZO CUBES/ })).toBeNull()
    })

    // It used to say wait for the import even when its invoice was already in.
    it('says to wait for the import only when its invoice is not in yet', async () => {
        tables.invoice_line_claims = []
        doorNote = { supplierId: 's1', kind: 'short', what: 'Chorizo', cases: '', units: '3', docket: '45730001', note: '' }
        renderWithRouter(<ClaimsPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'Log a problem' }))
        await userEvent.click(screen.getByRole('button', { name: 'Save the note' }))
        expect(await screen.findByText('Logged. Say which line it was below.')).toBeInTheDocument()

        await userEvent.click(await screen.findByRole('button', { name: 'Log a problem' }))
        doorNote = { ...doorNote, docket: '45747318' }
        await userEvent.click(screen.getByRole('button', { name: 'Save the note' }))
        expect(await screen.findByText('Logged. Once its invoice is imported, say which line it was below.'))
            .toBeInTheDocument()
    })

    it('offers the deliveries around that day, under their own invoice, when it was a different one', async () => {
        renderWithRouter(<ClaimsPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'It was a different delivery' }))
        expect(screen.getByText('None of these is invoice 45747318.')).toBeInTheDocument()
        expect(screen.getByText(`Invoice 45730001, ${shortDate('2026-09-30')}`)).toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: /CHORIZO CUBES/ })).toHaveLength(1)
        // Nineteen days before the note is not the delivery it is about.
        expect(screen.queryByText(/Invoice 45607444/)).toBeNull()
    })

    it('says plainly that it is not the invoice on the note before it goes on, and prices it per bag', async () => {
        renderWithRouter(<ClaimsPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'It was a different delivery' }))
        await userEvent.click(screen.getByRole('button', { name: /CHORIZO CUBES/ }))
        expect(await screen.findByText('This isn\'t invoice 45747318, the one written on the note.')).toBeInTheDocument()
        expect(screen.getByText('3 of the 4 x 500 g in a case at €27.99 a case: €21.00')).toBeInTheDocument()
        expect(updated).toEqual([])

        await userEvent.click(screen.getByRole('button', { name: 'Yes, that line' }))
        await waitFor(() => expect(updated).toHaveLength(1))
        expect(updated[0].row).toMatchObject({ invoice_id: 'near', invoice_line_id: 'near-l', amount: 21 })
    })
})

// After the wrong tap the Chorizo row only said "from the delivery in the
// week of 13 Sep", and nothing could take it off that line.
describe('a claim on a line', () => {
    // As the claims read brings it, the invoice and the line joined on, so
    // one older than the sixty days the page reads is still named.
    const ON = {
        ...CLAIM, invoice_id: 'old', invoice_line_id: 'old-l', amount: 41.99, counted_week: DELIVERY_WEEK,
        docket_number: '45747318', raised_on: '2026-10-02',
        delivery: { invoice_number: '45607444', invoice_date: '2026-09-13' },
        invoice_lines: { raw_description: 'CHORIZO CUBES', pack_size: '1X500 GM' },
    }

    it('says which invoice and line it is on, and when that is not the docket on the note', async () => {
        tables.invoice_line_claims = [ON]
        renderWithRouter(<ClaimsPage />)
        const said = await screen.findByText(`On invoice 45607444 of ${shortDate('2026-09-13')}, CHORIZO CUBES 1X500 GM`, { exact: false })
        expect(said).toHaveTextContent('not the invoice written on the note')
    })

    it('does not say it is another invoice when it is the one on the note', async () => {
        tables.invoice_line_claims = [{ ...ON, docket_number: '45607444' }]
        renderWithRouter(<ClaimsPage />)
        await screen.findByText(/On invoice 45607444/)
        expect(screen.queryByText(/not the invoice written on the note/)).toBeNull()
    })

    it('comes off the line after asking, and waits for the right invoice again', async () => {
        tables.invoice_line_claims = [ON]
        renderWithRouter(<ClaimsPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'Not this line' }))
        expect(asked[0].message).toBe(`Take it off invoice 45607444 of ${shortDate('2026-09-13')}? `
            + `€41.99 stops coming off the week of ${shortDate(DELIVERY_WEEK)}, and it waits for the right invoice again.`)
        await waitFor(() => expect(updated).toHaveLength(1))
        expect(updated[0].row).toEqual({
            invoice_id: null, invoice_line_id: null, amount: null, counted_week: NOTED_WEEK,
        })
        expect(updated[0].guards).toEqual(expect.arrayContaining([
            ['eq', 'id', ON.id], ['eq', 'status', 'open'], ['eq', 'credited_amount', 0], ['is', 'credit_invoice_id', null],
        ]))
    })

    // A credit touching it while the page was open stops the write, and that
    // has to be said rather than reported as done.
    it('says nothing changed when it moved on before Not this line', async () => {
        tables.invoice_line_claims = [ON]
        reply = () => ({ data: [], error: null })
        renderWithRouter(<ClaimsPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'Not this line' }))
        expect(await screen.findByText(/^Nothing changed: that problem has moved on/)).toBeInTheDocument()
        expect(screen.queryByText(/^It is off invoice/)).toBeNull()
    })

    it('writes nothing when told no', async () => {
        tables.invoice_line_claims = [ON]
        ask = async () => false
        renderWithRouter(<ClaimsPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'Not this line' }))
        await waitFor(() => expect(asked).toHaveLength(1))
        expect(updated).toEqual([])
    })

    // Once a credit has touched it, the money belongs to that credit.
    it('is not offered once anything has been credited', async () => {
        tables.invoice_line_claims = [{ ...ON, credited_amount: 10 }]
        renderWithRouter(<ClaimsPage />)
        await screen.findByText(/On invoice 45607444/)
        expect(screen.queryByRole('button', { name: 'Not this line' })).toBeNull()
    })
})

// On 2 October "They said no" was pressed seven seconds after the claim went
// on a line, by mistake, and nothing could undo it.
describe('closing a claim, and opening it again', () => {
    const PRICED = {
        ...CLAIM, invoice_id: 'i1', invoice_line_id: 'line1', amount: 22.34, counted_week: DELIVERY_WEEK,
        delivery: { invoice_number: '45690932', invoice_date: DELIVERED },
    }

    it('asks before marking it refused, and writes nothing when told no', async () => {
        tables.invoice_line_claims = [PRICED]
        ask = async () => false
        renderWithRouter(<ClaimsPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'They said no' }))
        await waitFor(() => expect(asked).toHaveLength(1))
        expect(asked[0]).toMatchObject({
            title: 'They said no?', confirmLabel: 'They said no', details: [{ label: 'Problem', value: 'COKE ZERO 24X330ML' }],
        })
        expect(asked[0].message).toBe('This problem will be marked as refused. '
            + `€22.34 stops coming off the week of ${shortDate(DELIVERY_WEEK)}. `
            + 'If they credit it after all, use Ask again under Finished first.')
        expect(updated).toEqual([])
    })

    // The words written at the door are a whole sentence of their own, full
    // stop and all, so they go on a line of their own and not into this one.
    it('keeps what was written at the door out of the question', async () => {
        const what = '1 Unit of Chorizo delivered instead of 1 case.'
        tables.invoice_line_claims = [{ ...PRICED, what }]
        ask = async () => false
        renderWithRouter(<ClaimsPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'They said no' }))
        await userEvent.click(await screen.findByRole('button', { name: 'Take it back' }))
        await waitFor(() => expect(asked).toHaveLength(2))
        for (const question of asked) {
            expect(question.message).not.toContain('Chorizo')
            expect(question.details).toEqual([{ label: 'Problem', value: what }])
        }
        expect(asked[1].message).toBe('It will be removed from the list and won\'t count anywhere. '
            + `€22.34 stops coming off the week of ${shortDate(DELIVERY_WEEK)}.`)
    })

    it('marks it refused once said yes, only while it is still open, and says how to undo it', async () => {
        tables.invoice_line_claims = [PRICED]
        renderWithRouter(<ClaimsPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'They said no' }))
        await waitFor(() => expect(updated).toHaveLength(1))
        expect(updated[0].row).toEqual({ status: 'refused', settled_on: todayISO() })
        expect(updated[0].guards).toEqual(expect.arrayContaining([['eq', 'status', 'open']]))
        expect(await screen.findByText('Marked as refused. You can still ask again from Finished.')).toBeInTheDocument()
    })

    it('says nothing comes off any week for a note with no money on it', async () => {
        renderWithRouter(<ClaimsPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'They said no' }))
        await waitFor(() => expect(asked).toHaveLength(1))
        expect(asked[0].message).toMatch(/will be marked as refused\. Nothing comes off any week for it\./)
    })

    // The green message about where the money was going stayed up after the
    // refusal, saying something no longer true.
    it('clears what was said about the money before saying what changed', async () => {
        await attach()
        expect(await screen.findByText('€22.34 is coming off the week that delivery landed in.')).toBeInTheDocument()
        // The refusal fails, so nothing replaces the old message: only the
        // clearing takes it away.
        reply = n => (n === 2 ? { data: null, error: { message: 'the write failed' } } : { data: [{ id: 'c1' }], error: null })
        await userEvent.click(await screen.findByRole('button', { name: 'They said no' }))
        expect(await screen.findByText('the write failed')).toBeInTheDocument()
        expect(screen.queryByText('€22.34 is coming off the week that delivery landed in.')).toBeNull()
        expect(screen.queryByText(/^Marked as refused/)).toBeNull()
    })

    it('says nothing changed when the claim moved on before They said no', async () => {
        tables.invoice_line_claims = [PRICED]
        reply = () => ({ data: [], error: null })
        renderWithRouter(<ClaimsPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'They said no' }))
        expect(await screen.findByText(/^Nothing changed: that problem has moved on/)).toBeInTheDocument()
        expect(screen.queryByText(/Marked as refused/)).toBeNull()
    })

    it('says nothing changed when Ask again finds it already moved on', async () => {
        tables.invoice_line_claims = [{ ...PRICED, status: 'refused', settled_on: '2026-10-01' }]
        reply = () => ({ data: [], error: null })
        renderWithRouter(<ClaimsPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'Ask again' }))
        expect(await screen.findByText(/^Nothing changed: that problem has moved on/)).toBeInTheDocument()
        expect(screen.queryByText(/is coming off the week/)).toBeNull()
    })

    // It can be undone now, so the dialog must not say it cannot.
    it('asks before taking it back, without saying it cannot be undone', async () => {
        tables.invoice_line_claims = [PRICED]
        renderWithRouter(<ClaimsPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'Take it back' }))
        await waitFor(() => expect(updated).toHaveLength(1))
        expect(asked[0]).toMatchObject({
            title: 'Take it back?', confirmLabel: 'Take it back', tone: 'danger', dangerNote: 'You can ask again from Finished.',
        })
        expect(updated[0].row).toEqual({ status: 'void', settled_on: todayISO() })
    })

    it('asks again from Finished, back to waiting in the same week', async () => {
        tables.invoice_line_claims = [{ ...PRICED, status: 'refused', settled_on: '2026-10-01' }]
        renderWithRouter(<ClaimsPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'Ask again' }))
        await waitFor(() => expect(updated).toHaveLength(1))
        expect(asked[0].title).toBe('Ask again?')
        expect(updated[0].row).toEqual({ status: 'open', settled_on: null })
        expect(updated[0].guards).toEqual(expect.arrayContaining([['eq', 'status', 'refused']]))
        expect(await screen.findByText('€22.34 is coming off the week that delivery landed in.')).toBeInTheDocument()
    })

    // Taken back before that report went out, so the report never had it.
    it('moves it to the first week still open when its week\'s report went out after it closed, and says so', async () => {
        tables.invoice_line_claims = [{ ...PRICED, status: 'void', settled_on: '2026-10-01' }]
        tables.weekly_reports = [{
            id: 'w1', restaurant_id: 'r1', week_start: DELIVERY_WEEK, status: 'published', published_at: '2026-10-02T09:00:00+00:00',
        }]
        renderWithRouter(<ClaimsPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'Ask again' }))
        await waitFor(() => expect(updated).toHaveLength(1))
        expect(asked[0].message.startsWith(`It goes back on Still waiting. The report for the week of ${shortDate(DELIVERY_WEEK)} `
            + `has gone out, so €22.34 comes off the week of ${shortDate(NOTED_WEEK)} instead.`)).toBe(true)
        expect(updated[0].row).toEqual({ status: 'open', settled_on: null, counted_week: NOTED_WEEK })
        expect(await screen.findByText(
            `The report for the week of ${shortDate(DELIVERY_WEEK)} has already been sent, `
            + `so €22.34 is coming off the week of ${shortDate(NOTED_WEEK)} instead, `
            + `shown as from the delivery in the week of ${shortDate(DELIVERY_WEEK)}.`,
        )).toBeInTheDocument()
    })

    // Still open when that report went out, the report already took it off.
    // Moved, it would come off the next one as well.
    it('keeps it in its week when it was still open as that week\'s report went out', async () => {
        tables.invoice_line_claims = [{ ...PRICED, status: 'refused', settled_on: '2026-10-03' }]
        tables.weekly_reports = [{
            id: 'w1', restaurant_id: 'r1', week_start: DELIVERY_WEEK, status: 'published', published_at: '2026-10-02T09:00:00+00:00',
        }]
        renderWithRouter(<ClaimsPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'Ask again' }))
        await waitFor(() => expect(updated).toHaveLength(1))
        expect(asked[0].message.startsWith(
            `It goes back on Still waiting, and €22.34 comes off the week of ${shortDate(DELIVERY_WEEK)} again.`,
        )).toBe(true)
        expect(updated[0].row).toEqual({ status: 'open', settled_on: null })
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

    it('cannot ask again or close one, which only a manager can', async () => {
        tables.my_claims = [MINE, { ...DONE, status: 'refused' }]
        renderWithRouter(<ClaimsPage />)
        await screen.findByText('Lettuce warm')
        expect(screen.queryByRole('button', { name: 'Ask again' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'They said no' })).toBeNull()
    })

    it('still says which are waiting and which are finished', async () => {
        renderWithRouter(<ClaimsPage />)
        const waiting = (await screen.findByText('Still waiting')).closest('div').parentElement
        expect(waiting).toHaveTextContent('Two bags of rice split')
        expect(waiting).not.toHaveTextContent('Lettuce warm')
        expect((await screen.findByText('Finished')).parentElement).toHaveTextContent('Lettuce warm')
    })
})
