// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { mockSupabase, renderWithRouter, A_RESTAURANT } from '@/test/helpers'

// The roster with nobody on it, for what each role is offered in the bar above
// the week.

const db = mockSupabase()
const me = { id: 'u1', full_name: 'Somebody', role: 'store_manager', restaurant_id: 'r1' }

vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: me }) }))
vi.mock('@/context/confirm', () => ({ useConfirm: () => () => Promise.resolve(true) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: A_RESTAURANT, setActiveRestaurant: () => {} }),
}))

const { default: RosterPage } = await import('./RosterPage')

const SETTINGS = ['Opening hours', 'Break rules', 'Roster rules', 'Every week']

beforeEach(() => { me.role = 'store_manager' })

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
