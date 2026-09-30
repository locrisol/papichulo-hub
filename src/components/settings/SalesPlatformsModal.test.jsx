// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockSupabase } from '@/test/helpers'

// Adding a delivery platform.
//
// Its figures are kept under a key that never changes, so a platform can be
// renamed without losing them. A new one's key is the name it is given. A
// platform renamed since still keeps its figures under the name it had, so
// that name cannot go to a new one.

const tables = {
    sales_platforms: {
        data: [
            { id: 'p1', key: 'Deliveroo', name: 'Deliveroo', bucket: 'online_platform', sort_order: 0, is_active: true },
            // Renamed from Just Eat in settings.
            { id: 'p2', key: 'Just Eat', name: 'JustEat', bucket: 'online_platform', sort_order: 1, is_active: true },
        ],
        error: null,
    },
}
const db = mockSupabase(tables)
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Testville' } }),
}))
vi.mock('@/context/confirm', () => ({ useConfirm: () => () => Promise.resolve(true) }))

const { default: SalesPlatformsModal } = await import('./SalesPlatformsModal')

function inserted() {
    return db.from.mock.results.flatMap(({ value: q }) => q.insert.mock.calls.map(c => c[0]))
}

async function add(name) {
    render(<SalesPlatformsModal onClose={() => {}} />)
    await screen.findAllByText('JustEat')
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Platform name'), name)
    await user.click(screen.getByRole('button', { name: 'Add' }))
}

beforeEach(() => {
    db.from.mockClear()
})

describe('adding a platform', () => {
    // The database gives it its name as its key. Sending a key as well would
    // fail on a database migration 026 has not reached, where there is no key
    // column to send it to.
    it('leaves the key to the database', async () => {
        await add('Uber Eats')
        await waitFor(() => expect(inserted()).toHaveLength(1))
        expect(inserted()[0]).toMatchObject({ restaurant_id: 'r1', name: 'Uber Eats' })
        expect(inserted()[0]).not.toHaveProperty('key')
    })

    it('will not take the name a renamed platform still keeps its figures under', async () => {
        await add('Just Eat')
        expect(await screen.findByRole('alert')).toHaveTextContent('JustEat was called Just Eat before')
        expect(inserted()).toEqual([])
    })
})
