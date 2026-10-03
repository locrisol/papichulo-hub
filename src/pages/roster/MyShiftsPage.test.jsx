// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { mockSupabase, makeQuery, renderWithRouter, tableOf } from '@/test/helpers'
import { todayISO, weekStartOf, addDays } from '@/lib/dates'

// My shifts, the page every employee lands on. Staff are refused the
// restaurants table and the employees table, because both rows carry things
// that are not theirs to see. So the hours and rules come from
// staff_restaurants, and who they are on the roster from roster_colleagues.
// Invented people.

const ME = { id: 'e1', restaurant_id: 'r1', full_name: 'Ana Test', position_id: null, sort_order: 0 }
const COLLEAGUES = [ME, { id: 'e2', restaurant_id: 'r1', full_name: 'Ben Test', position_id: null, sort_order: 1 }]

const EVERY_DAY = Object.fromEntries(
    ['0', '1', '2', '3', '4', '5', '6'].map(d => [d, { open: '09:00', close: '21:00' }]),
)
const MY_DAY_OFF = {
    id: 'a1', employee_id: 'e1', restaurant_id: 'r1', kind: 'day_off',
    starts_on: '2026-10-12', ends_on: '2026-10-12', status: 'requested',
}

let db
let answer
// Who get_my_employee_id says they are: Ana unless a test says otherwise.
let myId
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'employee', restaurant_id: 'r1' } }) }))
vi.mock('@/context/confirm', () => ({ useConfirm: () => () => Promise.resolve(true) }))

const { default: MyShiftsPage } = await import('./MyShiftsPage')

function tables(extra = {}) {
    myId = 'e1'
    answer = {
        // What the database gives an employee: nothing from either table,
        // and their own restaurant from the view.
        employees: { data: null, error: null },
        restaurants: { data: null, error: null },
        staff_restaurants: {
            data: { opening_hours: EVERY_DAY, break_rules: [], roster_rules: {}, watch_city_events: true },
            error: null,
        },
        absences: { data: [MY_DAY_OFF], error: null },
        ...extra,
    }
    db = mockSupabase(answer)
    db.from = vi.fn(table => (table === 'roster_colleagues' && !answer.roster_colleagues
        ? tableOf(COLLEAGUES)
        : makeQuery(answer[table] || { data: [], error: null })))
    db.rpc = vi.fn(name => Promise.resolve(
        name === 'get_my_employee_id' ? { data: myId, error: null } : { data: null, error: null },
    ))
}

const asked = () => db.from.mock.calls.map(([table]) => table)

beforeEach(() => tables())

// A table that answers for the filters it was asked, as far as these tests need:
// eq, and not is null.
function filtered(rows) {
    const keep = []
    const query = makeQuery()
    query.eq = vi.fn((column, value) => { keep.push(r => r[column] === value); return query })
    query.not = vi.fn((column, op, value) => {
        if (op === 'is' && value === null) keep.push(r => r[column] !== null && r[column] !== undefined)
        return query
    })
    query.then = (resolve, reject) => Promise.resolve({
        data: rows.filter(r => keep.every(k => k(r))), error: null,
    }).then(resolve, reject)
    return query
}

// A manager can read every shift, drafts included, and a super admin every
// restaurant's. My shifts read the table straight, so a store manager on the
// roster saw next week's draft as though it had gone out, and could ask a
// colleague for a shift that colleague could not see.
describe('the week on My shifts', () => {
    const monday = addDays(weekStartOf(todayISO()), 1)
    const tuesday = addDays(monday, 1)
    const shifts = [
        { id: 's1', restaurant_id: 'r1', employee_id: 'e1', shift_date: monday, starts_at: '09:00:00', ends_at: '17:00:00', break_minutes: 30, published_at: '2026-09-01T10:00:00Z' },
        { id: 's2', restaurant_id: 'r1', employee_id: 'e1', shift_date: tuesday, starts_at: '10:00:00', ends_at: '14:00:00', break_minutes: 0, published_at: null },
        { id: 's3', restaurant_id: 'r2', employee_id: 'e9', shift_date: monday, starts_at: '12:00:00', ends_at: '20:00:00', break_minutes: 30, published_at: '2026-09-01T10:00:00Z' },
    ]

    it('shows only what has been published, at their own restaurant', async () => {
        const plain = db.from
        db.from = vi.fn(table => (['roster_shifts', 'roster_published'].includes(table) ? filtered(shifts) : plain(table)))

        renderWithRouter(<MyShiftsPage />)

        expect(await screen.findByText('09:00 to 17:00')).toBeInTheDocument()
        expect(screen.queryByText('10:00 to 14:00')).toBeNull()
        expect(screen.queryByText(/12:00 to 20:00/)).toBeNull()
    })
})

