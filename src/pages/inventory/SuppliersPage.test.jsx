// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// A whole page, loading from the database and showing what it loaded.
//
// This is the shape the lint work needs, not the detail. 26 of the 33 problems
// are an effect calling a function declared below it, and the fix moves code
// around inside these files. An effect that stops firing says nothing at all:
// the page just renders empty, and with no component tests the only way to find
// out was to open twenty screens and look.
//
// So what is asserted here is deliberately shallow and hard to break by
// accident: it fetched, and what came back is on the screen.

const suppliers = [
    { id: 's1', name: 'Sysco Ireland', category: 'food', is_active: true, notes: '' },
    { id: 's2', name: 'Sherpack', category: 'packaging', is_active: true, notes: '' },
    { id: 's3', name: 'Gone Ltd', category: 'food', is_active: false, notes: '' },
]

const asked = []

vi.mock('@/lib/supabase', () => {
    const chain = table => {
        const q = {}
        for (const step of ['select', 'eq', 'neq', 'order', 'in', 'gte', 'lte', 'insert', 'update', 'delete']) {
            q[step] = () => q
        }
        q.then = (res, rej) => Promise.resolve({
            data: table === 'suppliers' ? suppliers : [],
            error: null,
        }).then(res, rej)
        return q
    }
    return {
        supabase: {
            from: table => {
                asked.push(table)
                return chain(table)
            },
        },
    }
})

vi.mock('@/context/auth', () => ({
    useAuth: () => ({ user: { id: 'u1', role: 'store_manager', restaurant_id: 'r1' }, loading: false }),
}))

vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Point Campus' }, loading: false }),
}))

vi.mock('@/context/confirm', () => ({
    useConfirm: () => () => Promise.resolve(true),
}))

vi.mock('@/context/ScrollContext', () => ({
    useKeepScroll: () => {},
}))

const { default: SuppliersPage } = await import('./SuppliersPage')

const renderPage = () => render(<MemoryRouter><SuppliersPage /></MemoryRouter>)

describe('SuppliersPage', () => {
    it('asks the database for the suppliers', async () => {
        renderPage()
        await waitFor(() => expect(asked).toContain('suppliers'))
    })

    // Every name is on screen twice, because the page draws the phone cards
    // and the desktop table into the same document and lets CSS pick. That is
    // the app being right, so the test asks for all of them.
    it('shows what came back', async () => {
        renderPage()

        expect(await screen.findAllByText('Sysco Ireland')).not.toHaveLength(0)
        expect(screen.getAllByText('Sherpack')).not.toHaveLength(0)
    })

    it('leaves the retired ones out until they are asked for', async () => {
        renderPage()

        await screen.findAllByText('Sysco Ireland')
        expect(screen.queryByText('Gone Ltd')).not.toBeInTheDocument()
    })

    it('stops saying it is loading once it has loaded', async () => {
        renderPage()

        await screen.findAllByText('Sysco Ireland')
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    })
})
