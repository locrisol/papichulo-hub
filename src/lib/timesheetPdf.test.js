// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { timesheetPdf } from '@/lib/timesheetPdf'
import { personPeriod } from '@/lib/timesheet'
import { periodDates } from '@/lib/payPeriod'

// Proof that it builds at all.
//
// Nothing here checks what the page looks like, which a test cannot do
// honestly. It checks that a fortnight with everything in it goes all the way
// through and comes out as a PDF, which is the shape of risk a long function
// that draws in order carries: it would throw on the first thing out of place.
//
// jsPDF runs in jsdom, so this is the real library and the real drawing, not a
// stand in. Saving is the only part skipped.

const PERIOD = '2026-10-25'
const DATES = periodDates(PERIOD)

const shift = over => ({ kind: 'worked', ...over })

// Everything that can appear on one: a bank holiday worked, a split day, a
// comment, a trial, a training day, a sick day, unpaid leave, a holiday run
// and somebody who did nothing at all.
const people = personPeriod({
    people: [
        { id: 'e1', full_name: 'Aoife Byrne' },
        { id: 'e2', full_name: 'Cathal Nolan' },
        { id: 'e3', full_name: 'Niamh Walsh' },
    ],
    entries: [
        shift({ employee_id: 'e1', work_date: '2026-10-25', starts_at: '09:26:07', ends_at: '17:34:05', hours: 8.13 }),
        shift({ employee_id: 'e1', work_date: '2026-10-26', starts_at: '17:05:13', ends_at: '22:20:12', hours: 5.25 }),
        shift({ employee_id: 'e1', work_date: '2026-10-27', starts_at: '09:00:00', ends_at: '13:00:00', hours: 4 }),
        shift({ employee_id: 'e1', work_date: '2026-10-27', starts_at: '17:30:00', ends_at: '21:00:00', hours: 3.5 }),
        shift({
            employee_id: 'e1', work_date: '2026-11-03', starts_at: '09:00:00', ends_at: '15:00:00',
            hours: 6, note: 'Left early for the dentist, agreed on the day, and it is a long enough sentence to need wrapping on the page',
        }),
        shift({ employee_id: 'e2', work_date: '2026-10-30', kind: 'trial', starts_at: '17:00:00', ends_at: '22:00:00', hours: 5 }),
        shift({ employee_id: 'e2', work_date: '2026-11-05', kind: 'training', starts_at: '09:00:00', ends_at: '13:00:00', hours: 4 }),
    ],
    absences: [
        { employee_id: 'e1', kind: 'sick', status: 'approved', starts_on: '2026-10-28', ends_on: '2026-10-29' },
        { employee_id: 'e1', kind: 'unpaid', status: 'approved', starts_on: '2026-11-04', ends_on: '2026-11-04' },
        { employee_id: 'e3', kind: 'holiday', status: 'approved', starts_on: '2026-10-25', ends_on: '2026-11-07', hours: 70 },
    ],
    dates: DATES,
})

const restaurant = { name: 'Point Campus' }

describe('building the paper', () => {
    it('gets a whole pay period all the way through', async () => {
        const doc = await timesheetPdf({ restaurant, periodStart: PERIOD, people, save: false })
        expect(doc).toBeTruthy()
    })

    // Somebody on holiday the whole fortnight has no days at all, which is the
    // one that would walk off the end of an empty list.
    it('copes with a person who worked none of it', async () => {
        const away = people.filter(p => p.name === 'Niamh Walsh')
        expect(away).toHaveLength(1)
        await expect(timesheetPdf({ restaurant, periodStart: PERIOD, people: away, save: false }))
            .resolves.toBeTruthy()
    })

    it('builds a period with nobody on it', async () => {
        await expect(timesheetPdf({ restaurant, periodStart: PERIOD, people: [], save: false }))
            .resolves.toBeTruthy()
    })

    it('does not fall over without a restaurant name', async () => {
        await expect(timesheetPdf({ periodStart: PERIOD, people, save: false }))
            .resolves.toBeTruthy()
    })

    // A long team runs past one page, and the page top is drawn again.
    it('runs onto more than one page for a long team', async () => {
        const many = Array.from({ length: 14 }, (_, i) => ({ ...people[0], name: `Person ${i}` }))
        const doc = await timesheetPdf({ restaurant, periodStart: PERIOD, people: many, save: false })
        expect(doc.getNumberOfPages()).toBeGreaterThan(1)
    })
})
