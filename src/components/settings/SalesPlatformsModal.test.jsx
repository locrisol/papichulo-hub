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
// One object, as the real context gives. A new one on every render would load
// the list again each time and take the edit boxes away mid word.
const RESTAURANT = { id: 'r1', name: 'Testville' }
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: RESTAURANT }),
}))
// What the "are you sure" dialog answers.
const confirm = vi.fn(() => Promise.resolve(true))
vi.mock('@/context/confirm', () => ({ useConfirm: () => options => confirm(options) }))

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

function updated() {
    return db.from.mock.results.flatMap(({ value: q }) => q.update.mock.calls.map(c => c[0]))
}

beforeEach(() => {
    db.from.mockClear()
    confirm.mockImplementation(() => Promise.resolve(true))
})

// Changing a platform's group takes every week already entered with it: its
// figures count under the other total from then on, not only new weeks. That
// can be what is wanted, but not by a slip of the select.
describe('editing a platform', () => {
    async function edit({ name, group }) {
        render(<SalesPlatformsModal onClose={() => {}} />)
        await screen.findAllByText('Deliveroo')
        const user = userEvent.setup()
        await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
        if (name) {
            await user.clear(screen.getByLabelText('Platform name'))
            await user.type(screen.getByLabelText('Platform name'), name)
        }
        if (group) await user.selectOptions(screen.getByLabelText('Which group'), group)
        await user.click(screen.getAllByRole('button', { name: 'Save' })[0])
    }

    it('asks before moving one to the other group, and moves nothing unless told to', async () => {
        confirm.mockImplementation(() => Promise.resolve(false))
        await edit({ group: 'catering' })
        await waitFor(() => expect(confirm).toHaveBeenCalled())
        expect(confirm.mock.calls[0][0].title).toBe('Move Deliveroo to Corporate?')
        expect(updated()).toEqual([])
    })

    it('moves it once told to', async () => {
        await edit({ group: 'catering' })
        await waitFor(() => expect(updated()).toEqual([{ name: 'Deliveroo', bucket: 'catering' }]))
    })

    it('does not ask about a new name alone', async () => {
        await edit({ name: 'Deliveroo IE' })
        await waitFor(() => expect(updated()).toEqual([{ name: 'Deliveroo IE', bucket: 'online_platform' }]))
        expect(confirm).not.toHaveBeenCalled()
    })
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
