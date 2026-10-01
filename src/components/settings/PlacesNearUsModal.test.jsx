// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeQuery } from '@/test/helpers'

// Places near us, in Settings.
//
// Taking a place off the list deletes the place as well when nobody else
// watches it and nothing has been read from it. Listings cascade from a place,
// so the two checks before that delete are all that stands between a slip and
// every listing ever read from the Arena.

const ARENA = { id: 'p1', name: '3Arena', ticketmaster_venue_id: 'KovZ9177WYV' }
const ROWS = [
    { id: 'rp1', relation: 'walk', walk_minutes: 2, is_active: true, own_row: true, sort_order: 0, place: ARENA },
]

let answers
let queue
let made
let db
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
const RESTAURANT = { id: 'r1', name: 'Point Campus' }
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: RESTAURANT, setActiveRestaurant: () => {} }),
}))
const confirm = vi.fn(() => Promise.resolve(true))
vi.mock('@/context/confirm', () => ({ useConfirm: () => options => confirm(options) }))

const { default: PlacesNearUsModal } = await import('./PlacesNearUsModal')

// What a table answers: the next one queued for it, or its usual answer.
function answerFor(table) {
    if (queue[table]?.length) return queue[table].shift()
    return answers[table] || { data: [], error: null }
}

const placeDeleted = () => made.some(m => m.table === 'places' && m.q.delete.mock.calls.length > 0)

const FAILED = { data: null, error: { message: 'Failed to fetch' }, count: null }

beforeEach(() => {
    confirm.mockClear()
    made = []
    queue = {}
    answers = {
        // The list, and afterwards the count of who else watches it.
        restaurant_places: { data: ROWS, error: null, count: 0 },
        events: { data: null, error: null, count: 0 },
        places: { data: [], error: null },
    }
    db = {
        from: vi.fn(table => {
            const q = makeQuery(answerFor(table))
            made.push({ table, q })
            return q
        }),
        functions: { invoke: vi.fn(() => Promise.resolve({ data: {}, error: null })) },
    }
})

async function takeOff() {
    render(<PlacesNearUsModal onClose={() => {}} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /3Arena/ }))
    await user.click(screen.getByRole('button', { name: 'Take it off the list' }))
}

describe('taking a place off the list', () => {
    it('deletes the place when nobody watches it and nothing was read from it', async () => {
        await takeOff()
        await waitFor(() => expect(placeDeleted()).toBe(true))
    })

    // The count of listings failed, a dropped signal on a phone. A count that
    // failed came back as nothing, nothing read as none, and the place went
    // with every listing ever read from it.
    it('keeps the place when the count of its listings could not be read', async () => {
        answers.events = FAILED
        await takeOff()

        // Back on the list, which is the take off finishing.
        expect(await screen.findByText('Places near us')).toBeInTheDocument()
        expect(placeDeleted()).toBe(false)
    })

    it('keeps the place when the count of who else watches it could not be read', async () => {
        // The list, the take off itself, then the count, which fails.
        queue.restaurant_places = [answers.restaurant_places, { data: null, error: null }, FAILED]
        await takeOff()

        expect(await screen.findByText('Places near us')).toBeInTheDocument()
        expect(placeDeleted()).toBe(false)
    })
})
