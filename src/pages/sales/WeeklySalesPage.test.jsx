// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockSupabase, makeQuery, renderWithRouter } from '@/test/helpers'
import { todayISO, weekStartOf, weekDates } from '@/lib/dates'

// Where Tab goes on the week grid.
//
// It has been changed twice, so it is written down here rather than left to
// whoever touches the handler next. The till's rows and Corporate go DOWN the
// block and on to the next day. The online platforms go ACROSS, Sunday to
// Saturday, and after Saturday on to the next platform's Sunday. His word, 27
// September: "only online platforms should tabulate to the right and then
// jump to the next row when reaching the end".

const platform = (id, name, bucket, sort_order, extra = {}) => ({
    id, key: name, name, bucket, sort_order, is_active: true, ...extra,
})
const PLATFORMS = [
    platform('p1', 'Deliveroo', 'online_platform', 1),
    platform('p2', 'Just Eat', 'online_platform', 2),
    platform('p3', 'Uber Eats', 'online_platform', 3),
    platform('p4', 'Clockmeal', 'catering', 4),
    platform('p5', 'Feedr', 'catering', 5),
]

// Changed by the tests below, so the database can move on between two visits.
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
// An update the database turns down, when a test sets one.
let refuseUpdate = null
// As much of the real database as these tests need. An insert or an update
// hands back the rows it wrote, the way the page asks it to, and an update can
// be made to fail. And a page asking for active platforms only gets active
// ones, as it would for real. Without that a retired platform would be on
// screen whatever the page asked for.
db.from.mockImplementation(table => {
    const query = makeQuery(tables[table] || { data: [], error: null })
    query.then = (resolve, reject) => {
        const activeOnly = query.eq.mock.calls.some(([field, value]) => field === 'is_active' && value === true)
        let result = activeOnly && Array.isArray(query.result.data)
            ? { ...query.result, data: query.result.data.filter(row => row.is_active) }
            : query.result
        if (query.insert.mock.calls.length) {
            result = { data: query.insert.mock.calls[0][0].map(r => ({ id: `id-${r.sale_date}`, ...r })), error: null }
        } else if (query.update.mock.calls.length) {
            result = refuseUpdate
                ? { data: null, error: refuseUpdate }
                : { data: [{ ...query.update.mock.calls[0][0], id: query.eq.mock.calls[0]?.[1] }], error: null }
        }
        return Promise.resolve(result).then(resolve, reject)
    }
    return query
})
// What the "are you sure" dialog answers.
const confirm = vi.fn(() => Promise.resolve(true))
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Testville' } }),
}))
vi.mock('@/context/confirm', () => ({ useConfirm: () => options => confirm(options) }))

const { default: WeeklySalesPage } = await import('./WeeklySalesPage')

// A block's boxes in the order they are in the page: row by row, Sunday to
// Saturday along each.
const boxes = block => Array.from(document.querySelectorAll(`input[data-block="${block}"]`))

// Three online platforms across seven days, unless a test brings in another.
async function openGrid(onlineBoxes = 21) {
    const view = renderWithRouter(<WeeklySalesPage />)
    await waitFor(() => expect(boxes('online_platform')).toHaveLength(onlineBoxes))
    return { ...view, user: userEvent.setup() }
}

beforeEach(() => {
    tables.sales_platforms = { data: PLATFORMS, error: null }
    tables.sales_records = { data: [], error: null }
    tables.day_notes = { data: [], error: null }
    confirm.mockImplementation(() => Promise.resolve(true))
    refuseUpdate = null
    localStorage.clear()
})

describe('the online platforms', () => {
    it('go along the row, one day to the next', async () => {
        const { user } = await openGrid()
        const online = boxes('online_platform')
        online[0].focus()
        await user.keyboard('{Tab}')
        expect(online[1]).toHaveFocus()
    })

    it('go from Saturday to the next platform\'s Sunday', async () => {
        const { user } = await openGrid()
        const online = boxes('online_platform')
        online[6].focus()
        await user.keyboard('{Tab}')
        expect(online[7]).toHaveFocus()
    })

    it('go back the same way with Shift+Tab', async () => {
        const { user } = await openGrid()
        const online = boxes('online_platform')
        online[7].focus()
        await user.keyboard('{Shift>}{Tab}{/Shift}')
        expect(online[6]).toHaveFocus()
    })
})

describe('everything else', () => {
    it('goes down the till receipt, Gross to Net', async () => {
        const { user } = await openGrid()
        const gross = screen.getByText('Gross sales').closest('tr').querySelector('input')
        const net = screen.getByText('Net sales').closest('tr').querySelector('input')
        gross.focus()
        await user.keyboard('{Tab}')
        expect(net).toHaveFocus()
    })

    it('goes down Corporate and on to the next day at the bottom', async () => {
        const { user } = await openGrid()
        const corporate = boxes('catering')
        corporate[0].focus()
        await user.keyboard('{Tab}')
        expect(corporate[7]).toHaveFocus()
        await user.keyboard('{Tab}')
        expect(corporate[1]).toHaveFocus()
    })
})

