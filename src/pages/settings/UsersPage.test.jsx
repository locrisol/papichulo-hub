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
    { id: 'me', full_name: 'Leandro', role: 'super_admin', restaurant_id: 'pc', is_active: true, password_set_at: null },
    { id: 'u3', full_name: 'Nobody Home', role: 'employee', restaurant_id: null, is_active: true },
    { id: 'u6', full_name: 'Test Owner', role: 'owner', restaurant_id: 'pc', is_active: true, is_test: true, password_set_at: null },
]

const db = mockSupabase({
    users: { data: USERS, error: null },
    restaurants: { data: RESTAURANTS, error: null },
    login_events: { data: [], error: null },
    employees: { data: [{ id: 'e1', full_name: 'Maria Silva', user_id: null, ended_on: null }], error: null },
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
        const names = [...rows].map(td => td.textContent.replace(/you|test|No password chosen yet/g, '').trim())
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

// Every account so far was made with a password somebody else picked.
describe('who has not chosen a password yet', () => {
    it('says so on each of them, and never on a developer account', async () => {
        await show()
        const row = name => screen.getAllByText(name).map(el => el.closest('tr')).find(Boolean)
        expect(row('Leandro').textContent).toContain('No password chosen yet')
        expect(row('Test Owner').textContent).not.toContain('No password chosen yet')
    })
})

// The button was there, disabled, since the start.
describe('adding an account', () => {
    it('sends an invite through the function and says so', async () => {
        db.functions.invoke = vi.fn(() => Promise.resolve({ data: { id: 'new' }, error: null }))
        await show()
        await userEvent.click(screen.getByRole('button', { name: '+ Add account' }))
        await userEvent.selectOptions(screen.getByLabelText('Restaurant'), 'pc')
        await userEvent.selectOptions(await screen.findByLabelText('Person on the team'), 'e1')
        expect(screen.getByLabelText('Name')).toHaveValue('Maria Silva')
        await userEvent.type(screen.getByLabelText('Email address'), 'maria@papichulo.ie')
        await userEvent.click(screen.getByRole('button', { name: 'Send the invite' }))

        await waitFor(() => expect(db.functions.invoke).toHaveBeenCalledWith('invite-user', {
            body: {
                fullName: 'Maria Silva', email: 'maria@papichulo.ie', role: 'employee',
                restaurantId: 'pc', employeeId: 'e1', origin: window.location.origin,
            },
        }))
        expect(await screen.findByText(/Invite sent to maria@papichulo.ie/)).toBeInTheDocument()
    })

    // The same dialog, on an account that exists, with the address the
    // database gave for it. Everything goes through the function, because the
    // email is the one field the app cannot write.
    it('edits an account through the function, with its email filled in', async () => {
        const rpc = db.rpc
        db.rpc = vi.fn(() => Promise.resolve({ data: [{ id: 'u1', email: 'ana@papichulo.ie' }], error: null }))
        db.functions.invoke = vi.fn(() => Promise.resolve({ data: { id: 'u1', emailChanged: true }, error: null }))
        await show()
        expect(screen.getAllByText('ana@papichulo.ie').length).toBeGreaterThan(0)
        const row = screen.getAllByText('Ana').map(el => el.closest('tr')).find(Boolean)
        await userEvent.click(within(row).getByRole('button', { name: 'Edit' }))
        expect(screen.getByRole('dialog', { name: 'Edit account' })).toBeInTheDocument()
        expect(screen.getByLabelText('Restaurant')).toHaveValue('dl')
        expect(screen.getByLabelText('Email address')).toHaveValue('ana@papichulo.ie')
        await userEvent.clear(screen.getByLabelText('Email address'))
        await userEvent.type(screen.getByLabelText('Email address'), 'ana.silva@papichulo.ie')
        await userEvent.selectOptions(screen.getByLabelText('Role'), 'store_manager')
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => expect(db.functions.invoke).toHaveBeenCalledWith('invite-user', {
            body: {
                action: 'update', id: 'u1', fullName: 'Ana', email: 'ana.silva@papichulo.ie', role: 'store_manager',
                restaurantId: 'dl', employeeId: null,
            },
        }))
        expect(await screen.findByText(/Ana saved. They sign in with ana.silva@papichulo.ie/)).toBeInTheDocument()
        db.rpc = rpc
    })

    it('keeps the dialog open and says why when it did not go', async () => {
        db.functions.invoke = vi.fn(() => Promise.resolve({ data: { error: 'That email already has an account.' }, error: null }))
        await show()
        await userEvent.click(screen.getByRole('button', { name: '+ Add account' }))
        await userEvent.selectOptions(screen.getByLabelText('Restaurant'), 'pc')
        await userEvent.type(screen.getByLabelText('Name'), 'Maria Silva')
        await userEvent.type(screen.getByLabelText('Email address'), 'maria@papichulo.ie')
        await userEvent.click(screen.getByRole('button', { name: 'Send the invite' }))
        expect(await screen.findByText('That email already has an account.')).toBeInTheDocument()
        expect(screen.getByRole('dialog', { name: 'Add an account' })).toBeInTheDocument()
    })
})
