// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockSupabase } from '@/test/helpers'

const me = { id: 'me', role: 'super_admin', restaurant_id: 'pc' }

// Arranged, not alphabetical: Point Campus was put first.
const RESTAURANTS = [
    { id: 'pc', name: 'Point Campus', sort_order: 0 },
    { id: 'dl', name: 'Dun Laoghaire', sort_order: 1 },
]

// Ordered by name, the way the query returns them.
const USERS = [
    { id: 'u1', full_name: 'Ana', role: 'employee', restaurant_id: 'dl', is_active: true },
    { id: 'u4', full_name: 'Aaron', role: 'store_manager', restaurant_id: 'dl', is_active: true },
    { id: 'u5', full_name: 'Zoe', role: 'owner', restaurant_id: 'dl', is_active: true },
    { id: 'me', full_name: 'Leandro', role: 'super_admin', restaurant_id: 'pc', is_active: true },
    { id: 'u3', full_name: 'Nobody Home', role: 'employee', restaurant_id: null, is_active: true },
    { id: 'u6', full_name: 'Test Owner', role: 'owner', restaurant_id: 'pc', is_active: true, is_test: true },
]

const db = mockSupabase({
    users: { data: USERS, error: null },
    restaurants: { data: RESTAURANTS, error: null },
    login_events: { data: [], error: null },
})

vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: me }) }))
vi.mock('@/context/confirm', () => ({ useConfirm: () => () => Promise.resolve(true) }))

const { default: UsersPage } = await import('./UsersPage')

async function show() {
    const view = render(<UsersPage />)
    await waitFor(() => expect(screen.queryByText('Loading users...')).not.toBeInTheDocument())
    return view
}

describe('UsersPage, grouped by restaurant', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('puts the restaurants up in the arranged order, not alphabetically', async () => {
        await show()
        const headings = screen.getAllByRole('button', { expanded: true }).map(b => b.textContent)
        expect(headings[0]).toContain('Point Campus')
        expect(headings[1]).toContain('Dun Laoghaire')
    })

    // Zoe the owner above Aaron the store manager above Ana, so the order is
    // the ladder rather than the alphabet. Test Owner sits by its real role
    // too: a developer account is marked, not demoted.
    it('sorts people by role, highest first, then by name', async () => {
        await show()
        const rows = document.querySelectorAll('table tbody tr td:first-child')
        const names = [...rows].map(td => td.textContent.replace(/you|test/g, '').trim())
        expect(names.slice(0, 5)).toEqual(['Leandro', 'Test Owner', 'Zoe', 'Aaron', 'Ana'])
    })

    it('offers arranging only when there is more than one restaurant', async () => {
        await show()
        expect(screen.getByRole('button', { name: 'Arrange restaurants' })).toBeInTheDocument()
    })

    // A new account lands with no restaurant until somebody says where it goes,
    // so this group is a thing to fix rather than a place to work. It comes last.
    it('gives anybody with no restaurant a group of their own, at the end', async () => {
        await show()
        const headings = screen.getAllByRole('button', { expanded: true }).map(b => b.textContent)
        expect(headings[headings.length - 1]).toContain('No restaurant set')
        // Twice over: the phone card and the table row are both rendered.
        expect(screen.getAllByText('Nobody Home').length).toBeGreaterThan(0)
    })

    it('counts the people in each group', async () => {
        await show()
        const dl = screen.getAllByRole('button', { expanded: true })[1]
        expect(dl.textContent).toContain('3 people')
    })

    it('opens expanded, because somebody arriving wants people and not headings', async () => {
        await show()
        expect(screen.getAllByText('Ana').length).toBeGreaterThan(0)
    })

    it('hides a group when its heading is pressed, and leaves the others alone', async () => {
        await show()
        const dl = screen.getAllByRole('button', { expanded: true })[1]
        await userEvent.click(dl)

        expect(screen.queryByText('Ana')).not.toBeInTheDocument()
        expect(screen.getAllByText('Leandro').length).toBeGreaterThan(0)
    })

    it('remembers what was shut, so a reload does not reopen it', async () => {
        await show()
        await userEvent.click(screen.getAllByRole('button', { expanded: true })[1])
        expect(JSON.parse(localStorage.getItem('usersShutGroups'))).toEqual(['dl'])
    })

    // The heading says the restaurant, so repeating it on every row was noise.
    it('does not repeat the restaurant on every row', async () => {
        await show()
        expect(screen.queryByRole('columnheader', { name: 'Restaurant' })).not.toBeInTheDocument()
    })

    it('still says who you are', async () => {
        await show()
        const pc = screen.getAllByRole('button', { expanded: true })[0]
        expect(within(pc.parentElement).getAllByText('you').length).toBeGreaterThan(0)
    })
})

// Eleven accounts that look like eleven people is how somebody counts the staff
// off this screen and gets it wrong by four.
describe('developer accounts', () => {
    it('are marked, so the list is not read as a staff list', async () => {
        await show()
        const marks = screen.getAllByText('test')
        expect(marks.length).toBe(2) // the phone card and the table row
        for (const mark of marks) {
            expect(mark.closest('tr, div').textContent).toContain('Test Owner')
        }
    })

    it('are still shown, because hiding them would make the page disagree with the database', async () => {
        await show()
        expect(screen.getAllByText('Test Owner').length).toBeGreaterThan(0)
    })

    it('leaves a real person unmarked', async () => {
        await show()
        const leandro = screen.getAllByText('Leandro')[0].closest('tr, div')
        expect(leandro.textContent).not.toContain('test')
    })
})
