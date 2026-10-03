// @vitest-environment jsdom
import { StrictMode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockSupabase, renderWithRouter, tableOf } from '@/test/helpers'
import { todayISO, addDays, addMonths, monthStart, monthLabel, shortDate, weekStartOf } from '@/lib/dates'

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
// A store manager unless a test says otherwise.
let user
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user }) }))

const { default: CalendarPage } = await import('./CalendarPage')

const eventReads = () => db.from.mock.calls.filter(([t]) => t === 'events').length

beforeEach(() => {
    localStorage.clear()
    user = MANAGER
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
        expect(await screen.findByText('Found 1 new event nearby.')).toBeInTheDocument()
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

// Where the calendar gets the restaurant names that say which site an entry is
// for. Staff cannot read the restaurants table, only staff_restaurants, so a
// page that asks the table for them gets nothing back and every entry reads
// No restaurant. Invented entries.

const POINT = { ...RESTAURANT, sort_order: 0 }

const CATERING = {
    id: 'd1', title: 'Catering for the college', kind: 'catering', status: 'confirmed',
    scope: 'sites', restaurant_ids: ['r1'],
    starts_on: addDays(todayISO(), 3), ends_on: null, starts_at: null, ends_at: null,
}

// What the database gives each of them: the table only to a manager, the view
// to anybody signed in at the restaurant.
async function openAs(who) {
    user = { id: 'u1', role: who, restaurant_id: 'r1' }
    db = mockSupabase({
        diary_entries: { data: [CATERING], error: null },
        staff_diary: { data: [CATERING], error: null },
        restaurants: { data: who === 'employee' ? [] : [{ ...POINT, google_calendar_id: 'cal@example.test' }], error: null },
        staff_restaurants: { data: [POINT], error: null },
    })
    // The Ticketmaster check stays out, which has nothing to do with this.
    db.functions = { invoke: vi.fn(() => new Promise(() => {})) }
    renderWithRouter(<CalendarPage />)
    await screen.findByText('Catering for the college')
}

describe('the restaurant names on the calendar', () => {
    it('come from the staff view for an employee', async () => {
        await openAs('employee')
        expect(screen.queryByText('No restaurant')).toBeNull()
        expect(db.calls).toContain('staff_restaurants')
        expect(db.calls).not.toContain('restaurants')
    })

    // A manager adding an entry is told which restaurant has no Google
    // calendar yet, which needs the calendar id the view leaves out.
    it('come from the table for a manager, with the calendar id', async () => {
        await openAs('store_manager')
        expect(screen.queryByText('No restaurant')).toBeNull()
        expect(db.calls).toContain('restaurants')
        expect(db.calls).not.toContain('staff_restaurants')
    })
})

// The diary itself. Staff read staff_diary, which leaves out where each entry
// is on Google and who wrote it: neither is on any staff screen, and the
// Google ids are what the calendar function acts on. A manager reads the
// table, because Edit needs to know who wrote a private entry.
describe('the diary on the calendar', () => {
    it('comes from the staff view for an employee', async () => {
        await openAs('employee')
        expect(db.calls).toContain('staff_diary')
        expect(db.calls).not.toContain('diary_entries')
    })

    it('comes from the table for a manager', async () => {
        await openAs('store_manager')
        expect(db.calls).toContain('diary_entries')
        expect(db.calls).not.toContain('staff_diary')
    })
})

// What is on near us, for staff. The place comes through staff_places, which
// leaves out the page address, the Ticketmaster id, the reading settings and
// what went wrong last time: all of that is for Settings and the feed notice,
// which only a manager sees. And the readings still waiting on a manager are
// not asked for at all, since only a manager decides them.
describe('what is on near us, for an employee', () => {
    it('takes the place from the staff view and skips the waiting list', async () => {
        await openAs('employee')
        const pairings = db.from.mock.results
            .filter((_, i) => db.from.mock.calls[i][0] === 'restaurant_places')
            .map(r => r.value.select.mock.calls[0][0])
        expect(pairings.length).toBeGreaterThan(0)
        for (const columns of pairings) expect(columns).toContain('place:staff_places(')
        expect(db.calls).not.toContain('places')
        expect(db.calls.filter(t => t === 'events')).toHaveLength(1)
    })

    it('still gives a manager the whole place and the waiting list', async () => {
        await openAs('store_manager')
        const pairings = db.from.mock.results
            .filter((_, i) => db.from.mock.calls[i][0] === 'restaurant_places')
            .map(r => r.value.select.mock.calls[0][0])
        for (const columns of pairings) expect(columns).toContain('place:places(*)')
        expect(db.calls.filter(t => t === 'events')).toHaveLength(2)
    })
})

// Stepping through months and weeks uses the same stepper as the other
// screens, so its arrows say which way they go and the middle says where you
// are.
describe('stepping through the calendar', () => {
    it('names the arrows by the month, and the middle follows them', async () => {
        renderWithRouter(<CalendarPage />)
        await screen.findByText(/Kings of Leon/)
        await userEvent.click(screen.getByRole('button', { name: 'Month' }))

        const now = monthLabel(monthStart(todayISO()))
        const next = monthLabel(addMonths(monthStart(todayISO()), 1))
        expect(screen.getAllByText(now).length).toBeGreaterThan(0)

        await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
        expect(screen.getAllByText(next).length).toBeGreaterThan(0)
        expect(screen.getByRole('button', { name: 'Go to current month' })).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
        expect(screen.getAllByText(now).length).toBeGreaterThan(0)
    })

    it('names them by the week in the week view, with the week in the middle', async () => {
        renderWithRouter(<CalendarPage />)
        await screen.findByText(/Kings of Leon/)
        await userEvent.click(screen.getByRole('button', { name: 'Week' }))

        const start = weekStartOf(todayISO())
        expect(screen.getByText(`${shortDate(start)} to ${shortDate(addDays(start, 6))}`)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Previous week' })).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Next week' }))
        const after = addDays(start, 7)
        expect(screen.getByText(`${shortDate(after)} to ${shortDate(addDays(after, 6))}`)).toBeInTheDocument()
    })
})
