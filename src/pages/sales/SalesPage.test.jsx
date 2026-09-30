// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockSupabase, makeQuery, renderWithRouter } from '@/test/helpers'
import { todayISO } from '@/lib/dates'

// The day form and the delivery platforms.
//
// A platform's figures are kept under a key that never changes. They used to
// be kept under its name, so retiring one or renaming it in settings lost its
// figures the next time an old day was saved. Found by the audit of 28
// September. The week grid has the same tests.

const platform = (id, name, sort_order, extra = {}) => ({
    id, key: name, name, bucket: 'online_platform', sort_order, is_active: true, ...extra,
})
const PLATFORMS = [platform('p1', 'Deliveroo', 1), platform('p2', 'Just Eat', 2)]

const tables = {
    sales_tenders: {
        data: [
            { key: 'cash', label: 'Cash Sales', sort_order: 1, is_active: true, counts_toward_gross: true },
            { key: 'card', label: 'Card', sort_order: 2, is_active: true, counts_toward_gross: true },
        ],
        error: null,
    },
}
const db = mockSupabase(tables)
// A page asking for active platforms only gets active ones, as it would for
// real, so a retired platform is only on screen if the page asked for it.
db.from.mockImplementation(table => {
    const query = makeQuery(tables[table] || { data: [], error: null })
    query.then = (resolve, reject) => {
        const activeOnly = query.eq.mock.calls.some(([field, value]) => field === 'is_active' && value === true)
        const result = activeOnly && Array.isArray(query.result.data)
            ? { ...query.result, data: query.result.data.filter(row => row.is_active) }
            : query.result
        return Promise.resolve(result).then(resolve, reject)
    }
    return query
})
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Testville' } }),
}))
// What the "are you sure" dialog answers.
const confirm = vi.fn(() => Promise.resolve(true))
vi.mock('@/context/confirm', () => ({ useConfirm: () => options => confirm(options) }))

const { default: SalesPage } = await import('./SalesPage')

function today(platformSales) {
    return {
        data: {
            id: 'rec1', restaurant_id: 'r1', sale_date: todayISO(),
            gross_sales: 500, net_sales: 450, staff_food: 0, is_closed: false,
            tender_sales: { cash: 100, card: 400 }, platform_sales: platformSales,
        },
        error: null,
    }
}

// The box under a label. The labels here are not tied to their boxes.
const boxUnder = label => screen.getByText(label).parentElement.querySelector('input')

async function openDay() {
    renderWithRouter(<SalesPage />, { route: '/sales?view=day' })
    await screen.findByText('Till receipt')
    return userEvent.setup()
}

// Every write of a given kind to sales_records, as [payload, id].
function writes(step) {
    return db.from.mock.results
        .filter((_, i) => db.from.mock.calls[i][0] === 'sales_records')
        .flatMap(({ value: q }) => q[step].mock.calls.map(c => [c[0], q.eq.mock.calls[0]?.[1]]))
}

// The one update the save sends.
function saved() {
    const updates = writes('update')
    expect(updates).toHaveLength(1)
    return updates[0][0]
}

beforeEach(() => {
    tables.sales_platforms = { data: PLATFORMS, error: null }
    tables.day_notes = { data: null, error: null }
    confirm.mockImplementation(() => Promise.resolve(true))
})

// Two screens on one day. The day view used to ask "Overwrite this day?"
// whenever the day had a record, whether or not it had changed since it was
// opened, so a correction made on a phone was written over without a word.
describe('a day saved somewhere else since it was opened', () => {
    it('asks as usual when nothing has changed', async () => {
        tables.sales_records = today({})
        const user = await openDay()
        await user.click(screen.getByRole('button', { name: 'Update day' }))
        await waitFor(() => expect(confirm).toHaveBeenCalled())
        expect(confirm.mock.calls[0][0].title).toBe('Overwrite this day?')
    })

    it('says so when it has, and writes nothing unless told to', async () => {
        tables.sales_records = today({})
        const user = await openDay()
        tables.sales_records = { data: { ...today({}).data, gross_sales: 520 }, error: null }
        confirm.mockImplementation(() => Promise.resolve(false))

        await user.click(screen.getByRole('button', { name: 'Update day' }))
        await waitFor(() => expect(confirm).toHaveBeenCalled())
        expect(confirm.mock.calls[0][0].title).toBe('Changed somewhere else')
        expect(writes('update')).toEqual([])
    })

    // Nothing was stored when the day was opened and something is now. Saving
    // anyway writes over that row, where it used to try to add the day a
    // second time and be turned down.
    it('writes over a day added somewhere else since', async () => {
        tables.sales_records = { data: null, error: null }
        const user = await openDay()
        await user.type(boxUnder('Gross sales'), '300')
        tables.sales_records = today({})

        await user.click(screen.getByRole('button', { name: 'Save day' }))
        await waitFor(() => expect(writes('update')).toHaveLength(1))
        expect(confirm.mock.calls[0][0].title).toBe('Changed somewhere else')
        expect(writes('update')[0]).toEqual([expect.objectContaining({ gross_sales: 300 }), 'rec1'])
        expect(writes('insert')).toEqual([])
    })
})

describe('the delivery platforms on the day form', () => {
    it('shows a retired platform the day has a figure for, and keeps it', async () => {
        tables.sales_platforms = {
            data: [...PLATFORMS, platform('p3', 'Manna', 3, { is_active: false })], error: null,
        }
        tables.sales_records = today({ Deliveroo: 100, Manna: 40 })
        const user = await openDay()
        expect(screen.getByText('Manna').parentElement).toHaveTextContent('retired')
        expect(boxUnder('Manna')).toHaveValue('40')

        await user.click(screen.getByRole('button', { name: 'Update day' }))
        await waitFor(() => expect(saved().platform_sales).toEqual({ Deliveroo: 100, Manna: 40 }))
    })

    it('shows and saves a renamed platform under the key its figures are kept under', async () => {
        tables.sales_platforms = {
            data: PLATFORMS.map(p => (p.id === 'p2' ? { ...p, name: 'JustEat' } : p)), error: null,
        }
        tables.sales_records = today({ 'Just Eat': 60 })
        const user = await openDay()
        expect(boxUnder('JustEat')).toHaveValue('60')

        await user.clear(boxUnder('JustEat'))
        await user.type(boxUnder('JustEat'), '65')
        await user.click(screen.getByRole('button', { name: 'Update day' }))
        await waitFor(() => expect(saved().platform_sales).toEqual({ 'Just Eat': 65 }))
    })

    // Before migration 026 the platforms have no key, and the name is still
    // what the figures are kept under.
    it('keeps each platform apart on a database with no keys yet', async () => {
        const withoutKey = p => {
            const old = { ...p }
            delete old.key
            return old
        }
        tables.sales_platforms = { data: PLATFORMS.map(withoutKey), error: null }
        tables.sales_records = today({ Deliveroo: 100, 'Just Eat': 20 })
        const user = await openDay()
        expect(boxUnder('Deliveroo')).toHaveValue('100')
        expect(boxUnder('Just Eat')).toHaveValue('20')

        await user.clear(boxUnder('Just Eat'))
        await user.type(boxUnder('Just Eat'), '25')
        await user.click(screen.getByRole('button', { name: 'Update day' }))
        await waitFor(() => expect(saved().platform_sales).toEqual({ Deliveroo: 100, 'Just Eat': 25 }))
    })
})
