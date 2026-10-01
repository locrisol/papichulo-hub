// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithRouter, tableOf } from '@/test/helpers'

// A super admin setting up the team at Point Campus. The rules let a super
// admin read every account, so what the picker offers is down to the page.

const USERS = [
    { id: 'u1', full_name: 'Maria', role: 'employee', restaurant_id: 'r1', is_active: true },
    { id: 'u2', full_name: 'Ana', role: 'employee', restaurant_id: 'r2', is_active: true },
    { id: 'u3', full_name: 'Bruno', role: 'store_manager', restaurant_id: 'r2', is_active: true },
]

const db = { from: vi.fn(table => tableOf(table === 'users' ? USERS : [])) }

vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({
    useAuth: () => ({ user: { id: 'me', role: 'super_admin', restaurant_id: 'r1' } }),
}))
vi.mock('@/context/confirm', () => ({ useConfirm: () => () => Promise.resolve(true) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Point Campus' } }),
}))

const { default: EmployeesPage } = await import('./EmployeesPage')

describe('linking somebody to an account', () => {
    // Picking one from the other restaurant either failed, because they were
    // already linked there, or linked a person here to a login there, whose
    // My shifts then read one restaurant's roster under the other's notes.
    it('offers only the accounts at the restaurant being worked on', async () => {
        renderWithRouter(<EmployeesPage />)
        await userEvent.click(await screen.findByRole('button', { name: 'Add someone' }))

        expect(screen.getByRole('option', { name: 'Maria (employee)' })).toBeInTheDocument()
        expect(screen.queryByRole('option', { name: 'Ana (employee)' })).not.toBeInTheDocument()
        expect(screen.queryByRole('option', { name: 'Bruno (store manager)' })).not.toBeInTheDocument()
    })
})