const WEEK = weekDates(weekStartOf(todayISO()))
const [SUNDAY, MONDAY, TUESDAY] = WEEK

function row(date, over = {}) {
    return {
        id: `id-${date}`, restaurant_id: 'r1', sale_date: date,
        gross_sales: 500, net_sales: 450, staff_food: 0, is_closed: false,
        tender_sales: { cash: 100, card: 400 }, platform_sales: {},
        ...over,
    }
}

const grossBox = i => screen.getByText('Gross sales').closest('tr').querySelectorAll('input')[i]
const rowBoxes = label => screen.getByText(label).closest('tr').querySelectorAll('input')

async function retype(user, box, value) {
    await user.clear(box)
    await user.type(box, value)
}

// Every write to sales_records, as [payload, id] for an update and
// [rows] for an insert.
function written(step) {
    return db.from.mock.results
        .filter((_, i) => db.from.mock.calls[i][0] === 'sales_records')
        .flatMap(({ value: q }) => q[step].mock.calls.map(c => [c[0], q.eq.mock.calls[0]?.[1]]))
}

async function saveWeek(user) {
    await user.click(screen.getByRole('button', { name: 'Save week' }))
}

// An unsaved week is kept on the computer it was typed on, and Save week
// writes it. The audit of 28 September found the two together could undo a
// week: a draft left on the office computer held all seven days, blanks
// included, and brought them back over days entered on a phone since, and Save
// week then wrote every one of them, zeros and all.
describe('the unsaved draft and Save week', () => {
    it('brings back what was typed when nothing else has changed', async () => {
        const view = await openGrid()
        await retype(view.user, grossBox(0), '300')
        view.unmount()

        await openGrid()
        expect(grossBox(0)).toHaveValue('300')
        expect(screen.getByText('Restored unsaved changes from this device.')).toBeInTheDocument()
    })

    // The finding's own example: Sunday typed on the office computer and left,
    // Monday entered on a phone since.
    it('does not blank a day saved somewhere else since', async () => {
        let view = await openGrid()
        await retype(view.user, grossBox(0), '300')
        view.unmount()

        tables.sales_records = { data: [row(MONDAY)], error: null }
        view = await openGrid()
        expect(grossBox(1)).toHaveValue('500')
        expect(grossBox(0)).toHaveValue('300')

        await saveWeek(view.user)
        await screen.findByText('Saved 1 day.')
        expect(written('update')).toEqual([])
        expect(written('insert')[0][0]).toEqual([expect.objectContaining({ sale_date: SUNDAY, gross_sales: 300 })])
    })

    // Worse than a blank, because it looks right: a filled day typed over
    // here, corrected on a phone since, would have come back as the old figure.
    it('does not bring back an edit to a day changed somewhere else, and says so', async () => {
        tables.sales_records = { data: [row(MONDAY)], error: null }
        const view = await openGrid()
        await retype(view.user, grossBox(1), '550')
        view.unmount()

        tables.sales_records = { data: [row(MONDAY, { gross_sales: 600 })], error: null }
        await openGrid()
        expect(grossBox(1)).toHaveValue('600')
        expect(screen.getByText(/not restored/)).toHaveTextContent(/Mon.*changed somewhere else since/)
    })

    it('writes only the days that changed', async () => {
        tables.sales_records = { data: [row(MONDAY), row(TUESDAY)], error: null }
        const { user } = await openGrid()
        await retype(user, grossBox(1), '510')

        await saveWeek(user)
        await screen.findByText('Saved 1 day.')
        const updates = written('update')
        expect(updates).toHaveLength(1)
        expect(updates[0][1]).toBe(`id-${MONDAY}`)
        expect(updates[0][0].gross_sales).toBe(510)
    })

    it('asks before writing over a day saved somewhere else since the week was opened', async () => {
        tables.sales_records = { data: [row(MONDAY)], error: null }
        const { user } = await openGrid()
        await retype(user, grossBox(1), '510')

        tables.sales_records = { data: [row(MONDAY, { gross_sales: 520 })], error: null }
        confirm.mockImplementation(() => Promise.resolve(false))
        await saveWeek(user)

        await waitFor(() => expect(confirm).toHaveBeenCalled())
        expect(JSON.stringify(confirm.mock.calls[0][0])).toContain('Mon')
        expect(written('update')).toEqual([])
    })

    // Sunday had no row when the week was opened, and one was added on a
    // phone since. Saving anyway writes over that row rather than trying to
    // add Sunday a second time.
    it('writes over a day added somewhere else since, when told to', async () => {
        const { user } = await openGrid()
        await retype(user, grossBox(0), '300')

        tables.sales_records = { data: [row(SUNDAY, { id: 'from-a-phone' })], error: null }
        await saveWeek(user)
        await screen.findByText('Saved 1 day.')
        expect(confirm).toHaveBeenCalled()
        expect(written('insert')).toEqual([])
        expect(written('update')).toEqual([[expect.objectContaining({ gross_sales: 300 }), 'from-a-phone']])
    })

    // A save that stopped half way: Sunday went in and Monday was turned
    // down. The next press has to know Sunday is saved, or it names Sunday as
    // changed on another screen and tries to add it a second time.
    it('knows which days a save that stopped half way did write', async () => {
        tables.sales_records = { data: [row(MONDAY)], error: null }
        const { user } = await openGrid()
        await retype(user, grossBox(0), '300')
        await retype(user, grossBox(1), '510')

        refuseUpdate = { message: 'Failed to fetch' }
        await saveWeek(user)
        await screen.findByRole('alert')
        const sunday = { id: `id-${SUNDAY}`, ...written('insert')[0][0][0] }

        tables.sales_records = { data: [sunday, row(MONDAY)], error: null }
        refuseUpdate = null
        await saveWeek(user)
        await screen.findByText(/^Saved \d days?\.$/)
        expect(confirm).not.toHaveBeenCalled()
        expect(written('insert')).toHaveLength(1)
    })

    // Save week has always written a day the roster shut, zeros and all, so
    // the sales row agrees with the roster. Writing only changed days must not
    // stop that.
    it('still writes a day the roster closed', async () => {
        tables.sales_records = { data: [row(MONDAY)], error: null }
        tables.day_notes = { data: [{ id: 'n1', note_date: MONDAY, is_closed: true }], error: null }
        const { user } = await openGrid()

        await saveWeek(user)
        await screen.findByText('Saved 1 day.')
        expect(written('update')[0][0]).toMatchObject({ is_closed: true, gross_sales: 0 })
    })
})

