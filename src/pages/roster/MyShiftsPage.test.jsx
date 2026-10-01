// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { mockSupabase, makeQuery, renderWithRouter } from '@/test/helpers'
import { todayISO, weekStartOf, addDays } from '@/lib/dates'

// My shifts, the page every employee lands on. Invented people.

const ME = { id: 'e1', restaurant_id: 'r1', full_name: 'Ana Test', position_id: null }

const EVERY_DAY = Object.fromEntries(
    ['0', '1', '2', '3', '4', '5', '6'].map(d => [d, { open: '09:00', close: '21:00' }]),
)
const MY_DAY_OFF = {
    id: 'a1', employee_id: 'e1', restaurant_id: 'r1', kind: 'day_off',
    starts_on: '2026-10-12', ends_on: '2026-10-12', status: 'requested',
}

let db
let answer
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'employee' } }) }))
vi.mock('@/context/confirm', () => ({ useConfirm: () => () => Promise.resolve(true) }))

const { default: MyShiftsPage } = await import('./MyShiftsPage')

function tables(extra = {}) {
    answer = {
        employees: { data: ME, error: null },
        // What the database gives an employee: nothing from the table, their
        // own restaurant from the view.
        restaurants: { data: null, error: null },
        staff_restaurants: {
            data: { opening_hours: EVERY_DAY, break_rules: [], roster_rules: {}, watch_city_events: true },
            error: null,
        },
        absences: { data: [MY_DAY_OFF], error: null },
        ...extra,
    }
    db = mockSupabase(answer)
    db.from = vi.fn(table => makeQuery(answer[table] || { data: [], error: null }))
}

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
        tables({ employees: { data: null, error: { message: 'Failed to fetch' } } })

        renderWithRouter(<MyShiftsPage />)

        expect(await screen.findByRole('alert'))
            .toHaveTextContent('Could not reach the server. Check your connection and try again.')
        expect(screen.queryByText('Not on the team list yet')).toBeNull()
    })

    it('still says so when the account really is not linked', async () => {
        tables({ employees: { data: null, error: null } })

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

// What somebody's own week reads to draw itself. Staff are refused the
// restaurants table, so the hours and rules come from staff_restaurants, the
// part of the row their screens use.
describe('my own week', () => {
    it('reads the opening hours from the staff view', async () => {
        renderWithRouter(<MyShiftsPage />)
        await screen.findByText('Ana Test')
        expect(screen.getAllByText('Open 09:00 to 21:00')).toHaveLength(7)
        expect(db.from.mock.calls.map(([table]) => table)).not.toContain('restaurants')
    })
})
