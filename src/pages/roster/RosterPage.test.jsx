// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithRouter, tableOf, makeQuery, A_RESTAURANT, A_MANAGER } from '@/test/helpers'
import { todayISO, weekStartOf } from '@/lib/dates'
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
const me = { ...A_MANAGER }
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: A_RESTAURANT, setActiveRestaurant: () => {} }),
}))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: me }) }))
vi.mock('@/context/confirm', () => ({ useConfirm: () => () => Promise.resolve(true) }))

const { default: RosterPage } = await import('./RosterPage')

beforeEach(() => {
    me.role = 'store_manager'
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
