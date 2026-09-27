// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeQuery } from '@/test/helpers'
import { exportOf, WEEK, TENDERS, blankWeek } from '@/test/weeklySalesExport'

// The upload as it reads on screen, with his two examples in it: a line the
// till calls by its own name (CASH, Credit Card), and a line this restaurant
// does not have at all (Ordu App, retired here and rung up by mistake).

let tables = {}
const asked = []
const db = {
    from: vi.fn(table => {
        const query = makeQuery(tables[table] || { data: [], error: null })
        asked.push({ table, query })
        return query
    }),
}
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))

const { default: SalesImportDialog } = await import('./SalesImportDialog')

const onFill = vi.fn()
const onGoToWeek = vi.fn()

function open({ weekStart = '2026-09-06', days = blankWeek(), loading = false } = {}) {
    return render(
        <SalesImportDialog
            restaurantId="r1"
            restaurantName="Testville"
            weekStart={weekStart}
            days={days}
            tenders={TENDERS}
            shownTenders={TENDERS.filter(t => t.is_active)}
            trackingPlatforms={[]}
            loading={loading}
            onGoToWeek={onGoToWeek}
            onFill={onFill}
            onClose={() => {}}
        />,
    )
}

async function upload(xml = exportOf(WEEK)) {
    const file = new File([xml], 'crystalReportViewer.xml', { type: 'text/xml' })
    await userEvent.upload(screen.getByLabelText(/Weekly Sales Summary/), file)
}

function remembered() {
    return asked.filter(a => a.table === 'sales_tender_names' && a.query.upsert.mock.calls.length)
        .flatMap(a => a.query.upsert.mock.calls.map(c => c[0]))
}

beforeEach(() => {
    tables = {}
    asked.length = 0
    onFill.mockClear()
    onGoToWeek.mockClear()
})

describe('a line the Hub cannot place', () => {
    it('asks about it, with its money and its day', async () => {
        open()
        await upload()
        expect(await screen.findByText('Ordu App')).toBeInTheDocument()
        expect(screen.getByText(/retired at Testville, so this was probably rung up by mistake/))
            .toHaveTextContent('Tue 8 Sept €12.50')
    })

    it("starts the till's own names on the row they look like", async () => {
        open()
        await upload()
        expect(await screen.findByLabelText('Where CASH goes')).toHaveValue('cash')
        expect(screen.getByLabelText('Where Credit Card goes')).toHaveValue('card')
        expect(screen.getByLabelText('Where Ordu App goes')).toHaveValue('')
    })

    it('will not go on until every line has an answer', async () => {
        open()
        await upload()
        expect(await screen.findByRole('button', { name: '1 still to answer' })).toBeDisabled()
    })

    it('does not ask about names it was told before', async () => {
        tables.sales_tender_names = {
            data: [{ name: 'CASH', tender_key: 'cash' }, { name: 'Credit Card', tender_key: 'card' }],
            error: null,
        }
        open()
        await upload()
        await screen.findByText('Ordu App')
        expect(screen.queryByLabelText('Where CASH goes')).toBeNull()
    })
})

describe('filling the week in', () => {
    async function answerOrdu(where) {
        open()
        await upload()
        await userEvent.selectOptions(await screen.findByLabelText('Where Ordu App goes'), where)
        await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    }

    it('says what it will do before it does it', async () => {
        await answerOrdu('kiosk')
        expect(screen.getByText('6 days to fill in')).toBeInTheDocument()
        expect(screen.getByText('Every day adds up to its gross')).toBeInTheDocument()
        expect(screen.getByText(/nothing on the till, so left empty/)).toHaveTextContent('Sun 6 Sept')
        expect(onFill).not.toHaveBeenCalled()
    })

    it('fills the boxes and hands them to the page', async () => {
        await answerOrdu('kiosk')
        await userEvent.click(screen.getByRole('button', { name: 'Fill in the week' }))
        await waitFor(() => expect(onFill).toHaveBeenCalled())
        const filled = onFill.mock.calls[0][0]
        expect(filled['2026-09-08'].tenderValues.kiosk).toBe('412.5')
        expect(filled).not.toHaveProperty('2026-09-06')
    })

    // The two halves of his rule. CASH is Cash Sales every week, so it is
    // kept. Ordu App under Kiosk was one mistake, so it is not, and the next
    // one is asked about.
    it('remembers the names that are ours and not the mistake', async () => {
        await answerOrdu('kiosk')
        await userEvent.click(screen.getByRole('button', { name: 'Fill in the week' }))
        await waitFor(() => expect(onFill).toHaveBeenCalled())
        expect(remembered()).toEqual([[
            { restaurant_id: 'r1', name: 'CASH', tender_key: 'cash', created_by: 'me' },
            { restaurant_id: 'r1', name: 'Credit Card', tender_key: 'card', created_by: 'me' },
        ]])
    })

    it('says which day will not add up when a line is left out', async () => {
        await answerOrdu('out')
        expect(screen.getByText(/Ordu App, €12.50, left out/)).toHaveTextContent('Tue 8 Sept will not add up')
        expect(screen.queryByText('Every day adds up to its gross')).toBeNull()
    })

    it('stops and says so when the names it was told cannot be read', async () => {
        tables.sales_tender_names = { data: null, error: { message: 'permission denied for table sales_tender_names', code: '42501' } }
        open()
        await upload()
        expect(await screen.findByRole('alert')).toBeInTheDocument()
        expect(onFill).not.toHaveBeenCalled()
    })
})

describe('the wrong file', () => {
    it('offers to open the week the file is for', async () => {
        open({ weekStart: '2026-09-13', days: {} })
        await upload()
        expect(await screen.findByText(/That file is for 6 Sept to 12 Sept/)).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: /^Open 6 Sept/ }))
        expect(onGoToWeek).toHaveBeenCalledWith('2026-09-06')
    })

    it('turns away another restaurant', async () => {
        open()
        await upload(exportOf({ ...WEEK, store: 'Papi Chulo Elsewhere' }))
        expect(await screen.findByText(/Papi Chulo Elsewhere, which is not the restaurant you are in/))
            .toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /^Open/ })).toBeNull()
    })

    it('waits for the week to load before planning anything', async () => {
        open({ loading: true })
        await upload()
        expect(await screen.findByText(/Opening the week of 6 Sept/)).toBeInTheDocument()
    })
})
