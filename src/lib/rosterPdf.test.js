// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { weekPdf } from '@/lib/rosterPdf'
import { weekTable } from '@/lib/rosterShare'

// Proof that it builds at all.
//
// The picture shipped broken once, from a helper called before it existed, and
// this file has the same shape of risk: a long function that draws in order
// and would throw on the first thing out of place. Nothing here checks what the
// page looks like, which a test cannot do honestly. It checks that a week with
// everything in it goes all the way through and comes out as a PDF.
//
// jsPDF runs in jsdom, so this is the real library and the real drawing, not a
// stand in. Saving is the only part stubbed out, since a test has no business
// putting a file anywhere.

const DATES = [
    '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23',
    '2026-09-24', '2026-09-25', '2026-09-26',
]

const full = weekTable({
    dates: DATES,
    employees: [
        { id: 'e1', full_name: 'Majo', hourly_rate: 12 },
        { id: 'e2', full_name: 'Georgiana', hourly_rate: 12 },
    ],
    shifts: [
        // A split day, which is the one that printed No break twice.
        { id: 'a', employee_id: 'e1', shift_date: DATES[5], starts_at: '09:00', ends_at: '13:00', break_minutes: 0 },
        { id: 'b', employee_id: 'e1', shift_date: DATES[5], starts_at: '17:30', ends_at: '21:00', break_minutes: 0 },
        { id: 'c', employee_id: 'e2', shift_date: DATES[2], starts_at: '09:30', ends_at: '15:00', break_minutes: 15 },
    ],
    dayNotes: [
        { note_date: DATES[2], extras: [{ name: 'Feedr', time: '12:10' }], note: 'Deep Cleaning Day' },
        { note_date: DATES[3], message: 'Stock take after close.' },
    ],
    events: [{ id: 'v1', name: 'Westlife 25, The Anniversary World Tour', event_date: DATES[0], event_time: '18:00' }],
    diary: [
        {
            id: 'p1', kind: 'promotion', scope: 'all_sites', status: 'confirmed',
            title: '20% Discount Mega Mucho Box', labels: ['Students'],
            starts_on: DATES[2], ends_on: DATES[6], starts_at: null,
        },
        {
            id: 'p2', kind: 'promotion', scope: 'all_sites', status: 'confirmed',
            title: '50% Discount Hungry Man', labels: ['Students'],
            starts_on: '2026-09-14', ends_on: DATES[1], starts_at: null,
        },
        {
            id: 'c1', kind: 'catering', scope: 'all_sites', status: 'confirmed',
            title: 'MUFG Investor Services', labels: [],
            starts_on: DATES[2], ends_on: null, starts_at: '13:00',
        },
    ],
    openingHours: {
        0: { open: '10:00', close: '21:00' },
        2: { open: '09:00', close: '21:00' },
        5: { open: '09:00', close: '21:00' },
    },
    restaurantName: 'Point Campus',
    standingNote: 'Closing shifts do not have a set end time.',
    today: DATES[0],
})

describe('building the PDF', () => {
    it('gets a whole week all the way through', async () => {
        const doc = await weekPdf(full, 'Point Campus', DATES[0], { save: false })
        expect(doc).toBeTruthy()
    })

    // A band that began before this week and one that runs past the end of it
    // are the two the arrows exist for, and both are in the week above.
    it('copes with a band clamped at either edge of the week', async () => {
        await expect(weekPdf(full, 'Point Campus', DATES[0], { save: false })).resolves.toBeTruthy()
    })

    it('builds a week with nothing in it at all', async () => {
        const bare = weekTable({
            dates: DATES, employees: [], shifts: [], openingHours: {}, today: DATES[0],
        })
        await expect(weekPdf(bare, 'Point Campus', DATES[0], { save: false })).resolves.toBeTruthy()
    })
})
