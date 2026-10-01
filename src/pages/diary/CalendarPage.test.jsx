// @vitest-environment jsdom
import { StrictMode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithRouter, tableOf } from '@/test/helpers'
import { todayISO, addDays } from '@/lib/dates'

// The calendar asks Ticketmaster for news at most twice a day. It used to wait
// for that answer before drawing anything, so once every twelve hours a manager
// looked at "Loading the calendar..." for as long as Ticketmaster took, and for
// the whole of the function's time limit if it hung.

// Two diary entries for the Edit tests further down: the owner's promotion for
// the whole group, and a catering job for this restaurant only.
const GROUP = {
    id: 'd1', kind: 'promotion', title: 'Two for one week', scope: 'all_sites', restaurant_ids: [],
    starts_on: todayISO(), ends_on: null, created_by: 'owner1', status: 'confirmed',
}
const OURS = {
    id: 'd2', kind: 'catering', title: 'Lunch for twelve', scope: 'sites', restaurant_ids: ['r1'],
    starts_on: todayISO(), ends_on: null, created_by: 'owner1', status: 'confirmed',
}

const ARENA = { id: 'p1', name: '3Arena', ticketmaster_venue_id: 'KovZ9177WYV' }
const SOON = addDays(todayISO(), 3)

const tables = {
    diary_entries: [GROUP, OURS],
    restaurants: [{ id: 'r1', name: 'Point Campus' }],
    restaurant_places: [
        { id: 'rp1', restaurant_id: 'r1', relation: 'walk', walk_minutes: 2, is_active: true, own_row: true, place: ARENA },
    ],
    events: [
        { id: 'e1', place_id: 'p1', name: 'Kings of Leon', event_date: SOON, event_time: '18:30:00', source: 'ticketmaster', review: 'trusted', status: 'onsale' },
    ],
}

let db
let answer
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
const RESTAURANT = { id: 'r1', name: 'Point Campus' }
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: RESTAURANT }),
}))
const MANAGER = { id: 'u1', role: 'store_manager', restaurant_id: 'r1' }
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: MANAGER }) }))

const { default: CalendarPage } = await import('./CalendarPage')

const eventReads = () => db.from.mock.calls.filter(([t]) => t === 'events').length

beforeEach(() => {
    localStorage.clear()
    // Ticketmaster has not answered yet, and will not until a test says so.
    answer = null
    db = {
        from: vi.fn(table => tableOf(tables[table] || [])),
        functions: {
            invoke: vi.fn(() => new Promise(resolve => { answer = resolve })),
        },
    }
})

describe('the calendar and the Ticketmaster check', () => {
    it('draws while Ticketmaster is still being asked', async () => {
        renderWithRouter(<CalendarPage />)

        expect(await screen.findByText(/Kings of Leon/)).toBeInTheDocument()
        expect(screen.getByText('Checking Ticketmaster...')).toBeInTheDocument()
        expect(screen.queryByText('Loading the calendar...')).toBeNull()
    })

    // The sync can add nights and take readings off the waiting list, so what
    // is on screen is read again, without blanking it while that happens.
    it('reads the listings again once the check is done, and keeps them on screen', async () => {
        renderWithRouter(<CalendarPage />)
        await screen.findByText(/Kings of Leon/)
        const before = eventReads()

        answer({ data: { added: 1, total: 9, places: 1, failures: [] }, error: null })

        await waitFor(() => expect(eventReads()).toBeGreaterThan(before))
        expect(await screen.findByText('Found 1 new thing happening nearby.')).toBeInTheDocument()
        expect(screen.queryByText('Loading the calendar...')).toBeNull()
        expect(screen.getByText(/Kings of Leon/)).toBeInTheDocument()
    })

    // Changing the view reloads the calendar. It must not ask Ticketmaster a
    // second time while the first is still out.
    it('asks once, whatever the view does meanwhile', async () => {
        renderWithRouter(<CalendarPage />)
        await screen.findByText(/Kings of Leon/)

        await userEvent.click(screen.getByRole('button', { name: 'Month' }))
        await userEvent.click(screen.getByRole('button', { name: 'List' }))

        expect(db.functions.invoke).toHaveBeenCalledTimes(1)
    })

    // The app runs in StrictMode, which runs every effect twice in development.
    // The second run waits on the first one's answer, and still finishes the
    // job: the notice goes and the listings are read again.
    it('asks once in StrictMode, and still finishes', async () => {
        renderWithRouter(<StrictMode><CalendarPage /></StrictMode>)
        await screen.findByText(/Kings of Leon/)
        expect(db.functions.invoke).toHaveBeenCalledTimes(1)

        answer({ data: { added: 0, total: 9, places: 1, failures: [] }, error: null })
        await waitFor(() => expect(screen.queryByText('Checking Ticketmaster...')).toBeNull())
        expect(db.functions.invoke).toHaveBeenCalledTimes(1)
    })
})

// Edit on an entry opened from the calendar.
//
// Every manager can open any entry here to read it, but Edit is only for the
// ones diary_entries_write lets them change. A store manager was offered Edit
// on the owner's group promotion, and Save was then refused. The rule itself is
// tested in diary.test.js; this is the page using it.

async function open(title) {
    renderWithRouter(<CalendarPage />)
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
