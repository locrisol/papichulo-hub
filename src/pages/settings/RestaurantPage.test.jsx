// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockSupabase, renderWithRouter } from '@/test/helpers'

// The bug this file was written for.
//
// He set the pay period, went to the Timesheet to use it, and it was not there.
// The page had one Save button at the foot of a form four cards long, so the
// date had been typed and never sent and nothing on the screen said so. A form
// that can hold a change nobody asked it to hold is a form that will lose one.
//
// It writes when a box is left now, and the locked fields go back to locked
// once the write lands, which is the confirmation.

const db = mockSupabase({})
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))

let restaurant = null
const setActiveRestaurant = vi.fn(next => { restaurant = next })

vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'me', role: 'super_admin' } }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: restaurant, setActiveRestaurant }),
}))

const { default: RestaurantPage } = await import('./RestaurantPage')

const EMPTY = {
    id: 'r1',
    name: 'Point Campus',
    hourly_rate: 15,
    mail_from: null,
    google_calendar_id: null,
    pay_period_start: null,
    opening_hours: {},
    break_rules: [],
}

// What the update chain hands back, so the page can put the saved row into
// context the way the real one does.
function answers(row) {
    db.from.mockImplementation(() => {
        const chain = {}
        const steps = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'order', 'gte', 'lte', 'in']
        for (const step of steps) chain[step] = vi.fn(() => chain)
        chain.single = vi.fn(() => Promise.resolve({ data: row(), error: null }))
        chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
        chain.then = (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej)
        return chain
    })
}

beforeEach(() => {
    restaurant = { ...EMPTY }
    setActiveRestaurant.mockClear()
    db.from.mockClear()
})

const periodBox = () => screen.getByLabelText(/day the pay period started on/i)

describe('there is no Save button any more', () => {
    it('says how it saves instead', () => {
        answers(() => ({ ...restaurant }))
        renderWithRouter(<RestaurantPage />)
        expect(screen.getByText('Saves as you leave each box')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /save settings/i })).toBeNull()
    })
})

describe('the pay period', () => {
    // The one he lost. Typed, left, and gone.
    it('writes the date as soon as the box is left', async () => {
        answers(() => ({ ...restaurant, pay_period_start: '2026-10-25' }))
        const me = userEvent.setup()
        renderWithRouter(<RestaurantPage />)

        await me.type(periodBox(), '2026-10-25')
        await me.tab()

        await waitFor(() => expect(setActiveRestaurant).toHaveBeenCalled())
        expect(setActiveRestaurant.mock.calls[0][0].pay_period_start).toBe('2026-10-25')
    })

    // A date typed into a box is whatever day somebody picked. A period that
    // began mid week would put its boundary inside a Hub week.
    it('stores the Sunday of that week, whatever day was picked', async () => {
        answers(() => ({ ...restaurant, pay_period_start: '2026-10-25' }))
        const me = userEvent.setup()
        renderWithRouter(<RestaurantPage />)

        // Wednesday 28 October 2026.
        await me.type(periodBox(), '2026-10-28')
        await me.tab()

        await waitFor(() => expect(setActiveRestaurant).toHaveBeenCalled())
    })

    it('says which period covers today once it is set', () => {
        restaurant = { ...EMPTY, pay_period_start: '2026-10-25' }
        answers(() => ({ ...restaurant }))
        renderWithRouter(<RestaurantPage />)
        expect(screen.getByText(/The period covering today is/)).toBeInTheDocument()
    })

    it('says the Timesheet cannot send until it is set', () => {
        answers(() => ({ ...restaurant }))
        renderWithRouter(<RestaurantPage />)
        expect(screen.getByText(/cannot send\s+anything until this is set/)).toBeInTheDocument()
    })

    // Changing it does not move one figure, it moves every period boundary
    // there has ever been.
    it('is locked once it has one', () => {
        restaurant = { ...EMPTY, pay_period_start: '2026-10-25' }
        answers(() => ({ ...restaurant }))
        renderWithRouter(<RestaurantPage />)

        expect(screen.getByRole('textbox', { name: 'Pay period start, locked' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Edit pay period start' })).toBeInTheDocument()
    })

    it('is open while there is nothing in it', () => {
        answers(() => ({ ...restaurant }))
        renderWithRouter(<RestaurantPage />)
        expect(periodBox()).toBeEnabled()
    })
})

describe('the hourly rate', () => {
    it('writes it when the box is left', async () => {
        answers(() => ({ ...restaurant, hourly_rate: 16.5 }))
        const me = userEvent.setup()
        renderWithRouter(<RestaurantPage />)

        const box = screen.getByLabelText(/hourly rate/i)
        await me.clear(box)
        await me.type(box, '16.50')
        await me.tab()

        await waitFor(() => expect(setActiveRestaurant).toHaveBeenCalled())
    })

    // A half typed rate is not a rate, and an empty box is somebody still
    // thinking rather than a rate of nothing.
    it('writes nothing while the box is empty', async () => {
        answers(() => ({ ...restaurant }))
        const me = userEvent.setup()
        renderWithRouter(<RestaurantPage />)

        const box = screen.getByLabelText(/hourly rate/i)
        await me.clear(box)
        await me.tab()

        expect(setActiveRestaurant).not.toHaveBeenCalled()
    })

    it('writes nothing when the figure has not changed', async () => {
        answers(() => ({ ...restaurant }))
        const me = userEvent.setup()
        renderWithRouter(<RestaurantPage />)

        await me.click(screen.getByLabelText(/hourly rate/i))
        await me.tab()

        expect(setActiveRestaurant).not.toHaveBeenCalled()
    })
})