// A delivery platform's figures are kept under a key that never changes. They
// used to be kept under its name, so retiring one or renaming it in settings
// lost its past figures the next time one of those weeks was saved. Found by
// the audit of 28 September.
describe('the delivery platforms', () => {
    it('shows a retired platform on a week that has figures for it, and keeps them', async () => {
        const manna = platform('p6', 'Manna', 'online_platform', 6, { is_active: false })
        tables.sales_platforms = { data: [...PLATFORMS, manna], error: null }
        tables.sales_records = {
            data: [row(MONDAY, { platform_sales: { Deliveroo: 100, Manna: 40 } })], error: null,
        }
        const { user } = await openGrid(28)
        expect(screen.getByText('Manna').closest('tr')).toHaveTextContent('retired')
        expect(rowBoxes('Manna')[1]).toHaveValue('40')

        await retype(user, grossBox(1), '510')
        await saveWeek(user)
        await screen.findByText('Saved 1 day.')
        expect(written('update')[0][0].platform_sales).toEqual({ Deliveroo: 100, Manna: 40 })
    })

    it('shows and saves a renamed platform under the key its figures are kept under', async () => {
        tables.sales_platforms = {
            data: PLATFORMS.map(p => (p.id === 'p2' ? { ...p, name: 'JustEat' } : p)), error: null,
        }
        tables.sales_records = { data: [row(MONDAY, { platform_sales: { 'Just Eat': 60 } })], error: null }
        const { user } = await openGrid()
        expect(rowBoxes('JustEat')[1]).toHaveValue('60')

        await retype(user, rowBoxes('JustEat')[1], '65')
        await saveWeek(user)
        await screen.findByText('Saved 1 day.')
        expect(written('update')[0][0].platform_sales).toEqual({ 'Just Eat': 65 })
    })

    // The app going out before migration 026 is run. The platforms have no key
    // then, and every box on a day used to share one figure kept under
    // "undefined". The name is the key until 026 gives them one.
    const withoutKey = p => {
        const old = { ...p }
        delete old.key
        return old
    }

    it('keeps each platform apart on a database with no keys yet', async () => {
        tables.sales_platforms = { data: PLATFORMS.map(withoutKey), error: null }
        tables.sales_records = { data: [row(MONDAY, { platform_sales: { Deliveroo: 100, 'Just Eat': 20 } })], error: null }
        const { user } = await openGrid()
        expect(rowBoxes('Deliveroo')[1]).toHaveValue('100')
        expect(rowBoxes('Just Eat')[1]).toHaveValue('20')

        await retype(user, rowBoxes('Just Eat')[1], '25')
        await saveWeek(user)
        await screen.findByText('Saved 1 day.')
        expect(written('update')[0][0].platform_sales).toEqual({ Deliveroo: 100, 'Just Eat': 25 })
    })
})