// Changing a shift after the week went out takes it back to a draft, so the
// manager can see there are changes nobody has been told about. Staff could
// only read published rows, so Ana's Monday vanished from her week and her
// phone until the week was published again. roster_published is the week as
// it went out, with a changed shift still as it was then.
describe('a shift changed after the week went out', () => {
    it('is still on their week, as it was when it went out', async () => {
        const monday = addDays(weekStartOf(todayISO()), 1)
        const asItWent = {
            id: 's1', restaurant_id: 'r1', employee_id: 'e1', shift_date: monday,
            starts_at: '09:00:00', ends_at: '17:00:00', break_minutes: 30, note: null,
            published_at: '2026-09-01T10:00:00Z',
        }
        const plain = db.from
        db.from = vi.fn(table => {
            if (table === 'roster_published') return filtered([asItWent])
            if (table === 'roster_shifts') return filtered([])
            return plain(table)
        })

        renderWithRouter(<MyShiftsPage />)
        expect(await screen.findByText('09:00 to 17:00')).toBeInTheDocument()
    })

    // Staff get the columns their screen uses and nothing else, so the page
    // names them rather than asking for the lot.
    it('asks for the columns it shows, not every one', async () => {
        const asked = []
        const plain = db.from
        db.from = vi.fn(table => {
            if (table !== 'roster_published') return plain(table)
            const query = filtered([])
            asked.push(query)
            return query
        })

        renderWithRouter(<MyShiftsPage />)
        await waitFor(() => expect(asked.length).toBeGreaterThan(0))
        for (const query of asked) {
            expect(query.select).toHaveBeenCalled()
            expect(query.select.mock.calls[0][0]).not.toContain('*')
        }
    })
})

// The first thing the page asks is which name on the team list is theirs. If
// that failed, a dropped signal on a phone say, the page said their account
// was not linked and to ask a manager, sending both of them after a setup
// problem that was not there.
describe('when the page cannot load', () => {
    it('says it could not load, not that the account is not linked', async () => {
        db.rpc = vi.fn(() => Promise.resolve({ data: null, error: { message: 'Failed to fetch' } }))

        renderWithRouter(<MyShiftsPage />)

        expect(await screen.findByRole('alert'))
            .toHaveTextContent('Could not reach the server. Check your connection and try again.')
        expect(screen.queryByText('Not on the team list yet')).toBeNull()
    })

    it('still says so when the account really is not linked', async () => {
        myId = null

        renderWithRouter(<MyShiftsPage />)

        expect(await screen.findByText('Not on the team list yet')).toBeInTheDocument()
    })
})

// Taking a request back is a delete the database only allows while it is
// still waiting. Once a manager had answered it, the delete matched nothing
// and the page carried on as if it had worked.
describe('cancelling a request for time off', () => {
    it('says so when a manager has already answered it', async () => {
        const plain = db.from
        db.from = vi.fn(table => {
            const query = plain(table)
            if (table === 'absences') query.delete = vi.fn(() => makeQuery({ data: [], error: null }))
            return query
        })

        renderWithRouter(<MyShiftsPage />)
        fireEvent.click(await screen.findByRole('button', { name: 'Cancel this request' }))

        expect(await screen.findByText('This request has already been answered, so it cannot be cancelled.'))
            .toBeInTheDocument()
    })
})

// What somebody's own week reads to draw itself.
describe('my own week', () => {
    it('reads the opening hours from the staff view', async () => {
        renderWithRouter(<MyShiftsPage />)
        await screen.findByText('Ana Test')
        expect(screen.getAllByText('Open 09:00 to 21:00')).toHaveLength(7)
        expect(asked()).not.toContain('restaurants')
    })

    // The places nearby come through staff_places, without the page
    // address, the Ticketmaster id or the reading settings.
    it('reads the places nearby from the staff view', async () => {
        renderWithRouter(<MyShiftsPage />)
        await screen.findByText('Ana Test')
        const pairings = db.from.mock.results
            .filter((_, i) => db.from.mock.calls[i][0] === 'restaurant_places')
            .map(r => r.value.select.mock.calls[0][0])
        expect(pairings.length).toBeGreaterThan(0)
        for (const columns of pairings) expect(columns).toContain('place:staff_places(')
    })

    // What is on comes from staff_diary, without where each entry is on
    // Google or who wrote it.
    it('reads what is on from the staff view', async () => {
        renderWithRouter(<MyShiftsPage />)
        await screen.findByText('Ana Test')
        expect(asked()).toContain('staff_diary')
        expect(asked()).not.toContain('diary_entries')
    })

    // The employees row carries their hourly rate and whatever a manager
    // wrote about them in Notes, so it is not read at all.
    it('finds me on the roster without reading the employees table', async () => {
        renderWithRouter(<MyShiftsPage />)
        expect(await screen.findByText('Ana Test')).toBeInTheDocument()
        expect(db.rpc).toHaveBeenCalledWith('get_my_employee_id')
        expect(asked()).not.toContain('employees')
    })
})

