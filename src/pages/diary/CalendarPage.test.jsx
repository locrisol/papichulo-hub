// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { mockSupabase } from '@/test/helpers'
import { todayISO } from '@/lib/dates'

// Edit on an entry opened from the calendar.
//
// Every manager can open any entry here to read it, but Edit is only for the
// ones diary_entries_write lets them change. A store manager was offered Edit
// on the owner's group promotion, and Save was then refused. The rule itself is
// tested in diary.test.js; this is the page using it.

const TODAY = todayISO()
const GROUP = {
    id: 'd1', kind: 'promotion', title: 'Two for one week', scope: 'all_sites', restaurant_ids: [],
    starts_on: TODAY, ends_on: null, created_by: 'owner1', status: 'confirmed',
}
const OURS = {
    id: 'd2', kind: 'catering', title: 'Lunch for twelve', scope: 'sites', restaurant_ids: ['r1'],
    starts_on: TODAY, ends_on: null, created_by: 'owner1', status: 'confirmed',
}

const db = mockSupabase({
    diary_entries: { data: [GROUP, OURS], error: null },
    restaurants: { data: [{ id: 'r1', name: 'Point Campus' }], error: null },
})
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'store_manager', restaurant_id: 'r1' } }) }))
// The same object every render, the way the provider hands it over, or the
// page reads everything again on each one.
const point = { id: 'r1', name: 'Point Campus' }
vi.mock('@/context/restaurant', () => ({ useRestaurant: () => ({ activeRestaurant: point }) }))
// Not the Ticketmaster check, which has nothing to do with this.
vi.mock('@/lib/nearbySync', async importOriginal => ({ ...(await importOriginal()), syncIsDue: () => false }))

const { default: CalendarPage } = await import('./CalendarPage')

async function open(title) {
    render(<CalendarPage />)
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(title) }))
    return screen.findByRole('dialog', { name: title })
}

describe('an entry opened by a store manager', () => {
    it('has no Edit when it is the whole group\'s', async () => {
        const entry = await open('Two for one week')
        expect(within(entry).queryByRole('button', { name: 'Edit' })).toBeNull()
    })

    it('has Edit when it is only for their own restaurant', async () => {
        const entry = await open('Lunch for twelve')
        expect(within(entry).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    })
})
