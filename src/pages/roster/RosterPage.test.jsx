// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockSupabase, renderWithRouter, tableOf, makeQuery, A_RESTAURANT, A_MANAGER } from '@/test/helpers'
import { todayISO, weekStartOf, addDays } from '@/lib/dates'
import { NEARBY_FAILED } from '@/lib/nearby'

// The roster as a store manager sees it unless a test says otherwise, with the
// events nearby failing to load.
//
// When the events nearby could not be read, the week has no Arena row, and the
// line saying why is the only thing telling a manager it was not a quiet week.
// It used to share the page's one error line, so the next thing that went
// wrong wrote over it and the week said nothing about the missing row.

const MONDAY = weekStartOf(todayISO())

const tables = {
    employees: [{ id: 'emp1', restaurant_id: 'r1', full_name: 'Ana', is_active: true, sort_order: 1 }],
    roster_shifts: [{
        id: 's1', restaurant_id: 'r1', employee_id: 'emp1', shift_date: MONDAY,
        starts_at: '10:00', ends_at: '14:00', break_minutes: 0, published_at: null,
    }],
}

let db
// Who is signed in. A store manager unless a test says otherwise.
let me
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: A_RESTAURANT, setActiveRestaurant: () => {} }),
}))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: me }) }))
vi.mock('@/context/confirm', () => ({ useConfirm: () => () => Promise.resolve(true) }))
vi.mock('@/lib/rosterMail', () => ({
    emailTheAnswer: vi.fn(), emailTheShiftDecision: vi.fn(),
}))

const { default: RosterPage } = await import('./RosterPage')

beforeEach(() => {
    me = { ...A_MANAGER }
    db = {
        from: vi.fn(table => {
            if (table === 'events') return makeQuery({ data: null, error: { message: 'Failed to fetch' } })
            const query = tableOf(tables[table] || [])
            // Publishing the week is refused, which is the next thing to go
            // wrong after the read.
            if (table === 'roster_shifts') {
                query.update = vi.fn(() => makeQuery({ data: null, error: { message: 'The week could not be published.' } }))
            }
            return query
        }),
    }
})

describe('events nearby that could not be read', () => {
    it('stays said when something else goes wrong after it', async () => {
        renderWithRouter(<RosterPage />)
        expect(await screen.findByText(NEARBY_FAILED)).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Publish' }))

        expect(await screen.findByText('The week could not be published.')).toBeInTheDocument()
        expect(screen.getByText(NEARBY_FAILED)).toBeInTheDocument()
    })
})

// What each role is offered in the bar above the week.
const SETTINGS = ['Opening hours', 'Break rules', 'Roster rules', 'Every week']

describe('how the restaurant is set up, from the roster', () => {
    it('is offered to a store manager', async () => {
        renderWithRouter(<RosterPage />)
        expect(await screen.findByRole('button', { name: 'Add staff' })).toBeInTheDocument()
        for (const name of SETTINGS) {
            expect(screen.getByRole('button', { name })).toBeInTheDocument()
        }
    })

    // Only a store manager or a super admin can change the restaurant row, so
    // each of these saved nothing for an owner and said the setting could not
    // be found.
    it('is not offered to an owner, who still builds the week', async () => {
        me.role = 'owner'
        renderWithRouter(<RosterPage />)
        expect(await screen.findByRole('button', { name: 'Add staff' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Time off' })).toBeInTheDocument()
        for (const name of SETTINGS) {
            expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
        }
    })
})

// The roster, as the owner answering what is waiting on it. Invented people.

const MONDAY_AFTER = addDays(weekStartOf(todayISO()), 1)

const ANA = { id: 'e1', full_name: 'Ana', sort_order: 0, user_id: 'u-ana', restaurant_id: 'r1' }
const LEO = { id: 'e2', full_name: 'Leo', sort_order: 1, user_id: 'u-leo', restaurant_id: 'r1' }

const anasDayOff = {
    id: 'a1', restaurant_id: 'r1', employee_id: 'e1', kind: 'day_off',
    starts_on: MONDAY_AFTER, ends_on: MONDAY_AFTER, status: 'requested', created_at: '2026-09-01T10:00:00Z',
}
const anasMonday = {
    id: 's1', restaurant_id: 'r1', employee_id: 'e1', shift_date: MONDAY_AFTER,
    starts_at: '09:00:00', ends_at: '17:00:00', break_minutes: 30, published_at: '2026-09-01T10:00:00Z',
}

let made

function waitingOn(extra = {}) {
    const answer = {
        employees: { data: [ANA, LEO], error: null },
        absences: { data: [anasDayOff], error: null },
        roster_shifts: { data: [anasMonday], error: null },
        ...extra,
    }
    db = mockSupabase(answer)
    // Every query the page makes, so a test can say what was never asked.
    made = []
    db.from = vi.fn(table => {
        const query = makeQuery(answer[table] || { data: [], error: null })
        made.push([table, query])
        return query
    })
}

const deletedFrom = table => made.some(([t, q]) => t === table && q.delete.mock.calls.length > 0)

async function approveFreeingTheDay() {
    renderWithRouter(<RosterPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Answer it' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Approve and free that day' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, free those days' }))
}

// Approving used to take the shifts off first and then mark the request, and
// the second write matched nothing if Ana had taken her request back in the
// meantime. Her Monday was gone with nothing saying what it had been.
describe('answering time off', () => {
    beforeEach(() => {
        me = { id: 'u-owner', role: 'owner', full_name: 'The Owner' }
        waitingOn()
    })

    it('is one call that takes the shifts off and writes the answer together', async () => {
        db.rpc = vi.fn(() => Promise.resolve({
            data: { ...anasDayOff, status: 'approved', cleared_shifts: [{ date: MONDAY_AFTER, starts_at: '09:00:00', ends_at: '17:00:00' }] },
            error: null,
        }))
        await approveFreeingTheDay()

        await waitFor(() => expect(db.rpc).toHaveBeenCalledWith('answer_time_off', {
            request_id: 'a1', answer: 'approved', clear_shift_ids: ['s1'],
        }))
        expect(deletedFrom('roster_shifts')).toBe(false)
        expect(made.some(([t, q]) => t === 'absences' && q.update.mock.calls.length > 0)).toBe(false)
    })

    it('says so when the request was already answered or taken back', async () => {
        db.rpc = vi.fn(() => Promise.resolve({
            data: null,
            error: { code: 'P0001', message: 'This request has already been answered or was taken back' },
        }))
        await approveFreeingTheDay()

        expect(await screen.findByText('This request has already been answered or was taken back'))
            .toBeInTheDocument()
        expect(deletedFrom('roster_shifts')).toBe(false)
    })

    it('declines through the same call, freeing nothing', async () => {
        db.rpc = vi.fn(() => Promise.resolve({ data: { ...anasDayOff, status: 'declined' }, error: null }))
        renderWithRouter(<RosterPage />)
        fireEvent.click(await screen.findByRole('button', { name: 'Answer it' }))
        fireEvent.click(await screen.findByRole('button', { name: 'Decline' }))

        await waitFor(() => expect(db.rpc).toHaveBeenCalledWith('answer_time_off', {
            request_id: 'a1', answer: 'declined', clear_shift_ids: [],
        }))
    })
})