// A swap between two other people is theirs: who asked whom, the hours and
// the message. All this page needs of it is that somebody has asked about the
// shift, for the mark on the week, and roster_asks gives only that. Their own
// requests still come whole, because the cards above the week are about them.
describe('asks about other people\'s shifts', () => {
    const monday = addDays(weekStartOf(todayISO()), 1)
    const bens = {
        id: 's5', restaurant_id: 'r1', employee_id: 'e2', shift_date: monday,
        starts_at: '12:00:00', ends_at: '20:00:00', break_minutes: 30, published_at: '2026-09-01T10:00:00Z',
    }

    it('marks the shift without reading anybody else\'s request', async () => {
        const requestFilters = []
        const plain = db.from
        db.from = vi.fn(table => {
            if (table === 'roster_published') return filtered([bens])
            if (table === 'roster_asks') return makeQuery({ data: [{ give_shift_id: 's5', take_shift_id: null, status: 'asked' }], error: null })
            const query = plain(table)
            if (table === 'shift_requests') {
                query.or = vi.fn(filter => { requestFilters.push(filter); return query })
            }
            return query
        })

        renderWithRouter(<MyShiftsPage />)
        fireEvent.click(await screen.findByRole('button', { name: 'Everyone' }))

        expect(await screen.findByTitle('Somebody has asked about this')).toBeInTheDocument()
        expect(requestFilters.length).toBeGreaterThan(0)
        for (const filter of requestFilters) {
            expect(filter).toBe('from_employee_id.eq.e1,to_employee_id.eq.e1')
        }
    })
})

// The note a manager writes on a shift is for the person on it. Their phone
// calendar has always carried it, and My shifts meant to show it too but
// read a column that does not exist, so it never did. roster_published gives
// each person the note on their own shifts and nobody else's.
describe('the note on a shift', () => {
    const monday = addDays(weekStartOf(todayISO()), 1)
    const shifts = [
        { id: 's1', restaurant_id: 'r1', employee_id: 'e1', shift_date: monday, starts_at: '09:00:00', ends_at: '17:00:00', break_minutes: 30, note: 'Bring the float up from the office', published_at: '2026-09-01T10:00:00Z' },
        { id: 's2', restaurant_id: 'r1', employee_id: 'e2', shift_date: monday, starts_at: '12:00:00', ends_at: '20:00:00', break_minutes: 30, note: null, published_at: '2026-09-01T10:00:00Z' },
    ]

    it('shows on their own shift', async () => {
        const selects = []
        const plain = db.from
        db.from = vi.fn(table => {
            if (table !== 'roster_published') return plain(table)
            const query = filtered(shifts)
            const select = query.select
            query.select = vi.fn(columns => { selects.push(columns); return select(columns) })
            return query
        })

        renderWithRouter(<MyShiftsPage />)

        expect(await screen.findByText('Bring the float up from the office')).toBeInTheDocument()
        expect(selects[0]).toMatch(/\bnote\b/)
    })
})

// Who was on the team and who was off come from roster_colleagues and
// roster_away, which give staff eight weeks either side of this one and no
// more: nobody who left long ago, no time off from last year, and nobody's
// leaving date months before it matters. So the week stops there too, rather
// than opening on a week with nobody's name on it.
describe('how far the week goes', () => {
    it('stops eight weeks back and eight weeks ahead', async () => {
        renderWithRouter(<MyShiftsPage />)
        const back = await screen.findByRole('button', { name: 'Previous week' })
        const next = screen.getByRole('button', { name: 'Next week' })

        for (let i = 0; i < 8; i++) {
            expect(back).toBeEnabled()
            fireEvent.click(back)
        }
        await waitFor(() => expect(back).toBeDisabled())

        for (let i = 0; i < 16; i++) {
            await waitFor(() => expect(next).toBeEnabled())
            fireEvent.click(next)
        }
        await waitFor(() => expect(next).toBeDisabled())
    })
})

