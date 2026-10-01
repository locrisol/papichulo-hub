// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { mockSupabase, makeQuery } from '@/test/helpers'

const db = mockSupabase({
    restaurants: { data: [{ id: 'r1', name: 'Point Campus', is_active: true }], error: null },
})
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))

let signedIn = null
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: signedIn }) }))

const { RestaurantProvider } = await import('./RestaurantContext')
const { useRestaurant, NO_RESTAURANT } = await import('./restaurant')

function Shows() {
    const { activeRestaurant, error } = useRestaurant()
    return <p>{error ? `error: ${error}` : activeRestaurant?.name || 'loading'}</p>
}

const tree = () => <RestaurantProvider><Shows /></RestaurantProvider>
const reads = () => db.from.mock.calls.filter(([table]) => table === 'restaurants').length

beforeEach(() => {
    db.from.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

// The account's row is read again every time the tab comes back into view, and
// each read is a new object even when nothing on it changed. Reading the
// restaurant again each time was one more thing that could fail and stop
// somebody in the middle of their work.
describe('reading the account again', () => {
    it('does not read the restaurant again when nothing it depends on changed', async () => {
        signedIn = { id: 'u1', role: 'store_manager', restaurant_id: 'r1', full_name: 'Aoife' }
        const { rerender } = render(tree())
        await screen.findByText('Point Campus')

        signedIn = { ...signedIn }
        rerender(tree())
        await screen.findByText('Point Campus')
        expect(reads()).toBe(1)
    })

    it('does read it again when their restaurant changed', async () => {
        signedIn = { id: 'u1', role: 'store_manager', restaurant_id: 'r1' }
        const { rerender } = render(tree())
        await screen.findByText('Point Campus')

        signedIn = { ...signedIn, restaurant_id: 'r2' }
        rerender(tree())
        await vi.waitFor(() => expect(reads()).toBe(2))
    })
})

// Read once, a first read that failed on a weak signal used to stay failed:
// coming back to the tab read the account again, found nothing changed and
// read nothing, so the screen said the Hub could not open until a reload.
describe('a first read that failed', () => {
    it('is tried again when the connection comes back, and the Hub opens', async () => {
        signedIn = { id: 'u1', role: 'store_manager', restaurant_id: 'r1' }
        db.from.mockImplementationOnce(() => makeQuery({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } }))
        render(tree())
        expect(await screen.findByText('error: TypeError: Failed to fetch')).toBeInTheDocument()

        act(() => { window.dispatchEvent(new Event('online')) })
        expect(await screen.findByText('Point Campus')).toBeInTheDocument()
        expect(reads()).toBe(2)
    })

    it('is not tried again once it worked', async () => {
        signedIn = { id: 'u1', role: 'store_manager', restaurant_id: 'r1' }
        render(tree())
        await screen.findByText('Point Campus')

        act(() => { window.dispatchEvent(new Event('online')) })
        await act(async () => {})
        expect(reads()).toBe(1)
    })
})

// The list in the switcher is read once now, not every time the tab comes back.
// A settings window hands its saved row to setActiveRestaurant, and the list
// kept the row from before, so switching away and back undid the change on
// screen until a reload.
describe('a restaurant saved from a settings window', () => {
    it('is the one opened again after switching away and back', async () => {
        localStorage.clear()
        signedIn = { id: 'u0', role: 'super_admin', restaurant_id: null }
        db.from.mockImplementationOnce(() => makeQuery({
            data: [
                { id: 'r2', name: 'Dun Laoghaire', is_active: true },
                { id: 'r1', name: 'Point Campus', is_active: true },
            ],
            error: null,
        }))
        let ctx
        function Grab() { ctx = useRestaurant(); return null }
        render(<RestaurantProvider><Shows /><Grab /></RestaurantProvider>)
        await screen.findByText('Dun Laoghaire')

        act(() => ctx.setActiveRestaurant({ id: 'r2', name: 'Dun Laoghaire Pier', is_active: true }))
        act(() => ctx.switchRestaurant(ctx.restaurants.find(r => r.id === 'r1')))
        await screen.findByText('Point Campus')
        act(() => ctx.switchRestaurant(ctx.restaurants.find(r => r.id === 'r2')))
        expect(await screen.findByText('Dun Laoghaire Pier')).toBeInTheDocument()
    })
})

// Every new account starts as an employee with no restaurant, until somebody
// sets one. Asking the database for the restaurant called null came back as
// a raw error about uuids.
describe('an account with no restaurant yet', () => {
    it('says so without asking the database', async () => {
        signedIn = { id: 'u9', role: 'employee', restaurant_id: null }
        render(tree())
        expect(await screen.findByText(`error: ${NO_RESTAURANT}`)).toBeInTheDocument()
        expect(reads()).toBe(0)
    })

    it('still reads every restaurant for a super admin, who has none of their own', async () => {
        signedIn = { id: 'u0', role: 'super_admin', restaurant_id: null }
        render(tree())
        expect(await screen.findByText('Point Campus')).toBeInTheDocument()
    })
})
