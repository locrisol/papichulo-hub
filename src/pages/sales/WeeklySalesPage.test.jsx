// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockSupabase, renderWithRouter } from '@/test/helpers'

// Where Tab goes on the week grid.
//
// It has been changed twice, so it is written down here rather than left to
// whoever touches the handler next. The till's rows and Corporate go DOWN the
// block and on to the next day. The online platforms go ACROSS, Sunday to
// Saturday, and after Saturday on to the next platform's Sunday. His word, 27
// September: "only online platforms should tabulate to the right and then
// jump to the next row when reaching the end".

const db = mockSupabase({
    sales_platforms: {
        data: [
            { id: 'p1', name: 'Deliveroo', bucket: 'online_platform', sort_order: 1, is_active: true },
            { id: 'p2', name: 'Just Eat', bucket: 'online_platform', sort_order: 2, is_active: true },
            { id: 'p3', name: 'Uber Eats', bucket: 'online_platform', sort_order: 3, is_active: true },
            { id: 'p4', name: 'Clockmeal', bucket: 'catering', sort_order: 4, is_active: true },
            { id: 'p5', name: 'Feedr', bucket: 'catering', sort_order: 5, is_active: true },
        ],
        error: null,
    },
    sales_tenders: {
        data: [
            { key: 'cash', label: 'Cash Sales', sort_order: 1, is_active: true, counts_toward_gross: true },
            { key: 'card', label: 'Card', sort_order: 2, is_active: true, counts_toward_gross: true },
        ],
        error: null,
    },
})
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Testville' } }),
}))

const { default: WeeklySalesPage } = await import('./WeeklySalesPage')

// A block's boxes in the order they are in the page: row by row, Sunday to
// Saturday along each.
const boxes = block => Array.from(document.querySelectorAll(`input[data-block="${block}"]`))

async function openGrid() {
    renderWithRouter(<WeeklySalesPage />)
    await waitFor(() => expect(boxes('online_platform')).toHaveLength(21))
    return userEvent.setup()
}

describe('the online platforms', () => {
    it('go along the row, one day to the next', async () => {
        const user = await openGrid()
        const online = boxes('online_platform')
        online[0].focus()
        await user.keyboard('{Tab}')
        expect(online[1]).toHaveFocus()
    })

    it('go from Saturday to the next platform\'s Sunday', async () => {
        const user = await openGrid()
        const online = boxes('online_platform')
        online[6].focus()
        await user.keyboard('{Tab}')
        expect(online[7]).toHaveFocus()
    })

    it('go back the same way with Shift+Tab', async () => {
        const user = await openGrid()
        const online = boxes('online_platform')
        online[7].focus()
        await user.keyboard('{Shift>}{Tab}{/Shift}')
        expect(online[6]).toHaveFocus()
    })
})

describe('everything else', () => {
    it('goes down the till receipt, Gross to Net', async () => {
        const user = await openGrid()
        const gross = screen.getByText('Gross sales').closest('tr').querySelector('input')
        const net = screen.getByText('Net sales').closest('tr').querySelector('input')
        gross.focus()
        await user.keyboard('{Tab}')
        expect(net).toHaveFocus()
    })

    it('goes down Corporate and on to the next day at the bottom', async () => {
        const user = await openGrid()
        const corporate = boxes('catering')
        corporate[0].focus()
        await user.keyboard('{Tab}')
        expect(corporate[7]).toHaveFocus()
        await user.keyboard('{Tab}')
        expect(corporate[1]).toHaveFocus()
    })
})