// A card about a shift in another week offers to open that week. A request
// can be older than the weeks the page opens, one left waiting for months
// say, and the link then opened the last week it could reach, which was not
// the week on the card. So it is only offered when it can get there.
describe('a request about another week', () => {
    const thisWeek = weekStartOf(todayISO())
    const bensShift = (id, weeks) => ({
        id, restaurant_id: 'r1', employee_id: 'e2', shift_date: addDays(thisWeek, weeks * 7 + 1),
        starts_at: '12:00:00', ends_at: '20:00:00', break_minutes: 30, note: null,
        published_at: '2026-09-01T10:00:00Z',
    })
    const ask = (id, shiftId) => ({
        id, restaurant_id: 'r1', from_employee_id: 'e2', to_employee_id: 'e1',
        give_shift_id: shiftId, take_shift_id: null, status: 'asked', message: null,
        created_at: '2026-09-01T10:00:00Z',
    })

    it('offers to open the week only when the page can open it', async () => {
        tables({ shift_requests: { data: [ask('q1', 'far'), ask('q2', 'near')], error: null } })
        const shifts = [bensShift('far', -12), bensShift('near', 2)]
        const plain = db.from
        db.from = vi.fn(table => (table === 'roster_published' ? filtered(shifts) : plain(table)))

        renderWithRouter(<MyShiftsPage />)

        expect(await screen.findAllByText(/Not this week\./)).toHaveLength(2)
        expect(screen.getAllByRole('button', { name: 'Open that week' })).toHaveLength(1)
    })
})

// roster_published gives staff the weeks My shifts opens and one more, so a
// shift from before then is not there to read. A request that has been
// answered shows only while its shift is still to come, and one whose shift
// cannot be read has nothing left to say: it used to come back as an empty
// card above the week, for every answered request older than the window.
describe('a request already answered', () => {
    const thisWeek = weekStartOf(todayISO())
    const answered = (id, shiftId) => ({
        id, restaurant_id: 'r1', from_employee_id: 'e2', to_employee_id: 'e1',
        give_shift_id: shiftId, take_shift_id: null, status: 'declined', message: null,
        created_at: '2026-06-01T10:00:00Z',
    })
    const coming = {
        id: 'coming', restaurant_id: 'r1', employee_id: 'e2', shift_date: addDays(thisWeek, 15),
        starts_at: '12:00:00', ends_at: '20:00:00', break_minutes: 30, note: null,
        published_at: '2026-09-01T10:00:00Z',
    }

    it('is left off when its shift is too long ago to read', async () => {
        tables({ shift_requests: { data: [answered('q1', 'long-ago'), answered('q2', 'coming')], error: null } })
        const plain = db.from
        db.from = vi.fn(table => (table === 'roster_published' ? filtered([coming]) : plain(table)))

        renderWithRouter(<MyShiftsPage />)

        expect(await screen.findAllByText('Declined')).toHaveLength(1)
        await waitFor(() => expect(screen.getAllByText('Declined')).toHaveLength(1))
    })
})

// Asking somebody to take a shift happens in a dialog that covers the page.
// A failed send went into the page's own line, behind the dialog, so the
// person holding it open saw nothing happen and pressed Send again.
describe('an ask that fails to send', () => {
    const monday = addDays(weekStartOf(todayISO()), 1)
    const mine = {
        id: 's1', restaurant_id: 'r1', employee_id: 'e1', shift_date: monday,
        starts_at: '09:00:00', ends_at: '17:00:00', break_minutes: 30, note: null,
        published_at: '2026-09-01T10:00:00Z',
    }

    it('says so inside the dialog, and starts clean when it opens again', async () => {
        tables({ shift_requests: { data: null, error: { message: 'Failed to fetch' } } })
        const plain = db.from
        db.from = vi.fn(table => (table === 'roster_published' ? filtered([mine]) : plain(table)))

        renderWithRouter(<MyShiftsPage />)
        fireEvent.click(await screen.findByRole('button', { name: 'Ask somebody to take this shift' }))
        const dialog = await screen.findByRole('dialog')
        fireEvent.click(within(dialog).getByRole('button', { name: /Ben Test/ }))
        fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }))

        expect(await within(dialog).findByRole('alert'))
            .toHaveTextContent('Could not reach the server. Check your connection and try again.')
        expect(screen.getAllByRole('alert')).toHaveLength(1)

        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        fireEvent.click(screen.getByRole('button', { name: 'Ask somebody to take this shift' }))
        expect(within(await screen.findByRole('dialog')).queryByRole('alert')).toBeNull()
    })
})
