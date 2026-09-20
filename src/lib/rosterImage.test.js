// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { drawWeek } from '@/lib/rosterImage'
import { weekTable } from '@/lib/rosterShare'

// Proof that it draws at all.
//
// It shipped broken once: a helper was called while the sheet was still being
// measured, before that helper existed, so the whole thing threw before a
// single pixel was drawn and the button said only "Could not make the
// picture." Nothing here checks what it looks like, which a test cannot do
// honestly. It checks that it runs, and that everything the week can hold has
// been through it at least once.
//
// jsdom has no canvas, so the context is a stand in that records nothing and
// measures every string as if each letter were seven across. That is enough to
// exercise the wrapping and the layout, which is where the arithmetic is.

function fakeCanvas() {
    const calls = { fillText: [], fillRect: 0 }

    // Only the three that say anything are real. Everything else a canvas can
    // be asked to do is answered with a no op, through a proxy rather than a
    // list, so the next rounded corner or gradient added to the drawing does
    // not break this test instead of the thing it is testing.
    const real = {
        fillRect: () => { calls.fillRect += 1 },
        fillText: (text) => { calls.fillText.push(String(text)) },
        measureText: t => ({ width: String(t).length * 7 }),
    }
    const c = new Proxy(real, {
        get: (target, key) => (key in target ? target[key] : () => {}),
        set: () => true,
    })

    return { canvas: { width: 0, height: 0, getContext: () => c }, calls }
}

const DATES = [
    '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23',
    '2026-09-24', '2026-09-25', '2026-09-26',
]

const table = weekTable({
    dates: DATES,
    employees: [{ id: 'e1', full_name: 'Majo', hourly_rate: 12 }],
    shifts: [
        { id: 'a', employee_id: 'e1', shift_date: DATES[5], starts_at: '09:00', ends_at: '13:00', break_minutes: 0 },
        { id: 'b', employee_id: 'e1', shift_date: DATES[5], starts_at: '17:30', ends_at: '21:00', break_minutes: 0 },
    ],
    dayNotes: [{ note_date: DATES[2], extras: [{ name: 'Feedr', time: '12:10' }] }],
    events: [{ id: 'v1', name: 'Westlife 25, The Anniversary World Tour', event_date: DATES[0], event_time: '18:00' }],
    diary: [
        {
            id: 'p1', kind: 'promotion', scope: 'all_sites', status: 'confirmed',
            title: '20% Discount Mega Mucho Box', labels: ['Students'],
            starts_on: DATES[2], ends_on: DATES[6], starts_at: null,
        },
        {
            id: 'c1', kind: 'catering', scope: 'all_sites', status: 'confirmed',
            title: 'MUFG Investor Services', labels: [],
            starts_on: DATES[2], ends_on: null, starts_at: '13:00',
        },
    ],
    openingHours: { 0: { open: '10:00', close: '21:00' }, 2: { open: '09:00', close: '21:00' }, 5: { open: '09:00', close: '21:00' } },
    restaurantName: 'Point Campus',
    standingNote: 'Closing shifts do not have a set end time.',
    today: DATES[0],
})

describe('drawing a week', () => {
    it('draws one without throwing', () => {
        const { canvas } = fakeCanvas()
        expect(() => drawWeek(canvas, table)).not.toThrow()
        expect(canvas.width).toBeGreaterThan(0)
        expect(canvas.height).toBeGreaterThan(0)
    })

    it('names every row, so no band is a strip of colour nobody labelled', () => {
        const { canvas, calls } = fakeCanvas()
        drawWeek(canvas, table)
        for (const label of ['STORE HOURS', 'ONGOING', 'ALSO ON']) {
            expect(calls.fillText, label).toContain(label)
        }
    })

    it('writes the band out rather than cutting it short', () => {
        const { canvas, calls } = fakeCanvas()
        drawWeek(canvas, table)
        const written = calls.fillText.join(' ')
        expect(written).toContain('20% Discount Mega Mucho Box')
        expect(written).toContain('[Students]')
    })

    // The fault he found on a real sheet, and the reason the day carries its
    // breaks rather than each shift carrying its own.
    it('says No break once for a split day that earns none', () => {
        const { canvas, calls } = fakeCanvas()
        drawWeek(canvas, table)
        expect(calls.fillText.filter(t => t === 'No break')).toHaveLength(1)
    })

    it('draws a week with nothing in it at all', () => {
        const bare = weekTable({
            dates: DATES, employees: [], shifts: [], openingHours: {}, today: DATES[0],
        })
        const { canvas } = fakeCanvas()
        expect(() => drawWeek(canvas, bare)).not.toThrow()
    })
})
